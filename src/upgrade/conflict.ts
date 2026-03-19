/**
 * Conflict detection for upgrade modules.
 *
 * Determines whether a module conflicts with the user's existing
 * configuration. Only `config-patch` modules can conflict — other
 * types are always treated as conflict-free.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";

import type { UpgradeModule } from "./manifest.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ConflictResult = {
  hasConflict: boolean;
  reason?: string;
  currentValue?: unknown;
};

// ---------------------------------------------------------------------------
// Deep path access
// ---------------------------------------------------------------------------

/**
 * Retrieve a nested value from an object using a dot-path string.
 * Returns undefined if any segment along the path is missing.
 */
export function getNestedValue(obj: unknown, dotPath: string): unknown {
  const segments = dotPath.split(".");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * Set a nested value on an object using a dot-path string.
 * Creates intermediate objects as needed.
 */
export function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current[seg] === undefined || current[seg] === null || typeof current[seg] !== "object") {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  current[last] = value;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a module conflicts with the current config.
 *
 * - `config-patch` with `keep-user`: conflict if the target path already
 *   has a user-defined value (not undefined).
 * - `plugin-update`, `custom-shell`: never conflict (they use `force`).
 */
export function detectConflict(
  mod: UpgradeModule,
  config: OpenClawConfig,
): ConflictResult {
  if (mod.type !== "config-patch") {
    return { hasConflict: false };
  }

  for (const patch of mod.patches) {
    const current = getNestedValue(config, patch.path);
    if (current !== undefined) {
      return {
        hasConflict: true,
        reason: `${patch.path} 已自定义`,
        currentValue: current,
      };
    }
  }

  return { hasConflict: false };
}
