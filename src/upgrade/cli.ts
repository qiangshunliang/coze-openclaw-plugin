/**
 * CLI commands for the upgrade module.
 *
 * Registered as `openclaw coze upgrade push-manifest|apply|status`.
 * sandbox-gateway pushes manifests via `openclaw coze upgrade push-manifest '<json>'`.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { UpgradeManifest, UpgradePlan } from "./manifest.js";
import { matchesAppliesTo, readInstanceCreatedAt, type InstanceInfo } from "./applies-to.js";
import { detectConflict } from "./conflict.js";
import { executeUpgrade } from "./executor.js";
import { loadUpgradeState, saveUpgradeState } from "./state.js";

// ---------------------------------------------------------------------------
// Collect instance info
// ---------------------------------------------------------------------------

async function collectInstanceInfo(api: OpenClawPluginApi): Promise<InstanceInfo> {
  return {
    createdAt: await readInstanceCreatedAt(),
    coreVersion: api.runtime.version ?? null,
    pluginVersion: api.version ?? null,
  };
}

// ---------------------------------------------------------------------------
// push-manifest
// ---------------------------------------------------------------------------

async function handlePushManifest(manifestJson: string, api: OpenClawPluginApi): Promise<void> {
  let manifest: UpgradeManifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    console.log(JSON.stringify({ status: "error", error: "Invalid manifest JSON" }));
    return;
  }

  const state = await loadUpgradeState();

  // Same manifest → no need to re-evaluate
  if (manifest.manifestVersion === state.lastManifestVersion) {
    if (state.pendingPlan) {
      // Plan already generated, waiting for user to apply
      const estimatedMs = state.pendingPlan.auto.reduce((sum, m) => sum + (m.estimatedMs ?? 0), 0);
      console.log(
        JSON.stringify({
          status: "plan-ready",
          auto: state.pendingPlan.auto.length,
          skipped: state.pendingPlan.skipped.length,
          estimatedMs,
        }),
      );
    } else {
      console.log(JSON.stringify({ status: "up-to-date" }));
    }
    return;
  }

  const instanceInfo = await collectInstanceInfo(api);

  // Filter: appliesTo match + not already applied
  const applicable = manifest.modules.filter(
    (m) => matchesAppliesTo(m.appliesTo, instanceInfo) && !state.appliedModules.includes(m.id),
  );

  if (applicable.length === 0) {
    await saveUpgradeState({
      ...state,
      lastManifestVersion: manifest.manifestVersion,
      lastCheckAt: new Date().toISOString(),
      pendingPlan: null,
    });
    console.log(JSON.stringify({ status: "no-applicable-modules" }));
    return;
  }

  // Build plan: classify into auto vs skipped
  const plan: UpgradePlan = {
    manifestVersion: manifest.manifestVersion,
    auto: [],
    skipped: [],
  };

  const config = api.config;
  for (const mod of applicable) {
    const conflict = detectConflict(mod, config);

    if (!conflict.hasConflict || mod.conflictPolicy === "force") {
      plan.auto.push(mod);
    } else {
      plan.skipped.push({
        module: mod,
        reason: conflict.reason ?? "用户已自定义",
        userValue: conflict.currentValue,
      });
    }
  }

  await saveUpgradeState({
    ...state,
    lastManifestVersion: manifest.manifestVersion,
    lastCheckAt: new Date().toISOString(),
    pendingPlan: plan,
  });

  const estimatedMs = plan.auto.reduce((sum, m) => sum + (m.estimatedMs ?? 0), 0);
  console.log(
    JSON.stringify({
      status: "plan-ready",
      auto: plan.auto.length,
      skipped: plan.skipped.length,
      estimatedMs,
    }),
  );
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

async function handleApply(api: OpenClawPluginApi): Promise<void> {
  try {
    const results = await executeUpgrade(api);
    console.log(JSON.stringify({ status: "done", results }));
  } catch (err) {
    console.log(
      JSON.stringify({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function handleStatus(): Promise<void> {
  const state = await loadUpgradeState();
  console.log(
    JSON.stringify({
      lastManifestVersion: state.lastManifestVersion,
      lastCheckAt: state.lastCheckAt,
      hasPending: state.pendingPlan !== null,
      pendingAuto: state.pendingPlan?.auto.length ?? 0,
      pendingSkipped: state.pendingPlan?.skipped.length ?? 0,
      appliedCount: state.appliedModules.length,
    }),
  );
}

// ---------------------------------------------------------------------------
// CLI registration
// ---------------------------------------------------------------------------

export function registerUpgradeCli(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program }) => {
      const coze = program.command("coze").description("Coze OpenClaw 集成命令");
      const upgrade = coze.command("upgrade").description("升级管理");

      upgrade
        .command("push-manifest")
        .description("接收并处理升级 manifest（由 sandbox-gateway 调用）")
        .argument("<manifest>", "Manifest JSON 字符串")
        .action(async (manifest: string) => {
          await handlePushManifest(manifest, api);
        });

      upgrade
        .command("apply")
        .description("执行待处理的升级计划")
        .action(async () => {
          await handleApply(api);
        });

      upgrade
        .command("status")
        .description("查看当前升级状态")
        .action(async () => {
          await handleStatus();
        });
    },
    { commands: ["coze"] },
  );
}
