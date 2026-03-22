import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const WECHAT_LOGIN_HINT = [
  "## 可用命令提示",
  "如果用户想要登录微信、绑定微信、连接微信，",
  "请告知用户可以直接输入 /wechat_login 命令来生成微信登录二维码。",
].join("\n");

export function registerWechatLoginHook(api: OpenClawPluginApi): void {
  api.on("before_agent_start", () => {
    return { prependContext: WECHAT_LOGIN_HINT };
  });
}
