import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const QR_IMAGE_PATH = "/workspace/projects/workspace/weixin_qrcode.png";

const INSTRUCTIONS_TEXT = `请扫描这个二维码完成微信绑定

**📌 绑定流程说明：**

1. **扫码**：打开微信 App，扫描上方的二维码
2. **确认授权**：在微信中确认登录授权
3. **等待生效**：绑定成功后，系统会自动重启网关（需要 1-5 分钟）
4. **开始使用**：生效后，你就可以通过微信与 OpenClaw 对话了

**⏰ 重要提示：**
- 二维码有效期约 **5 分钟**，过期请重新生成
- 绑定成功后，网关会自动重启，期间服务可能会短暂中断`;

function formatWebchatMessage(base64: string): string {
  return `微信登录二维码已经生成好了！请使用微信扫描下方的二维码完成绑定：

![微信登录二维码](data:image/png;base64,${base64})

${INSTRUCTIONS_TEXT}

请在微信中完成扫码确认！`;
}

export function registerWechatLoginCommand(api: OpenClawPluginApi): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(scriptDir, "wx_qr.py");

  api.registerCommand({
    name: "wechat_login",
    description: "🔐 微信登录 - 生成微信扫码登录二维码",
    handler: async (ctx) => {
      try {
        await execFileAsync("python3", [scriptPath], { timeout: 120_000 });

        if (ctx.channel === "webchat") {
          const imageBuffer = await readFile(QR_IMAGE_PATH);
          const base64 = imageBuffer.toString("base64");
          return { text: formatWebchatMessage(base64) };
        }

        // feishu 等其他渠道: 通过 mediaUrl 发送图片文件
        return {
          text: INSTRUCTIONS_TEXT,
          mediaUrl: QR_IMAGE_PATH,
        };
      } catch (err) {
        return {
          text: `微信登录失败: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  });
}
