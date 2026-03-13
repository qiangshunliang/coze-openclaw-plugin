import { Static, Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import { formatCozeError } from "../client.js";
import { getMissingCozeConfigMessage, resolveCozeClientConfig } from "../config.js";
import { searchWeb } from "../shared/search.js";

type ToolLogger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn: (message: string) => void;
  error?: (message: string) => void;
};

const SearchToolSchema = Type.Object(
  {
    query: Type.String({ description: "Search query." }),
    type: Type.Optional(
      Type.Unsafe<"web" | "image">({
        type: "string",
        enum: ["web", "image"],
        description: "Search type. Defaults to web.",
      }),
    ),
    count: Type.Optional(
      Type.Number({
        description: "Number of results to return.",
        minimum: 1,
        maximum: 20,
      }),
    ),
    timeRange: Type.Optional(
      Type.Unsafe<"1d" | "1w" | "1m">({
        type: "string",
        enum: ["1d", "1w", "1m"],
        description: "Recency filter for web search.",
      }),
    ),
    sites: Type.Optional(
      Type.String({ description: "Comma-separated domains to include." }),
    ),
    blockHosts: Type.Optional(
      Type.String({ description: "Comma-separated domains to exclude." }),
    ),
    needSummary: Type.Optional(
      Type.Boolean({ description: "Whether to include Coze summary output." }),
    ),
    needContent: Type.Optional(
      Type.Boolean({ description: "Whether to include extracted page content." }),
    ),
  },
  { additionalProperties: false },
);

type SearchToolParams = Static<typeof SearchToolSchema>;

function buildSearchText(
  params: Awaited<ReturnType<typeof searchWeb>>,
  options: { includeContent: boolean },
): string {
  const lines = [`Coze web search: ${params.query}`];
  if (params.summary) {
    lines.push("", `Summary: ${params.summary}`);
  }
  lines.push("", `Results (${params.items.length})`);
  for (const [index, item] of params.items.entries()) {
    lines.push(`${index + 1}. ${item.title}`);
    if (item.url) {
      lines.push(`   URL: ${item.url}`);
    }
    if (item.imageUrl) {
      lines.push(`   Image: ${item.imageUrl}`);
    }
    if (item.siteName) {
      lines.push(`   Source: ${item.siteName}`);
    }
    if (item.publishTime) {
      lines.push(`   Published: ${item.publishTime}`);
    }
    if (item.snippet) {
      lines.push(`   ${item.snippet}`);
    }
    if (options.includeContent && item.content) {
      lines.push("   Content:");
      lines.push(`   ${item.content}`);
    }
  }
  return lines.join("\n");
}

function buildErrorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    details: { error: true, message },
  };
}

export function createCozeWebSearchTool(params: {
  pluginConfig?: Record<string, unknown>;
  logger: ToolLogger;
  env?: NodeJS.ProcessEnv;
}): AnyAgentTool {
  return {
    name: "coze_web_search",
    label: "Coze Web Search",
    description:
      "Search the web or images through Coze. Supports summaries, recency filters, and site restrictions.",
    parameters: SearchToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const toolParams = rawParams as SearchToolParams;
      const clientConfig = resolveCozeClientConfig(params.pluginConfig, params.env);
      if (!clientConfig.apiKey) {
        return buildErrorResult(getMissingCozeConfigMessage());
      }
      try {
        const result = await searchWeb(toolParams, clientConfig);
        return {
          content: [
            {
              type: "text",
              text: buildSearchText(result, { includeContent: toolParams.needContent === true }),
            },
          ],
          details: {
            query: result.query,
            type: result.type,
            summary: result.summary,
            count: result.items.length,
            items: result.items,
          },
        };
      } catch (error) {
        const message = formatCozeError(error);
        params.logger.warn(`coze-web-search failed: ${message}`);
        return buildErrorResult(message);
      }
    },
  };
}
