import type { CozeConfig } from "coze-coding-dev-sdk";
import { formatCozeError } from "./client.js";
import {
  getMissingCozeConfigMessage,
  loadCozePluginConfigFromOpenClawConfig,
  resolveCozeClientConfig,
} from "./config.js";
import { transcribeSpeech } from "./shared/asr.js";
import { generateImages } from "./shared/image-gen.js";
import { synthesizeSpeech } from "./shared/tts.js";

type SkillIo = {
  log: (message: string) => void;
  error: (message: string) => void;
};

function createDefaultIo(): SkillIo {
  return {
    log(message: string) {
      console.log(message);
    },
    error(message: string) {
      console.error(message);
    },
  };
}

async function requireConfig(env: NodeJS.ProcessEnv): Promise<CozeConfig> {
  const pluginConfig = await loadCozePluginConfigFromOpenClawConfig(env);
  const config = resolveCozeClientConfig(pluginConfig, env);
  if (!config.apiKey) {
    throw new Error(getMissingCozeConfigMessage());
  }
  return config;
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    return undefined;
  }
  return value;
}

function readTrailingValues(args: string[], name: string): string[] {
  const index = args.indexOf(name);
  if (index < 0) {
    return [];
  }
  const values: string[] = [];
  for (let cursor = index + 1; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (value.startsWith("--")) {
      break;
    }
    values.push(value);
  }
  return values;
}

function readRepeatedArgs(args: string[], names: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (!names.includes(args[index] ?? "")) {
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      continue;
    }
    values.push(value);
  }
  return values;
}

function readNumberArg(args: string[], name: string): number | undefined {
  const value = readArg(args, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findMissingValueFlag(args: string[], names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index < 0) {
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      return name;
    }
  }
  return undefined;
}

function parseBooleanArg(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function findHeaderSeparator(value: string): ":" | "=" | undefined {
  if (value.includes(":")) {
    return ":";
  }
  if (value.includes("=")) {
    return "=";
  }
  return undefined;
}

function parseHeaders(values: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const value of values) {
    const separator = findHeaderSeparator(value);
    if (!separator) {
      throw new Error(`Invalid header format: ${value}`);
    }
    const index = value.indexOf(separator);
    const key = value.slice(0, index).trim();
    const headerValue = value.slice(index + 1).trim();
    if (!key || !headerValue) {
      throw new Error(`Invalid header format: ${value}`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

export async function runImageCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: SkillIo = createDefaultIo(),
): Promise<number> {
  const missingValueFlag = findMissingValueFlag(args, [
    "--prompt",
    "--count",
    "--size",
    "--max-sequential",
    "--image",
    "--response-format",
    "--watermark",
    "--optimize-prompt-mode",
    "--output",
    "--header",
    "-H",
  ]);
  if (missingValueFlag) {
    io.error(`Error: ${missingValueFlag} requires a value`);
    return 1;
  }
  const prompt = readArg(args, "--prompt");
  if (!prompt) {
    io.error("Error: --prompt is required");
    return 1;
  }
  const responseFormat = readArg(args, "--response-format");
  if (responseFormat && responseFormat !== "url") {
    io.error("Error: --response-format only supports url");
    return 1;
  }
  if (args.includes("--output")) {
    io.error("Error: --output is not supported; this skill only prints image URLs");
    return 1;
  }
  try {
    const config = await requireConfig(env);
    const results = await generateImages(
      {
        prompt,
        count: readNumberArg(args, "--count"),
        size: readArg(args, "--size"),
        sequential: args.includes("--sequential"),
        maxSequential: readNumberArg(args, "--max-sequential"),
        image: readRepeatedArgs(args, ["--image"]),
        responseFormat: responseFormat as "url" | undefined,
        watermark: parseBooleanArg(readArg(args, "--watermark"), "--watermark"),
        optimizePromptMode: readArg(args, "--optimize-prompt-mode"),
        headers: parseHeaders(readRepeatedArgs(args, ["--header", "-H"])),
      },
      config,
    );
    for (const [index, item] of results.entries()) {
      io.log(`[${index + 1}/${results.length}] ${item.prompt}`);
      for (const url of item.urls) {
        io.log(`  ${url}`);
      }
    }
    return 0;
  } catch (error) {
    io.error(`Error: ${formatCozeError(error)}`);
    return 1;
  }
}

export async function runTtsCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: SkillIo = createDefaultIo(),
): Promise<number> {
  const missingValueFlag = findMissingValueFlag(args, [
    "--text",
    "--texts",
    "--speaker",
    "--format",
    "--sample-rate",
    "--speech-rate",
    "--loudness-rate",
  ]);
  if (missingValueFlag) {
    io.error(`Error: ${missingValueFlag} requires a value`);
    return 1;
  }
  const text = readArg(args, "--text");
  const texts = readTrailingValues(args, "--texts");
  const mergedTexts = text ? [text] : texts;
  if (mergedTexts.length === 0) {
    io.error("Error: --text or --texts is required");
    return 1;
  }
  try {
    const config = await requireConfig(env);
    const results = await synthesizeSpeech(
      {
        texts: mergedTexts,
        speaker: readArg(args, "--speaker"),
        format: readArg(args, "--format") as "mp3" | "pcm" | "ogg_opus" | undefined,
        sampleRate: readNumberArg(args, "--sample-rate") as
          | 8000
          | 16000
          | 22050
          | 24000
          | 32000
          | 44100
          | 48000
          | undefined,
        speechRate: readNumberArg(args, "--speech-rate"),
        loudnessRate: readNumberArg(args, "--loudness-rate"),
      },
      config,
    );
    for (const [index, item] of results.entries()) {
      io.log(
        `[${index + 1}/${results.length}] ${item.text.slice(0, 50)}${item.text.length > 50 ? "..." : ""}`,
      );
      io.log(`  ${item.audioUri}`);
    }
    return 0;
  } catch (error) {
    io.error(`Error: ${formatCozeError(error)}`);
    return 1;
  }
}

export async function runAsrCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: SkillIo = createDefaultIo(),
): Promise<number> {
  const missingValueFlag = findMissingValueFlag(args, ["--url", "-u", "--file", "-f"]);
  if (missingValueFlag) {
    io.error(`Error: ${missingValueFlag} requires a value`);
    return 1;
  }
  const url = readArg(args, "--url") ?? readArg(args, "-u");
  const file = readArg(args, "--file") ?? readArg(args, "-f");
  if (!url && !file) {
    io.error("Error: --url or --file is required");
    return 1;
  }
  try {
    const config = await requireConfig(env);
    const result = await transcribeSpeech({ url, file }, config);
    io.log("============================================================");
    io.log("TRANSCRIPTION");
    io.log("============================================================");
    io.log(result.text);
    io.log("============================================================");
    if (result.duration !== undefined) {
      io.log(`Duration: ${result.duration}`);
    }
    if (result.segments !== undefined) {
      io.log(`Segments: ${result.segments}`);
    }
    return 0;
  } catch (error) {
    io.error(`Error: ${formatCozeError(error)}`);
    return 1;
  }
}
