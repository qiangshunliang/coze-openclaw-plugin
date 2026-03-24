/**
 * Upgrade module executor.
 *
 * Executes each module type: config-patch, custom-shell.
 * Persists results incrementally to survive mid-upgrade crashes.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { UpgradeModule, UpgradeResult } from "./manifest.js";
import { setNestedValue, mergeNestedValue, detectConflict } from "./conflict.js";
import { matchesAppliesTo, readInstanceCreatedAt, readCoreVersion, type InstanceInfo } from "./applies-to.js";
import { loadUpgradeState, markModuleApplied, saveUpgradeState, appendToHistory } from "./state.js";

// ---------------------------------------------------------------------------
// Single module execution
// ---------------------------------------------------------------------------

/**
 * Apply config patches onto a mutable config object (in-memory only).
 * The caller is responsible for loading and writing the config file.
 */
function applyConfigPatches(mod: UpgradeModule & { type: "config-patch" }, mutable: Record<string, unknown>): void {
  for (const patch of mod.patches) {
    if (patch.op === "merge") {
      if (!Array.isArray(patch.value)) {
        throw new Error(`merge op requires an array value, got ${typeof patch.value} at path "${patch.path}"`);
      }
      mergeNestedValue(mutable, patch.path, patch.value as unknown[]);
    } else {
      setNestedValue(mutable, patch.path, patch.value);
    }
  }
}

async function executeShellModule(mod: UpgradeModule & { type: "custom-shell" }, api: OpenClawPluginApi): Promise<void> {
  await api.runtime.system.runCommandWithTimeout(
    ["sh", "-c", mod.script],
    { timeoutMs: mod.timeout ?? 120_000 },
  );
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
  console.error("[upgrade-executor] v0.1.13 — substituteEnvVars removed");
  const state = await loadUpgradeState();
  const plan = state.pendingPlan;
  if (!plan) {
    throw new Error("No pending upgrade plan");
  }

  const results: UpgradeResult[] = [];

  // Collect instance info once for appliesTo re-check
  const instanceInfo: InstanceInfo = {
    createdAt: await readInstanceCreatedAt(),
    coreVersion: readCoreVersion(api),
    pluginVersion: api.version ?? null,
  };

  // -------------------------------------------------------------------------
  // Phase 1: Collect all config-patch modules, apply them in one batch
  // -------------------------------------------------------------------------
  const configPatchMods: Array<UpgradeModule & { type: "config-patch" }> = [];
  const shellMods: Array<UpgradeModule & { type: "custom-shell" }> = [];

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

    if (mod.type === "config-patch") {
      configPatchMods.push(mod);
    } else {
      shellMods.push(mod);
    }
  }

  // Batch all config-patch modules: single load → all patches → single write
  if (configPatchMods.length > 0) {
    try {
      const cfg = await api.runtime.config.loadConfig();
      const mutable = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      for (const mod of configPatchMods) {
        applyConfigPatches(mod, mutable);
      }
      await api.runtime.config.writeConfigFile(mutable as Parameters<typeof api.runtime.config.writeConfigFile>[0]);
      for (const mod of configPatchMods) {
        results.push({
          moduleId: mod.id,
          status: "success",
          description: mod.description,
        });
        await markModuleApplied(mod.id);
      }
    } catch (err) {
      for (const mod of configPatchMods) {
        results.push({
          moduleId: mod.id,
          status: "failed",
          description: mod.description,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Execute shell modules sequentially
  for (const mod of shellMods) {
    try {
      await executeShellModule(mod, api);
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
