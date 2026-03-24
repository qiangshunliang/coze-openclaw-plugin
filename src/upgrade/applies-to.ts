/**
 * appliesTo condition matching.
 *
 * Determines whether a module should be evaluated for a given instance.
 * Conditions:
 * - `createdBefore`: instance creation date (from /workspace/projects/.gitignore birthtime)
 * - `coreVersionBefore` / `pluginVersionBefore`: version-based checks
 */

import { stat } from "node:fs/promises";

import type { AppliesTo } from "./manifest.js";

/** Path used to infer instance creation time via mtime.
 *  cloud-init writes /etc/hostname during first-boot initialization,
 *  and it is not modified on subsequent reboots — its mtime reliably
 *  reflects the ECS instance creation time. */
export const INSTANCE_MARKER_PATH = "/etc/hostname";

// ---------------------------------------------------------------------------
// Instance info collected at runtime
// ---------------------------------------------------------------------------

export type InstanceInfo = {
  /** Instance creation time (ISO string), from marker file birthtime */
  createdAt: string | null;
  /** OpenClaw core version from runtime */
  coreVersion: string | null;
  /** coze-openclaw-plugin version */
  pluginVersion: string | null;
};

// ---------------------------------------------------------------------------
// Collect instance info
// ---------------------------------------------------------------------------

/**
 * Read the mtime of the cloud-init boot-finished marker to determine
 * when the instance was created. Returns null if the file doesn't
 * exist or stat fails.
 */
export async function readInstanceCreatedAt(): Promise<string | null> {
  try {
    const s = await stat(INSTANCE_MARKER_PATH);
    return s.mtime.toISOString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Semver-ish comparison
// ---------------------------------------------------------------------------

/**
 * Compare two version strings using a simplified semver/calver comparison.
 * Splits on `.` and `-`, compares segments numerically when possible,
 * falls back to lexicographic comparison for non-numeric segments.
 *
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => v.split(/[.\-]/);
  const partsA = split(a);
  const partsB = split(b);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const sa = partsA[i] ?? "0";
    const sb = partsB[i] ?? "0";
    const na = Number(sa);
    const nb = Number(sb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Returns true if `current` is strictly before `threshold` (version comparison).
 */
function isVersionBefore(current: string | null, threshold: string | undefined): boolean {
  if (threshold === undefined) return true; // no constraint
  if (current === null) return true; // unknown → assume old → matches
  return compareVersions(current, threshold) < 0;
}

/**
 * Returns true if `createdAt` is strictly before the `threshold` date.
 * Both are ISO date strings (e.g. "2026-03-15" or full ISO timestamp).
 */
function isDateBefore(createdAt: string | null, threshold: string | undefined): boolean {
  if (threshold === undefined) return true; // no constraint
  if (createdAt === null) return true; // unknown → assume old → matches
  return new Date(createdAt) < new Date(threshold);
}

// ---------------------------------------------------------------------------
// Main matcher
// ---------------------------------------------------------------------------

/**
 * Check whether all appliesTo conditions are satisfied for the given instance.
 * A module with no conditions (empty appliesTo) always matches.
 */
export function matchesAppliesTo(appliesTo: AppliesTo | undefined, info: InstanceInfo): boolean {
  if (!appliesTo) return true;
  if (!isDateBefore(info.createdAt, appliesTo.createdBefore)) return false;
  if (!isVersionBefore(info.coreVersion, appliesTo.coreVersionBefore)) return false;
  if (!isVersionBefore(info.pluginVersion, appliesTo.pluginVersionBefore)) return false;
  return true;
}
