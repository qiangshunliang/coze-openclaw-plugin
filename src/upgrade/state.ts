/**
 * Upgrade state persistence.
 *
 * Stores applied module IDs, pending plans, and last manifest version
 * in ~/.openclaw/upgrade/state.json. History is appended to history.jsonl.
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { UpgradePlan, UpgradeResult } from "./manifest.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function upgradeDir(): string {
  return path.join(os.homedir(), ".openclaw", "upgrade");
}

function statePath(): string {
  return path.join(upgradeDir(), "state.json");
}

function historyPath(): string {
  return path.join(upgradeDir(), "history.jsonl");
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type UpgradeState = {
  lastManifestVersion: string | null;
  lastCheckAt: string | null;
  appliedModules: string[];
  pendingPlan: UpgradePlan | null;
};

const EMPTY_STATE: UpgradeState = {
  lastManifestVersion: null,
  lastCheckAt: null,
  appliedModules: [],
  pendingPlan: null,
};

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export async function loadUpgradeState(): Promise<UpgradeState> {
  try {
    const raw = await readFile(statePath(), "utf-8");
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function saveUpgradeState(state: UpgradeState): Promise<void> {
  const dir = upgradeDir();
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(), JSON.stringify(state, null, 2) + "\n");
}

/** Mark a single module as applied (persists immediately to survive crashes). */
export async function markModuleApplied(moduleId: string): Promise<void> {
  const state = await loadUpgradeState();
  if (!state.appliedModules.includes(moduleId)) {
    state.appliedModules.push(moduleId);
    await saveUpgradeState(state);
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function appendToHistory(results: UpgradeResult[]): Promise<void> {
  if (results.length === 0) return;
  const dir = upgradeDir();
  await mkdir(dir, { recursive: true });
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    results,
  });
  await appendFile(historyPath(), entry + "\n");
}
