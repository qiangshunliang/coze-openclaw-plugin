import type { CozeConfig, ImageGenerationRequest } from "coze-coding-dev-sdk";
import { createImageGenerationClient } from "../client.js";

export type ImageGenerationInput = {
  prompt: string;
  count?: number;
  size?: string;
  sequential?: boolean;
  maxSequential?: number;
  image?: string[];
  responseFormat?: "url";
  watermark?: boolean;
  optimizePromptMode?: string;
  headers?: Record<string, string>;
};

export type ImageGenerationResult = {
  prompt: string;
  urls: string[];
};

export async function generateImages(
  input: ImageGenerationInput,
  clientConfig: CozeConfig,
): Promise<ImageGenerationResult[]> {
  const client = await createImageGenerationClient({
    config: clientConfig,
    customHeaders: input.headers,
  });
  const count = input.count ?? 1;
  const results: ImageGenerationResult[] = [];

  for (let index = 0; index < count; index += 1) {
    const request: ImageGenerationRequest = {
      prompt: input.prompt,
      size: input.size ?? "2K",
      sequentialImageGeneration: input.sequential ? "auto" : "disabled",
      sequentialImageGenerationMaxImages: input.maxSequential ?? 15,
      image: input.image && input.image.length > 0 ? input.image : undefined,
      responseFormat: input.responseFormat,
      watermark: input.watermark,
      optimizePromptMode: input.optimizePromptMode,
    };
    const response = await client.generate(request);
    const helper = client.getResponseHelper(response);
    if (!helper.success) {
      throw new Error(helper.errorMessages.join("; ") || "Image generation failed");
    }
    results.push({
      prompt: input.prompt,
      urls: helper.imageUrls,
    });
  }

  return results;
}
