import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  createImageGenerationClient: vi.fn(),
}));

vi.mock("../client.js", () => ({
  createImageGenerationClient: (...args: unknown[]) => hoisted.createImageGenerationClient(...args),
}));

const { generateImages } = await import("./image-gen.js");

describe("generateImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws helper error messages when the sdk response is unsuccessful", async () => {
    const client = {
      generate: vi.fn().mockResolvedValue({}),
      getResponseHelper: vi.fn().mockReturnValue({
        success: false,
        errorMessages: ["bad request"],
        imageUrls: [],
        imageB64List: [],
      }),
    };
    hoisted.createImageGenerationClient.mockResolvedValue(client);

    await expect(generateImages({ prompt: "hello" }, { apiKey: "test-key" })).rejects.toThrow(
      "bad request",
    );
  });

  it("forwards optional request fields and defaults sequential max images to 15", async () => {
    const client = {
      generate: vi.fn().mockResolvedValue({}),
      getResponseHelper: vi.fn().mockReturnValue({
        success: true,
        errorMessages: [],
        imageUrls: ["https://example.com/result.png"],
        imageB64List: ["Zm9v"],
      }),
    };
    hoisted.createImageGenerationClient.mockResolvedValue(client);

    const results = await generateImages(
      {
        prompt: "hello",
        size: "4K",
        sequential: true,
        image: ["https://example.com/source.png"],
        responseFormat: "url",
        watermark: false,
        optimizePromptMode: "standard",
        headers: { "x-run-mode": "test_run" },
      },
      { apiKey: "test-key" },
    );

    expect(hoisted.createImageGenerationClient).toHaveBeenCalledWith({
      config: { apiKey: "test-key" },
      customHeaders: { "x-run-mode": "test_run" },
    });
    expect(client.generate).toHaveBeenCalledWith({
      prompt: "hello",
      size: "4K",
      sequentialImageGeneration: "auto",
      sequentialImageGenerationMaxImages: 15,
      image: ["https://example.com/source.png"],
      responseFormat: "url",
      watermark: false,
      optimizePromptMode: "standard",
    });
    expect(results).toEqual([
      {
        prompt: "hello",
        urls: ["https://example.com/result.png"],
      },
    ]);
  });
});
