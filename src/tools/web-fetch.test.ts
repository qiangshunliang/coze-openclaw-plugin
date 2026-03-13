import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  fetchContent: vi.fn(),
}));

vi.mock("../shared/fetch.js", () => ({
  fetchContent: (...args: unknown[]) => hoisted.fetchContent(...args),
}));

const { createCozeWebFetchTool } = await import("./web-fetch.js");

function getTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first?.type === "text" ? first.text ?? "" : "";
}

describe("createCozeWebFetchTool", () => {
  it("fetches multiple urls and returns normalized details", async () => {
    hoisted.fetchContent.mockResolvedValueOnce([
      {
        url: "https://example.com/one",
        title: "One",
        text: "First page",
        links: [],
        images: [],
      },
      {
        url: "https://example.com/two",
        title: "Two",
        text: "Second page",
        links: [{ title: "Ref", url: "https://example.com/ref" }],
        images: [],
      },
    ]);

    const tool = createCozeWebFetchTool({
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
      urls: ["https://example.com/one", "https://example.com/two"],
      textOnly: true,
    });

    expect(hoisted.fetchContent).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ["https://example.com/one", "https://example.com/two"],
        textOnly: true,
      }),
      expect.objectContaining({ apiKey: "test-key" }),
    );
    expect(result.details).toMatchObject({
      count: 2,
      urls: ["https://example.com/one", "https://example.com/two"],
    });
    const text = getTextContent(result);
    expect(text).toContain("First page");
    expect(text).toContain("Second page");
  });
});
