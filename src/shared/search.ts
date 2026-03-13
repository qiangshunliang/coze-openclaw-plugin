import type { CozeConfig, ImageItem, SearchResponse, WebItem } from "coze-coding-dev-sdk";
import { createSearchClient } from "../client.js";

export type SearchInput = {
  query: string;
  type?: "web" | "image";
  count?: number;
  timeRange?: string;
  sites?: string;
  blockHosts?: string;
  needSummary?: boolean;
  needContent?: boolean;
};

export type SearchResultItem = {
  title: string;
  url?: string;
  siteName?: string;
  snippet?: string;
  content?: string;
  publishTime?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
};

export type SearchResult = {
  query: string;
  type: "web" | "image";
  summary?: string;
  items: SearchResultItem[];
};

function mapWebItem(item: WebItem): SearchResultItem {
  return {
    title: item.title,
    url: item.url,
    siteName: item.site_name,
    snippet: item.snippet,
    content: item.content,
    publishTime: item.publish_time,
  };
}

function mapImageItem(item: ImageItem): SearchResultItem {
  return {
    title: item.title ?? "Untitled",
    url: item.url,
    siteName: item.site_name,
    publishTime: item.publish_time,
    imageUrl: item.image?.url,
    imageWidth: item.image?.width,
    imageHeight: item.image?.height,
  };
}

function hasAdvancedOptions(input: SearchInput): boolean {
  return Boolean(input.timeRange || input.sites || input.blockHosts || input.needContent);
}

export async function searchWeb(input: SearchInput, clientConfig: CozeConfig): Promise<SearchResult> {
  const client = await createSearchClient({ config: clientConfig });
  const type = input.type ?? "web";
  const count = input.count ?? 10;
  let response: SearchResponse;

  if (type === "image") {
    response = await client.imageSearch(input.query, count);
    return {
      query: input.query,
      type,
      items: (response.image_items ?? []).map(mapImageItem),
    };
  }

  if (hasAdvancedOptions(input)) {
    response = await client.advancedSearch(input.query, {
      searchType: "web",
      count,
      timeRange: input.timeRange,
      sites: input.sites,
      blockHosts: input.blockHosts,
      needSummary: input.needSummary,
      needContent: input.needContent,
    });
  } else {
    response = await client.webSearch(input.query, count, input.needSummary);
  }

  return {
    query: input.query,
    type,
    summary: response.summary,
    items: (response.web_items ?? []).map(mapWebItem),
  };
}
