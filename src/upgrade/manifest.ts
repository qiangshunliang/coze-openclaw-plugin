/**
 * Upgrade manifest types.
 *
 * A manifest is pushed by sandbox-gateway via CLI to each instance.
 * It contains an ordered list of upgrade modules to evaluate and execute.
 */

// ---------------------------------------------------------------------------
// appliesTo — version-based preconditions
// ---------------------------------------------------------------------------

export type AppliesTo = {
  /** Only apply if instance was created before this ISO date (e.g. "2026-03-15").
   *  Creation time is inferred from /workspace/projects/.gitignore birthtime. */
  createdBefore?: string;
  /** Only apply if OpenClaw core version < this value */
  coreVersionBefore?: string;
  /** Only apply if the coze-openclaw-plugin version < this value */
  pluginVersionBefore?: string;
};

// ---------------------------------------------------------------------------
// Conflict policies
// ---------------------------------------------------------------------------

/** `keep-user` skips if the user already customized the target path.
 *  `force` always executes regardless of user customizations. */
export type ConflictPolicy = "keep-user" | "force";

// ---------------------------------------------------------------------------
// Module types
// ---------------------------------------------------------------------------

export type ConfigPatchOp = {
  /** Dot-path into OpenClawConfig, e.g. "agents.defaults.memorySearch" */
  path: string;
  op: "set";
  value: unknown;
};

export type ConfigPatchModule = {
  id: string;
  type: "config-patch";
  patches: ConfigPatchOp[];
  appliesTo: AppliesTo;
  conflictPolicy: ConflictPolicy;
  description: string;
};

export type CustomShellModule = {
  id: string;
  type: "custom-shell";
  /** Shell command to execute */
  script: string;
  /** Timeout in ms, defaults to 120_000 */
  timeout?: number;
  appliesTo: AppliesTo;
  conflictPolicy: ConflictPolicy;
  description: string;
};

export type UpgradeModule = ConfigPatchModule | CustomShellModule;

// ---------------------------------------------------------------------------
// Manifest envelope
// ---------------------------------------------------------------------------

export type UpgradeManifest = {
  manifestVersion: string;
  modules: UpgradeModule[];
};

// ---------------------------------------------------------------------------
// Upgrade plan (generated after manifest evaluation)
// ---------------------------------------------------------------------------

export type SkippedModule = {
  module: UpgradeModule;
  reason: string;
  userValue?: unknown;
};

export type UpgradePlan = {
  manifestVersion: string;
  auto: UpgradeModule[];
  skipped: SkippedModule[];
};

// ---------------------------------------------------------------------------
// Execution results
// ---------------------------------------------------------------------------

export type UpgradeResult = {
  moduleId: string;
  status: "success" | "failed" | "skipped";
  description?: string;
  reason?: string;
  error?: string;
};
