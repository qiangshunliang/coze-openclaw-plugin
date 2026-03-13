import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CozeConfig } from "coze-coding-dev-sdk";
import JSON5 from "json5";

type CozePluginConfig = {
  apiKey?: unknown;
  baseUrl?: unknown;
  modelBaseUrl?: unknown;
  retryTimes?: unknown;
  retryDelay?: unknown;
  timeout?: unknown;
};

type OpenClawConfigFile = {
  plugins?: {
    entries?: Record<
      string,
      {
        config?: CozePluginConfig;
      }
    >;
  };
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
  return home || os.homedir();
}

function expandHomeDir(rawPath: string, env: NodeJS.ProcessEnv): string {
  if (rawPath === "~") {
    return resolveHomeDir(env);
  }
  if (rawPath.startsWith("~/") || rawPath.startsWith("~\\")) {
    return path.join(resolveHomeDir(env), rawPath.slice(2));
  }
  return rawPath;
}

export function resolveOpenClawConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicitPath = env.OPENCLAW_CONFIG_PATH?.trim() || env.CLAWDBOT_CONFIG_PATH?.trim();
  if (explicitPath) {
    return path.resolve(expandHomeDir(explicitPath, env));
  }

  const stateDir = env.OPENCLAW_STATE_DIR?.trim();
  if (stateDir) {
    return path.resolve(expandHomeDir(path.join(stateDir, "openclaw.json"), env));
  }

  return path.join(resolveHomeDir(env), ".openclaw", "openclaw.json");
}

function resolveEnvTemplate(value: string, env: NodeJS.ProcessEnv): string | undefined {
  const pattern = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  let missing = false;
  const resolved = value.replace(pattern, (_match, envName: string) => {
    const envValue = env[envName]?.trim();
    if (!envValue) {
      missing = true;
      return "";
    }
    return envValue;
  });
  if (missing && !resolved.trim()) {
    return undefined;
  }
  return resolved.trim() ? resolved : undefined;
}

function normalizePluginConfigFromFile(
  value: CozePluginConfig | undefined,
  env: NodeJS.ProcessEnv,
): CozePluginConfig | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const maybeResolveString = (input: unknown): string | undefined => {
    if (typeof input !== "string") {
      return undefined;
    }
    return resolveEnvTemplate(input, env) ?? readString(input);
  };

  return {
    apiKey: maybeResolveString(value.apiKey),
    baseUrl: maybeResolveString(value.baseUrl),
    modelBaseUrl: maybeResolveString(value.modelBaseUrl),
    retryTimes:
      typeof value.retryTimes === "string"
        ? maybeResolveString(value.retryTimes)
        : value.retryTimes,
    retryDelay:
      typeof value.retryDelay === "string"
        ? maybeResolveString(value.retryDelay)
        : value.retryDelay,
    timeout: typeof value.timeout === "string" ? maybeResolveString(value.timeout) : value.timeout,
  };
}

export async function loadCozePluginConfigFromOpenClawConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CozePluginConfig | undefined> {
  const configPath = resolveOpenClawConfigPath(env);

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON5.parse(content) as OpenClawConfigFile;
    const pluginConfig = parsed.plugins?.entries?.["coze-openclaw-plugin"]?.config;
    return normalizePluginConfigFromFile(pluginConfig, env);
  } catch {
    return undefined;
  }
}

export function resolveCozeClientConfig(
  pluginConfig?: CozePluginConfig,
  env: NodeJS.ProcessEnv = process.env,
): CozeConfig {
  return {
    apiKey: readString(pluginConfig?.apiKey),
    baseUrl: readString(pluginConfig?.baseUrl),
    modelBaseUrl: readString(pluginConfig?.modelBaseUrl),
    retryTimes: readNumber(pluginConfig?.retryTimes),
    retryDelay: readNumber(pluginConfig?.retryDelay),
    timeout: readNumber(pluginConfig?.timeout),
  };
}

export function getMissingCozeConfigMessage(): string {
  return "Coze API key missing. Set plugins.entries.coze-openclaw-plugin.config.apiKey.";
}
