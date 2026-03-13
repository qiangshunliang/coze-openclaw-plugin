import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadCozePluginConfigFromOpenClawConfig,
  resolveCozeClientConfig,
  resolveOpenClawConfigPath,
} from "./config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveCozeClientConfig", () => {
  it("reads values from plugin config", () => {
    const result = resolveCozeClientConfig(
      {
        apiKey: "plugin-key",
        baseUrl: "https://plugin.example.com",
        modelBaseUrl: "https://plugin-model.example.com",
        timeout: 3000,
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(result).toMatchObject({
      apiKey: "plugin-key",
      baseUrl: "https://plugin.example.com",
      modelBaseUrl: "https://plugin-model.example.com",
      timeout: 3000,
    });
  });

  it("does not fall back to environment variables", () => {
    const result = resolveCozeClientConfig({}, {
      COZE_API_KEY: "env-key",
      COZE_BASE_URL: "https://env.example.com",
      COZE_MODEL_BASE_URL: "https://env-model.example.com",
      COZE_RETRY_TIMES: "3",
      COZE_RETRY_DELAY: "100",
      COZE_TIMEOUT: "3000",
    } as NodeJS.ProcessEnv);

    expect(result).toEqual({
      apiKey: undefined,
      baseUrl: undefined,
      modelBaseUrl: undefined,
      retryTimes: undefined,
      retryDelay: undefined,
      timeout: undefined,
    });
  });

  it("resolves the OpenClaw config path from OPENCLAW_CONFIG_PATH", () => {
    expect(
      resolveOpenClawConfigPath({
        OPENCLAW_CONFIG_PATH: "~/custom/openclaw.json",
        HOME: "/tmp/example-home",
      } as NodeJS.ProcessEnv),
    ).toBe(path.join("/tmp/example-home", "custom", "openclaw.json"));
  });

  it("loads plugin config from the OpenClaw config file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coze-openclaw-plugin-config-"));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, "openclaw.json");

    await fs.writeFile(
      configPath,
      `{
        plugins: {
          entries: {
            "coze-openclaw-plugin": {
              config: {
                apiKey: "plugin-key",
                baseUrl: "https://plugin.example.com",
              },
            },
          },
        },
      }`,
      "utf-8",
    );

    const result = await loadCozePluginConfigFromOpenClawConfig({
      OPENCLAW_CONFIG_PATH: configPath,
    } as NodeJS.ProcessEnv);

    expect(result).toEqual({
      apiKey: "plugin-key",
      baseUrl: "https://plugin.example.com",
      modelBaseUrl: undefined,
      retryTimes: undefined,
      retryDelay: undefined,
      timeout: undefined,
    });
  });

  it("resolves env templates from the OpenClaw config file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coze-openclaw-plugin-config-"));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, "openclaw.json");

    await fs.writeFile(
      configPath,
      `{
        plugins: {
          entries: {
            "coze-openclaw-plugin": {
              config: {
                apiKey: "\${COZE_WORKLOAD_IDENTITY_API_KEY}",
              },
            },
          },
        },
      }`,
      "utf-8",
    );

    const result = await loadCozePluginConfigFromOpenClawConfig({
      OPENCLAW_CONFIG_PATH: configPath,
      COZE_WORKLOAD_IDENTITY_API_KEY: "workload-key",
    } as NodeJS.ProcessEnv);

    expect(result?.apiKey).toBe("workload-key");
  });
});
