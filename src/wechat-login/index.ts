import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerWechatLoginCommand } from "./command.js";
import { registerWechatLoginHook } from "./hook.js";

export function registerWechatLogin(api: OpenClawPluginApi): void {
  registerWechatLoginCommand(api);
  registerWechatLoginHook(api);
}
