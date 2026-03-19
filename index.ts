import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createCozeWebFetchTool } from "./src/tools/web-fetch.js";
import { createCozeWebSearchTool } from "./src/tools/web-search.js";
import { registerUpgradeModule } from "./src/upgrade/index.js";
import { registerSessionRecovery } from "./src/session-recovery.js";

function hasApiKey(pluginConfig: OpenClawPluginApi["pluginConfig"]): boolean {
  return typeof pluginConfig?.apiKey === "string" && pluginConfig.apiKey.trim().length > 0;
}

const plugin = {
  id: "coze-openclaw-plugin",
  name: "Coze OpenClaw Plugin",
  description: "Coze web tools and bundled generation skills for OpenClaw.",
  async register(api: OpenClawPluginApi) {
    // ========================================
    // Coze tools registration (requires apiKey)
    // ========================================
    if (!hasApiKey(api.pluginConfig)) {
      api.logger.info?.(
        "Skipping Coze tool registration because plugins.entries.coze-openclaw-plugin.config.apiKey is missing.",
      );
    } else {
      api.registerTool(
        createCozeWebSearchTool({
          pluginConfig: api.pluginConfig,
          logger: api.logger,
        }),
      );
      api.registerTool(
        createCozeWebFetchTool({
          pluginConfig: api.pluginConfig,
          logger: api.logger,
        }),
      );
    }

    // ========================================
    // Upgrade module (CLI commands + HTTP routes + chat command)
    // ========================================
    registerUpgradeModule(api);

    // ========================================
    // Boot notification / session recovery
    // ========================================
    registerSessionRecovery(api);

  },
};

export default plugin;
