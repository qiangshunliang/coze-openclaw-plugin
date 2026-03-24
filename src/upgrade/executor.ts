/**
 * Upgrade module executor.
 *
 * Executes each module type: config-patch, custom-shell.
 * Persists results incrementally to survive mid-upgrade crashes.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { UpgradeModule, UpgradeResult } from "./manifest.js";
import { setNestedValue, mergeNestedValue, detectConflict } from "./conflict.js";
import { matchesAppliesTo, readInstanceCreatedAt, type InstanceInfo } from "./applies-to.js";
import { loadUpgradeState, markModuleApplied, saveUpgradeState, appendToHistory } from "./state.js";

// ---------------------------------------------------------------------------
// Environment variable substitution
// ---------------------------------------------------------------------------

/**
 * Replace `${ENV_VAR}` placeholders with actual environment values.
 * Operates recursively on strings, arrays, and plain objects.
 */
function substituteEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (_match, varName: string) => {
      return process.env[varName] ?? "";
    });
  }
  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = substituteEnvVars(v);
    }
    return result;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Single module execution
// ---------------------------------------------------------------------------

async function executeModule(mod: UpgradeModule, api: OpenClawPluginApi): Promise<void> {
  switch (mod.type) {
    case "config-patch": {
      const cfg = await api.runtime.config.loadConfig();
      const mutable = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      for (const patch of mod.patches) {
        const resolved = substituteEnvVars(patch.value);
        if (patch.op === "merge") {
          if (!Array.isArray(resolved)) {
            throw new Error(`merge op requires an array value, got ${typeof resolved} at path "${patch.path}"`);
          }
          mergeNestedValue(mutable, patch.path, resolved);
        } else {
          setNestedValue(mutable, patch.path, resolved);
        }
      }
      await api.runtime.config.writeConfigFile(mutable as Parameters<typeof api.runtime.config.writeConfigFile>[0]);
      break;
    }

    case "custom-shell": {
      await api.runtime.system.runCommandWithTimeout(
        ["sh", "-c", mod.script],
        { timeoutMs: mod.timeout ?? 120_000 },
      );
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Full upgrade execution
// ---------------------------------------------------------------------------

/**
 * Execute all auto modules in the pending plan.
 * Skipped modules are recorded as-is. Each module is marked applied
 * immediately after execution to survive crashes.
 */
export async function executeUpgrade(api: OpenClawPluginApi): Promise<UpgradeResult[]> {
  const state = await loadUpgradeState();
  const plan = state.pendingPlan;
  if (!plan) {
    throw new Error("No pending upgrade plan");
  }

  const results: UpgradeResult[] = [];

  // Collect instance info once for appliesTo re-check
  const instanceInfo: InstanceInfo = {
    createdAt: await readInstanceCreatedAt(),
    coreVersion: api.runtime.version ?? null,
    pluginVersion: api.version ?? null,
  };

  // Execute auto modules
  for (const mod of plan.auto) {
    // Re-check appliesTo — versions may have changed between push and apply.
    if (!matchesAppliesTo(mod.appliesTo, instanceInfo)) {
      results.push({
        moduleId: mod.id,
        status: "skipped",
        description: mod.description,
        reason: "appliesTo 不再匹配（apply 时检测）",
      });
      await markModuleApplied(mod.id);
      continue;
    }

    // Re-check conflict — user may have customized config between push and apply.
    if (mod.conflictPolicy !== "force") {
      const conflict = detectConflict(mod, api.config);
      if (conflict.hasConflict) {
        results.push({
          moduleId: mod.id,
          status: "skipped",
          description: mod.description,
          reason: conflict.reason ?? "用户已自定义（apply 时检测）",
        });
        await markModuleApplied(mod.id);
        continue;
      }
    }

    try {
      await executeModule(mod, api);
      results.push({
        moduleId: mod.id,
        status: "success",
        description: mod.description,
      });
      await markModuleApplied(mod.id);
    } catch (err) {
      results.push({
        moduleId: mod.id,
        status: "failed",
        description: mod.description,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Record skipped modules
  for (const { module: mod, reason } of plan.skipped) {
    results.push({
      moduleId: mod.id,
      status: "skipped",
      description: mod.description,
      reason,
    });
    await markModuleApplied(mod.id);
  }

  // Clear pending plan and persist
  await saveUpgradeState({ ...state, pendingPlan: null });
  await appendToHistory(results);

  return results;
}
