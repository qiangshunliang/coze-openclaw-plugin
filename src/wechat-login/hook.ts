import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const WECHAT_LOGIN_HINT = [
  "## 可用命令提示",
  "如果用户想要登录微信、绑定微信、连接微信，",
  "请告知用户可以直接输入 /wechat_login 命令来生成微信登录二维码。",
  "并提示用户：如果未安装微信插件，首次执行需要约 3 分钟（含安装）；已安装则约 1 分钟。",
].join("\n");

export function registerWechatLoginHook(api: OpenClawPluginApi): void {
  api.on("before_agent_start", () => {
    return { prependContext: WECHAT_LOGIN_HINT };
  });
}
