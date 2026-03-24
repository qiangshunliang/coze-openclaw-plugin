/**
 * HTTP API routes for the upgrade module.
 *
 * Registered on the gateway HTTP server so the Web UI can query
 * upgrade status and trigger upgrades without CLI access.
 *
 * Routes:
 *   GET  /api/coze/upgrade/status  — current upgrade state
 *   POST /api/coze/upgrade/apply   — execute pending plan
 */

import type { ServerResponse } from "node:http";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { loadUpgradeState } from "./state.js";
import { executeUpgrade } from "./executor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// GET /api/coze/upgrade/status
// ---------------------------------------------------------------------------

async function handleGetStatus(
  _api: OpenClawPluginApi,
  res: ServerResponse,
): Promise<void> {
  const state = await loadUpgradeState();
  sendJson(res, 200, {
    hasPending: state.pendingPlan !== null,
    plan: state.pendingPlan
      ? {
          auto: state.pendingPlan.auto.map((m) => ({
            id: m.id,
            description: m.description,
            estimatedMs: m.estimatedMs ?? 0,
          })),
          skipped: state.pendingPlan.skipped.map((s) => ({
            id: s.module.id,
            description: s.module.description,
            reason: s.reason,
          })),
          estimatedMs: state.pendingPlan.auto.reduce((sum, m) => sum + (m.estimatedMs ?? 0), 0),
        }
      : null,
    lastManifestVersion: state.lastManifestVersion,
    lastCheckAt: state.lastCheckAt,
    appliedCount: state.appliedModules.length,
  });
}

// ---------------------------------------------------------------------------
// POST /api/coze/upgrade/apply
// ---------------------------------------------------------------------------

async function handlePostApply(
  api: OpenClawPluginApi,
  res: ServerResponse,
): Promise<void> {
  try {
    const results = await executeUpgrade(api);
    sendJson(res, 200, { results });
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerUpgradeRoutes(api: OpenClawPluginApi): void {
  api.registerHttpRoute({
    path: "/api/coze/upgrade",
    auth: "gateway",
    match: "prefix",
    handler: async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const subpath = url.pathname.replace(/^\/api\/coze\/upgrade\/?/, "");

      if (subpath === "status" && req.method === "GET") {
        await handleGetStatus(api, res);
        return true;
      }

      if (subpath === "apply" && req.method === "POST") {
        await handlePostApply(api, res);
        return true;
      }

      // Unknown sub-route or wrong method
      if (subpath === "apply") {
        sendJson(res, 405, { error: "Method not allowed" });
        return true;
      }

      // Not our route — let gateway continue
      return false;
    },
  });
}
