import { describe, expect, it, vi } from "vitest";
import plugin from "../index.js";

function createApi(pluginConfig: Record<string, unknown>) {
  return {
    id: "coze-openclaw-plugin",
    name: "Coze OpenClaw Plugin",
    description: "Coze OpenClaw",
    source: "test",
    config: {},
    pluginConfig,
    runtime: {} as never,
    logger: {
      debug() {},
      info: vi.fn(),
      warn() {},
      error() {},
    },
    registerTool: vi.fn(),
    registerHook() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerCommand() {},
    registerContextEngine() {},
    resolvePath(input: string) {
      return input;
    },
    on() {},
  };
}

describe("plugin registration", () => {
  it("skips tool registration when apiKey is missing", () => {
    const api = createApi({});

    plugin.register?.(api);

    expect(api.registerTool).not.toHaveBeenCalled();
    expect(api.logger.info).toHaveBeenCalledWith(
      "Skipping Coze tool registration because plugins.entries.coze-openclaw-plugin.config.apiKey is missing.",
    );
  });

  it("registers coze web tools when apiKey exists", () => {
    const api = createApi({ apiKey: "test-key" });

    plugin.register?.(api);

    expect(api.registerTool).toHaveBeenCalledTimes(2);
    const toolNames = api.registerTool.mock.calls
      .map((call) => {
        const tool = call[0];
        return typeof tool === "function" ? undefined : tool.name;
      })
      .filter(Boolean);
    expect(toolNames).toEqual(["coze_web_search", "coze_web_fetch"]);
  });
});
