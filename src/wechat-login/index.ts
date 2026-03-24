import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerWechatLoginCommand } from "./command.js";

export function registerWechatLogin(api: OpenClawPluginApi): void {
  registerWechatLoginCommand(api);
}
