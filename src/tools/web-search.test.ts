import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  searchWeb: vi.fn(),
}));

vi.mock("../shared/search.js", () => ({
  searchWeb: (...args: unknown[]) => hoisted.searchWeb(...args),
}));

const { createCozeWebSearchTool } = await import("./web-search.js");

function getTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first?.type === "text" ? first.text ?? "" : "";
}

describe("createCozeWebSearchTool", () => {
  it("executes web search and returns structured details", async () => {
    hoisted.searchWeb.mockResolvedValueOnce({
      query: "OpenClaw",
      type: "web",
      summary: "summary",
      items: [
        {
          title: "OpenClaw",
          url: "https://openclaw.ai",
          siteName: "OpenClaw",
          snippet: "AI agent",
        },
      ],
    });

    const tool = createCozeWebSearchTool({
      pluginConfig: { apiKey: "test-key" },
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      env: {},
    });

    const result = await tool.execute("call-1", {
      query: "OpenClaw",
      type: "web",
      count: 5,
      needSummary: true,
    });

    expect(hoisted.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "OpenClaw",
        type: "web",
        count: 5,
        needSummary: true,
      }),
      expect.objectContaining({ apiKey: "test-key" }),
    );
    expect(result.details).toMatchObject({
      query: "OpenClaw",
      type: "web",
      summary: "summary",
      count: 1,
    });
    expect(getTextContent(result)).toContain("OpenClaw");
  });

  it("supports image search mode", async () => {
    hoisted.searchWeb.mockResolvedValueOnce({
      query: "lobster",
      type: "image",
      items: [
        {
          title: "Lobster",
          url: "https://example.com/page",
          imageUrl: "https://example.com/image.png",
          siteName: "Example",
        },
      ],
    });

    const tool = createCozeWebSearchTool({
      pluginConfig: { apiKey: "test-key" },
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      env: {},
    });

    const result = await tool.execute("call-2", {
      query: "lobster",
      type: "image",
    });

    expect(result.details).toMatchObject({
      type: "image",
      count: 1,
    });
    expect(getTextContent(result)).toContain("https://example.com/image.png");
  });

  it("renders extracted content when needContent is enabled", async () => {
    hoisted.searchWeb.mockResolvedValueOnce({
      query: "OpenClaw",
      type: "web",
      items: [
        {
          title: "OpenClaw",
          url: "https://openclaw.ai",
          snippet: "Short summary",
          content: "Long-form extracted page content.",
        },
      ],
    });

    const tool = createCozeWebSearchTool({
      pluginConfig: { apiKey: "test-key" },
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      env: {},
    });

    const result = await tool.execute("call-3", {
      query: "OpenClaw",
      type: "web",
      needContent: true,
    });

    expect(getTextContent(result)).toContain("Long-form extracted page content.");
  });
});
