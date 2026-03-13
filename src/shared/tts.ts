import { randomUUID } from "node:crypto";
import type { AudioFormat, CozeConfig, SampleRate } from "coze-coding-dev-sdk";
import { createTtsClient } from "../client.js";

export type TtsInput = {
  texts: string[];
  speaker?: string;
  format?: AudioFormat;
  sampleRate?: SampleRate;
  speechRate?: number;
  loudnessRate?: number;
};

export type TtsResult = {
  text: string;
  audioUri: string;
  audioSize: number;
};

export async function synthesizeSpeech(
  input: TtsInput,
  clientConfig: CozeConfig,
): Promise<TtsResult[]> {
  const client = await createTtsClient({ config: clientConfig });
  const results: TtsResult[] = [];

  for (const text of input.texts) {
    const response = await client.synthesize({
      uid: `coze-openclaw-plugin-tts-${randomUUID()}`,
      text,
      speaker: input.speaker,
      audioFormat: input.format,
      sampleRate: input.sampleRate,
      speechRate: input.speechRate,
      loudnessRate: input.loudnessRate,
    });
    results.push({
      text,
      audioUri: response.audioUri,
      audioSize: response.audioSize,
    });
  }

  return results;
}
