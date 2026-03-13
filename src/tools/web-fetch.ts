import { Static, Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import { formatCozeError } from "../client.js";
import { getMissingCozeConfigMessage, resolveCozeClientConfig } from "../config.js";
import { fetchContent } from "../shared/fetch.js";

type ToolLogger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn: (message: string) => void;
  error?: (message: string) => void;
};

const FetchToolSchema = Type.Object(
  {
    urls: Type.Union(
      [
        Type.String({
          description: "Single URL to fetch. You can pass a plain string for one URL.",
        }),
        Type.Array(
          Type.String({
            description: "URL to fetch.",
          }),
          {
            description:
              "One or more URLs to fetch. Use an array for multiple URLs, or pass a single string for one URL.",
            minItems: 1,
          },
        ),
      ],
      {
        description:
          "URL input. Accepts either a single URL string or an array of URL strings.",
      },
    ),
    format: Type.Optional(
      Type.Unsafe<"text" | "markdown" | "json">({
        type: "string",
        enum: ["text", "markdown", "json"],
        description: "Formatting preference for the textual output.",
      }),
    ),
    textOnly: Type.Optional(
      Type.Boolean({ description: "Only return extracted text, without images or links." }),
    ),
  },
  { additionalProperties: false },
);

type FetchToolParams = Static<typeof FetchToolSchema>;

function normalizeUrls(urls: string | string[]): string[] {
  return Array.isArray(urls) ? urls : [urls];
}

function renderFetchedText(
  items: Awaited<ReturnType<typeof fetchContent>>,
  format: "text" | "markdown" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(items, null, 2);
  }
  if (format === "markdown") {
    return items
      .map((item) => {
        const parts = [`# ${item.title ?? item.url}`, "", `**URL**: ${item.url}`, "", item.text];
        if (item.links.length > 0) {
          parts.push("", "## Links");
          for (const link of item.links) {
            parts.push(`- [${link.title ?? link.url ?? "Link"}](${link.url ?? ""})`);
          }
        }
        return parts.join("\n");
      })
      .join("\n\n---\n\n");
  }
  return items
    .map((item, index) => {
      const lines = [`[${index + 1}] ${item.title ?? item.url}`, `URL: ${item.url}`, "", item.text];
      if (item.links.length > 0) {
        lines.push("", "Links:");
        for (const link of item.links) {
          lines.push(`- ${link.title ?? link.url ?? "Link"} -> ${link.url ?? ""}`);
        }
      }
      if (item.images.length > 0) {
        lines.push("", "Images:");
        for (const image of item.images) {
          lines.push(`- ${image.url ?? ""}`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n============================================================\n\n");
}

function buildErrorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    details: { error: true, message },
  };
}

export function createCozeWebFetchTool(params: {
  pluginConfig?: Record<string, unknown>;
  logger: ToolLogger;
  env?: NodeJS.ProcessEnv;
}): AnyAgentTool {
  return {
    name: "coze_web_fetch",
    label: "Coze Web Fetch",
    description:
      "Fetch and extract structured content from web pages or documents through Coze.",
    parameters: FetchToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const toolParams = rawParams as FetchToolParams;
      const clientConfig = resolveCozeClientConfig(params.pluginConfig, params.env);
      if (!clientConfig.apiKey) {
        return buildErrorResult(getMissingCozeConfigMessage());
      }
      try {
        const urls = normalizeUrls(toolParams.urls);
        const items = await fetchContent(
          {
            urls,
            textOnly: toolParams.textOnly,
          },
          clientConfig,
        );
        const format = toolParams.format ?? "text";
        return {
          content: [{ type: "text", text: renderFetchedText(items, format) }],
          details: {
            count: items.length,
            urls: items.map((item) => item.url),
            items,
          },
        };
      } catch (error) {
        const message = formatCozeError(error);
        params.logger.warn(`coze-web-fetch failed: ${message}`);
        return buildErrorResult(message);
      }
    },
  };
}
