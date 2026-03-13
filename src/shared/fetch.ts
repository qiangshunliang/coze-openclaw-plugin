import type { CozeConfig, FetchContentItem, FetchResponse } from "coze-coding-dev-sdk";
import { createFetchClient } from "../client.js";

export type FetchInput = {
  urls: string[];
  textOnly?: boolean;
};

export type FetchResultLink = {
  title?: string;
  url?: string;
};

export type FetchResultImage = {
  url?: string;
  width?: number;
  height?: number;
};

export type FetchResultItem = {
  url: string;
  title?: string;
  text: string;
  links: FetchResultLink[];
  images: FetchResultImage[];
};

function joinText(items: FetchContentItem[]): string {
  return items
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function collectLinks(items: FetchContentItem[]): FetchResultLink[] {
  return items
    .filter((item) => item.type === "link")
    .map((item) => ({
      title: item.text,
      url: item.url,
    }));
}

function collectImages(items: FetchContentItem[]): FetchResultImage[] {
  return items
    .filter((item) => item.type === "image")
    .map((item) => ({
      url: item.image?.display_url ?? item.image?.image_url,
      width: item.image?.width,
      height: item.image?.height,
    }));
}

function normalizeFetchedItem(response: FetchResponse, textOnly: boolean): FetchResultItem {
  const content = response.content ?? [];
  return {
    url: response.url ?? "",
    title: response.title,
    text: joinText(content),
    links: textOnly ? [] : collectLinks(content),
    images: textOnly ? [] : collectImages(content),
  };
}

export async function fetchContent(
  input: FetchInput,
  clientConfig: CozeConfig,
): Promise<FetchResultItem[]> {
  const client = await createFetchClient({ config: clientConfig });
  const results: FetchResultItem[] = [];

  for (const url of input.urls) {
    const response = await client.fetch(url);
    results.push(normalizeFetchedItem(response, input.textOnly === true));
  }

  return results;
}
