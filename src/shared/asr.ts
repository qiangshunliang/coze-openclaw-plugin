import fs from "node:fs";
import { randomUUID } from "node:crypto";
import type { CozeConfig } from "coze-coding-dev-sdk";
import { createAsrClient } from "../client.js";

export type AsrInput = {
  url?: string;
  file?: string;
};

export type AsrResult = {
  text: string;
  duration?: number;
  segments?: number;
};

export async function transcribeSpeech(
  input: AsrInput,
  clientConfig: CozeConfig,
): Promise<AsrResult> {
  const client = await createAsrClient({ config: clientConfig });
  const request =
    input.file !== undefined
      ? {
          uid: `coze-openclaw-plugin-asr-${randomUUID()}`,
          base64Data: fs.readFileSync(input.file).toString("base64"),
        }
      : {
          uid: `coze-openclaw-plugin-asr-${randomUUID()}`,
          url: input.url,
        };
  const result = await client.recognize(request);
  return {
    text: result.text,
    duration: result.duration,
    segments: result.utterances?.length,
  };
}
