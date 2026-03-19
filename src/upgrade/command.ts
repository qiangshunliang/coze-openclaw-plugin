/**
 * /coze_update chat command.
 *
 * Lets users view the pending upgrade plan and trigger execution
 * directly from chat.
 *
 * Usage:
 *   /coze_update          — show current upgrade plan
 *   /coze_update apply    — execute the pending upgrade
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { loadUpgradeState } from "./state.js";
import { executeUpgrade } from "./executor.js";
import type { UpgradeResult } from "./manifest.js";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

async function formatPlanSummary(): Promise<{ text: string }> {
  const state = await loadUpgradeState();
  const plan = state.pendingPlan;
  if (!plan) {
    return { text: "当前没有待执行的升级计划。" };
  }

  const lines: string[] = [];
  lines.push(`📦 升级计划 (manifest ${plan.manifestVersion})`);
  lines.push("");

  if (plan.auto.length > 0) {
    lines.push(`✅ 将自动执行 (${plan.auto.length} 项):`);
    for (const mod of plan.auto) {
      lines.push(`  • ${mod.description} [${mod.id}]`);
    }
    lines.push("");
  }

  if (plan.skipped.length > 0) {
    lines.push(`⏭ 因冲突跳过 (${plan.skipped.length} 项):`);
    for (const s of plan.skipped) {
      lines.push(`  • ${s.module.description} — ${s.reason}`);
    }
    lines.push("");
  }

  lines.push("输入 /coze_update apply 执行升级。");

  return { text: lines.join("\n") };
}

function formatResults(results: UpgradeResult[]): string {
  const lines: string[] = [];
  lines.push("升级执行完成：");
  lines.push("");

  for (const r of results) {
    const icon = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭" : "❌";
    let line = `${icon} ${r.description ?? r.moduleId} — ${r.status}`;
    if (r.reason) line += ` (${r.reason})`;
    if (r.error) line += ` (${r.error})`;
    lines.push(line);
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  lines.push("");
  lines.push(`合计: ${succeeded} 成功, ${failed} 失败, ${skipped} 跳过`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerUpgradeCommand(api: OpenClawPluginApi): void {
  api.registerCommand({
    name: "coze_update",
    description: "🌟 版本升级 - 查看并执行 OpenClaw 升级计划",
    acceptsArgs: true,
    handler: async (ctx) => {
      const action = ctx.args?.trim().toLowerCase() ?? "";

      if (action === "apply") {
        const state = await loadUpgradeState();
        if (!state.pendingPlan) {
          return { text: "当前没有待执行的升级计划。" };
        }

        try {
          const results = await executeUpgrade(api);
          return { text: formatResults(results) };
        } catch (err) {
          return {
            text: `升级执行失败: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      }

      // Default: show plan summary
      return formatPlanSummary();
    },
  });
}
