/**
 * Upgrade module registration entry point.
 *
 * Wires up CLI commands, HTTP routes, and chat command for the upgrade system.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { registerUpgradeCli } from "./cli.js";
import { registerUpgradeRoutes } from "./routes.js";
import { registerUpgradeCommand } from "./command.js";

export function registerUpgradeModule(api: OpenClawPluginApi): void {
  registerUpgradeCli(api);
  registerUpgradeRoutes(api);
  registerUpgradeCommand(api);
}
