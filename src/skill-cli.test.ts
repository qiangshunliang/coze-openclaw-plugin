import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  loadCozePluginConfigFromOpenClawConfig: vi.fn(),
  resolveCozeClientConfig: vi.fn(),
  generateImages: vi.fn(),
  synthesizeSpeech: vi.fn(),
  transcribeSpeech: vi.fn(),
}));

vi.mock("./config.js", async () => {
  const actual = await vi.importActual<typeof import("./config.js")>("./config.js");
  return {
    ...actual,
    loadCozePluginConfigFromOpenClawConfig: (...args: unknown[]) =>
      hoisted.loadCozePluginConfigFromOpenClawConfig(...args),
    resolveCozeClientConfig: (...args: unknown[]) => hoisted.resolveCozeClientConfig(...args),
  };
});

vi.mock("./shared/tts.js", () => ({
  synthesizeSpeech: (...args: unknown[]) => hoisted.synthesizeSpeech(...args),
}));

vi.mock("./shared/image-gen.js", () => ({
  generateImages: (...args: unknown[]) => hoisted.generateImages(...args),
}));

vi.mock("./shared/asr.js", () => ({
  transcribeSpeech: (...args: unknown[]) => hoisted.transcribeSpeech(...args),
}));

const { runAsrCli, runImageCli, runTtsCli } = await import("./skill-cli.js");

function createIo() {
  return {
    logs: [] as string[],
    errors: [] as string[],
    log(message: string) {
      this.logs.push(message);
    },
    error(message: string) {
      this.errors.push(message);
    },
  };
}

describe("skill cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing values for single-value flags", async () => {
    const io = createIo();

    const code = await runAsrCli(["--file", "--url", "https://example.com/audio.mp3"], {}, io);

    expect(code).toBe(1);
    expect(io.errors).toContain("Error: --file requires a value");
    expect(hoisted.transcribeSpeech).not.toHaveBeenCalled();
  });

  it("rejects missing values in tts options before calling the sdk", async () => {
    hoisted.loadCozePluginConfigFromOpenClawConfig.mockResolvedValue({});
    hoisted.resolveCozeClientConfig.mockReturnValue({ apiKey: "test-key" });
    const io = createIo();

    const code = await runTtsCli(["--text", "Hello", "--speaker", "--format", "mp3"], {}, io);

    expect(code).toBe(1);
    expect(io.errors).toContain("Error: --speaker requires a value");
    expect(hoisted.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("rejects missing values in image options before calling the sdk", async () => {
    const io = createIo();

    const code = await runImageCli(["--prompt", "hello", "--image"], {}, io);

    expect(code).toBe(1);
    expect(io.errors).toContain("Error: --image requires a value");
    expect(hoisted.generateImages).not.toHaveBeenCalled();
  });

  it("passes image generation options through to the sdk wrapper", async () => {
    hoisted.loadCozePluginConfigFromOpenClawConfig.mockResolvedValue({});
    hoisted.resolveCozeClientConfig.mockReturnValue({ apiKey: "test-key" });
    hoisted.generateImages.mockResolvedValue([
      { prompt: "hello", urls: ["https://example.com/a.png"] },
    ]);
    const io = createIo();

    const code = await runImageCli(
      [
        "--prompt",
        "hello",
        "--count",
        "2",
        "--size",
        "4K",
        "--sequential",
        "--max-sequential",
        "7",
        "--image",
        "https://example.com/1.png",
        "--image",
        "https://example.com/2.png",
        "--response-format",
        "url",
        "--watermark",
        "false",
        "--optimize-prompt-mode",
        "standard",
        "--header",
        "x-trace-id: 123",
        "-H",
        "x-run-mode=test_run",
      ],
      {},
      io,
    );

    expect(code).toBe(0);
    expect(hoisted.generateImages).toHaveBeenCalledWith(
      {
        prompt: "hello",
        count: 2,
        size: "4K",
        sequential: true,
        maxSequential: 7,
        image: ["https://example.com/1.png", "https://example.com/2.png"],
        responseFormat: "url",
        watermark: false,
        optimizePromptMode: "standard",
        headers: {
          "x-run-mode": "test_run",
          "x-trace-id": "123",
        },
      },
      { apiKey: "test-key" },
    );
    expect(io.logs).toContain("[1/1] hello");
    expect(io.logs).toContain("  https://example.com/a.png");
  });

  it("rejects output because the skill only prints generated urls", async () => {
    const io = createIo();

    const code = await runImageCli(["--prompt", "hello", "--output", "/tmp/out.png"], {}, io);

    expect(code).toBe(1);
    expect(io.errors).toContain("Error: --output is not supported; this skill only prints image URLs");
    expect(hoisted.generateImages).not.toHaveBeenCalled();
  });

  it("rejects non-url response formats", async () => {
    const io = createIo();

    const code = await runImageCli(
      ["--prompt", "hello", "--response-format", "b64_json"],
      {},
      io,
    );

    expect(code).toBe(1);
    expect(io.errors).toContain("Error: --response-format only supports url");
    expect(hoisted.generateImages).not.toHaveBeenCalled();
  });
});
