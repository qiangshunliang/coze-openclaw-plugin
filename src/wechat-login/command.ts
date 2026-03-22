import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { exec, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const QR_IMAGE_PATH = "/workspace/projects/workspace/weixin_qrcode.png";

const INSTRUCTIONS_TEXT = `请扫描这个二维码完成微信绑定

**📌 绑定流程说明：**

1. **扫码**：打开微信 App，扫描上方的二维码
2. **确认授权**：在微信中确认登录授权
3. **开始使用**：生效后，你就可以通过微信与 OpenClaw 对话了

**⏰ 重要提示：**
- 二维码有效期约 **5 分钟**，过期请重新生成
- 绑定成功后，网关会自动重启，期间服务可能会短暂中断`;

function formatWebchatMessage(base64: string): string {
  return `微信登录二维码已经生成好了！请使用微信扫描下方的二维码完成绑定：

![微信登录二维码](data:image/png;base64,${base64})

${INSTRUCTIONS_TEXT}

请在微信中完成扫码确认！`;
}

/**
 * 通过 openclaw message send 命令发送媒体文件到渠道
 */
async function sendMediaViaChannel(
  channel: string,
  to: string,
  mediaPath: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  // 规范化 target：如果包含冒号，取冒号后面的部分
  const normalizedTo = to.includes(":") ? to.split(":").pop()! : to;

  // 构建命令
  let cmd = `openclaw message send --channel ${channel} --target "${normalizedTo}" --media "${mediaPath}"`;
  if (message) {
    cmd += ` --message "${message.replace(/"/g, '\\"')}"`;
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      env: { ...process.env },
      timeout: 30_000,
    });

    if (stdout.includes("Sent via")) {
      return { success: true };
    }

    // 如果没有明确的成功标记，检查是否有错误
    if (stderr && stderr.includes("error")) {
      return { success: false, error: stderr };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function registerWechatLoginCommand(api: OpenClawPluginApi): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(scriptDir, "wx_qr.py");

  api.registerCommand({
    name: "wechat_login",
    description: "🔐 微信登录 - 生成微信扫码登录二维码",
    handler: async (ctx) => {
      // 调试：打印 ctx 内容
      api.logger.info?.(`wechat_login ctx: channel=${ctx.channel}, to=${ctx.to}, from=${ctx.from}, senderId=${ctx.senderId}`);

      try {
        await execFileAsync("python3", [scriptPath], { timeout: 300_000 });

        // webchat 渠道：返回 base64 嵌入的图片
        if (ctx.channel === "webchat") {
          const imageBuffer = await readFile(QR_IMAGE_PATH);
          const base64 = imageBuffer.toString("base64");
          return { text: formatWebchatMessage(base64) };
        }

        // 其他渠道（feishu/dingtalk 等）：使用 openclaw message send 发送媒体文件
        // ctx.to 是发送目标，ctx.channel 是渠道名
        if (ctx.to) {
          const result = await sendMediaViaChannel(
            ctx.channel,
            ctx.to,
            QR_IMAGE_PATH,
            INSTRUCTIONS_TEXT
          );

          if (result.success) {
            return {
              text: "✅ 微信登录二维码已发送，请查收并扫码完成绑定。",
            };
          }

          // 发送失败，回退到文字提示
          return {
            text: `⚠️ 二维码发送失败: ${result.error}\n\n${INSTRUCTIONS_TEXT}\n\n请尝试在 Web 界面执行此命令。`,
            isError: true,
          };
        }

        // 兜底：没有 to 信息时返回文字提示
        return {
          text: INSTRUCTIONS_TEXT + "\n\n⚠️ 无法获取发送目标，请在 Web 界面执行此命令以获取二维码。",
        };
      } catch (err) {
        return {
          text: "⚠️ 检测到微信插件未安装，已自动触发安装。请再次执行 /wechat_login 命令登录。",
        };
      }
    },
  });
}
