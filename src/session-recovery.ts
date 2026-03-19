import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createReadStream } from "node:fs";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionEntry {
  deliveryContext?: {
    channel?: string;
    to?: string;
    accountId?: string;
  };
  sessionFile?: string;
  sessionId?: string;
}

interface SessionStore {
  [sessionKey: string]: SessionEntry;
}

interface TranscriptMessage {
  type: string;
  id?: string;
  message?: {
    role: string;
    content?: any[];
    stopReason?: string;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGE = "服务重启完成，正在继续处理你的任务...";

export function registerSessionRecovery(api: OpenClawPluginApi): void {
  const message = DEFAULT_MESSAGE;
  const continueTask = true;
  const { runtime } = api;

  api.on("gateway_start", async (event, ctx) => {
    api.logger.info?.("Gateway started, checking for interrupted sessions...");

    try {
      // 1. Resolve session store path
      let basePath: string;

      if (runtime.resolvePath) {
        basePath = runtime.resolvePath("agents/main/sessions");
      } else if (process.env.OPENCLAW_STATE_DIR) {
        basePath = path.join(process.env.OPENCLAW_STATE_DIR, "agents/main/sessions");
      } else if (api.config?.agents?.defaults?.workspace) {
        const workspaceDir = api.config.agents.defaults.workspace;
        const projectRoot = path.dirname(workspaceDir);
        basePath = path.join(projectRoot, "agents/main/sessions");
      } else {
        basePath = "/workspace/projects/agents/main/sessions";
      }

      const storePath = path.join(basePath, "sessions.json");

      // 2. Read session store
      let store: SessionStore;
      try {
        const raw = await fs.readFile(storePath, "utf-8");
        store = JSON.parse(raw);
      } catch (error) {
        api.logger.warn?.(`Failed to read session store: ${error}`);
        return;
      }

      // 3. Check each session for interruption
      const sessionKeys = Object.keys(store);
      api.logger.info?.(`Checking ${sessionKeys.length} sessions for interruptions...`);

      let recoveredCount = 0;

      for (const sessionKey of sessionKeys) {
        const entry = store[sessionKey];
        const dc = entry?.deliveryContext;

        if (!dc?.channel || !dc?.to) {
          continue;
        }

        // Use sessionFile from entry (absolute path to .jsonl file)
        let transcriptPath: string;
        if (entry?.sessionFile) {
          transcriptPath = entry.sessionFile;
        } else {
          // Fall back: extract session ID from sessionKey and construct path
          const sessionId = sessionKey.split(":").pop();
          if (!sessionId) continue;
          transcriptPath = path.join(basePath, `${sessionId}.jsonl`);
        }

        try {
          const result = await checkIfInterrupted(transcriptPath, api.logger);

          if (result.interrupted) {
            api.logger.info?.(`Session ${sessionKey} was interrupted (${result.reason}), recovering...`);

            // Step 1: Send notification message
            await sendMessageViaCLI(dc.channel, dc.to, message, api.logger);
            api.logger.info?.(`✓ Recovery notification sent to ${sessionKey}`);

            // Step 2: Continue the interrupted task via openclaw agent
            if (continueTask && entry?.sessionId) {
              await continueAgentTask(entry.sessionId, api.logger);
              api.logger.info?.(`✓ Agent task continued for session ${entry.sessionId}`);
            }

            recoveredCount++;
          }
        } catch (error) {
          api.logger.error?.(`Failed to recover session ${sessionKey}: ${error}`);
        }
      }

      if (recoveredCount > 0) {
        api.logger.info?.(`Boot notification completed: ${recoveredCount} interrupted sessions recovered`);
      } else {
        api.logger.info?.("No interrupted sessions found");
      }
    } catch (error) {
      api.logger.error?.(`Error in gateway_start hook: ${error}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function checkIfInterrupted(transcriptPath: string, logger?: any): Promise<{ interrupted: boolean; reason: string }> {
  const lastLines = await readLastLines(transcriptPath, 20);

  if (lastLines.length === 0) {
    return { interrupted: false, reason: "empty transcript" };
  }

  const messages: TranscriptMessage[] = [];
  for (const line of lastLines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "message" && obj.message?.role) {
        messages.push(obj);
      }
    } catch {
      // Skip invalid lines
    }
  }

  if (messages.length === 0) {
    return { interrupted: false, reason: "no messages" };
  }

  const lastMessage = messages[messages.length - 1];
  const lastRole = lastMessage.message?.role;
  const stopReason = lastMessage.message?.stopReason;

  logger?.debug?.(`Last message: role=${lastRole}, stopReason=${stopReason}`);

  if (lastRole === "user") {
    return { interrupted: true, reason: "user message without assistant reply" };
  }

  if (lastRole === "assistant" && stopReason === "toolUse") {
    return { interrupted: true, reason: "assistant toolCall without toolResult" };
  }

  if (lastRole === "assistant" && stopReason === "stop") {
    return { interrupted: false, reason: "assistant completed normally" };
  }

  return { interrupted: false, reason: `last role=${lastRole}, stopReason=${stopReason}` };
}

async function readLastLines(filePath: string, lineCount: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    const allLines: string[] = [];

    rl.on('line', (line) => {
      allLines.push(line);
      if (allLines.length > lineCount * 2) {
        allLines.shift();
      }
    });

    rl.on('close', () => {
      resolve(allLines.slice(-lineCount));
    });

    rl.on('error', reject);
  });
}

async function sendMessageViaCLI(
  channel: string,
  to: string,
  message: string,
  logger?: any
): Promise<void> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const normalizedTo = to.includes(':') ? to.split(':').pop() : to;

  const cmd = `openclaw message send --channel ${channel} --target "${normalizedTo}" --message "${message.replace(/"/g, '\\"')}"`;

  const { stdout } = await execAsync(cmd, { env: { ...process.env } });

  if (stdout.includes("Sent via")) {
    logger?.debug?.(`Message sent successfully via ${channel}`);
  }
}

/**
 * Continue agent task using OpenClaw CLI (runs in background)
 *
 * Note: We don't use --deliver flag here because:
 * 1. We already sent a recovery notification message
 * 2. The agent will decide itself whether to send messages via message tool
 * 3. Using --deliver would cause delivery-mirror to auto-send assistant's reply, resulting in duplicate messages
 */
async function continueAgentTask(sessionId: string, logger?: any): Promise<void> {
  const { spawn } = await import("child_process");

  const query = "已完成重启，继续完成之前的任务。注意这里给用户推送消息用 message tool";
  const args = [
    "agent",
    "--session-id", sessionId,
    "--message", query,
    "--timeout", "60",
  ];

  logger?.info?.(`Continuing agent task: openclaw ${args.join(" ")}`);

  const child = spawn("openclaw", args, {
    env: { ...process.env },
    stdio: "ignore",
    detached: true,
  });

  child.unref();

  child.on("error", (err) => {
    logger?.error?.(`Failed to start agent: ${err.message}`);
  });

  logger?.info?.(`✓ Agent task continued for session ${sessionId}`);
}
