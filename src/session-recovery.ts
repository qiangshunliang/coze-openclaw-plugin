import { promises as fs } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
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
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGE = "服务重启完成，正在继续处理你的任务...";
/** Only recover sessions whose transcript was modified within this window */
const RECENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
/** Max agent child processes for recovery */
const MAX_RECOVERY_AGENTS = 2;
/** Bytes to read from the tail of a transcript file */
const TAIL_READ_BYTES = 8192; // 8 KB – plenty for 20 JSONL lines

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

      // 2. Read session store (keep full read as-is per requirement)
      let store: SessionStore;
      try {
        const raw = await fs.readFile(storePath, "utf-8");
        store = JSON.parse(raw);
      } catch (error) {
        api.logger.warn?.(`Failed to read session store: ${error}`);
        return;
      }

      // 3. Filter to recent sessions only (modified within last 10 min)
      const now = Date.now();
      const sessionKeys = Object.keys(store);
      api.logger.info?.(`Total sessions: ${sessionKeys.length}, filtering to recent ${RECENT_WINDOW_MS / 1000}s...`);

      const recentSessions: { key: string; entry: SessionEntry; transcriptPath: string }[] = [];

      for (const sessionKey of sessionKeys) {
        const entry = store[sessionKey];
        const dc = entry?.deliveryContext;

        if (!dc?.channel || !dc?.to) {
          continue;
        }

        let transcriptPath: string;
        if (entry?.sessionFile) {
          transcriptPath = entry.sessionFile;
        } else {
          const sessionId = sessionKey.split(":").pop();
          if (!sessionId) continue;
          transcriptPath = path.join(basePath, `${sessionId}.jsonl`);
        }

        // Check file mtime – skip old sessions
        try {
          const stat = await fs.stat(transcriptPath);
          if (now - stat.mtimeMs > RECENT_WINDOW_MS) {
            continue;
          }
        } catch {
          // File missing or inaccessible – skip
          continue;
        }

        recentSessions.push({ key: sessionKey, entry, transcriptPath });
      }

      // Release the large store object early
      // @ts-ignore – allow GC
      store = null!;

      api.logger.info?.(`Found ${recentSessions.length} recent sessions to check`);

      // 4. Check each recent session for interruption, recover serially (max N agents)
      let recoveredCount = 0;

      for (const { key: sessionKey, entry, transcriptPath } of recentSessions) {
        if (recoveredCount >= MAX_RECOVERY_AGENTS) {
          api.logger.info?.(`Reached max recovery limit (${MAX_RECOVERY_AGENTS}), stopping`);
          break;
        }

        try {
          // Re-check mtime before processing: if the file was modified since our
          // initial scan, it means a new conversation is actively writing to it —
          // skip to avoid conflicting with the live agent.
          try {
            const freshStat = await fs.stat(transcriptPath);
            if (freshStat.mtimeMs > now + 1000) {
              // mtime moved forward since we started — session is live
              api.logger.info?.(`Session ${sessionKey} is actively being written, skipping recovery`);
              continue;
            }
          } catch {
            continue;
          }

          const result = await checkIfInterrupted(transcriptPath, api.logger);

          if (result.interrupted) {
            api.logger.info?.(`Session ${sessionKey} was interrupted (${result.reason}), recovering...`);

            // Step 1: Send notification message
            await sendMessageViaCLI(entry.deliveryContext!.channel!, entry.deliveryContext!.to!, message, api.logger);
            api.logger.info?.(`✓ Recovery notification sent to ${sessionKey}`);

            // Step 2: Continue the interrupted task via openclaw agent (serial, wait for completion)
            if (continueTask && entry?.sessionId) {
              await continueAgentTask(entry.sessionId, api.logger);
              api.logger.info?.(`✓ Agent task completed for session ${entry.sessionId}`);
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

/**
 * Read the last N lines from a file by seeking to the tail.
 * Only reads the final TAIL_READ_BYTES bytes, avoiding full-file scans.
 */
async function readLastLines(filePath: string, lineCount: number): Promise<string[]> {
  let fh: fs.FileHandle | undefined;
  try {
    fh = await open(filePath, "r");
    const stat = await fh.stat();
    const fileSize = stat.size;

    if (fileSize === 0) return [];

    const readSize = Math.min(TAIL_READ_BYTES, fileSize);
    const buffer = Buffer.alloc(readSize);
    await fh.read(buffer, 0, readSize, fileSize - readSize);

    const text = buffer.toString("utf-8");
    // Split into lines, filter empty trailing line from final newline
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines.slice(-lineCount);
  } catch {
    return [];
  } finally {
    await fh?.close();
  }
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
 * Continue agent task using OpenClaw CLI (runs in background).
 * Returns a promise that resolves when the child process exits, so the caller
 * can track concurrency.
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

  return new Promise<void>((resolve) => {
    const child = spawn("openclaw", args, {
      env: { ...process.env },
      stdio: "ignore",
      detached: true,
    });

    child.unref();

    child.on("error", (err) => {
      logger?.error?.(`Failed to start agent: ${err.message}`);
      resolve();
    });

    child.on("exit", (code) => {
      logger?.debug?.(`Agent for session ${sessionId} exited with code ${code}`);
      resolve();
    });
  });
}
