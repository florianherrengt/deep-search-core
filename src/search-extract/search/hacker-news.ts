import { load } from "cheerio";
import { z } from "zod";
import {
  createSearchProvider,
  formatSearchHttpError,
} from "./create-search-provider.js";
import { SearchProviderError } from "../core/errors.js";
import type { SearchResult } from "../core/types.js";

const API_BASE_URL = "https://hn.algolia.com/api/v1";
const DEFAULT_HITS_PER_PAGE = 10;
const MAX_HITS_PER_PAGE = 100;

const HackerNewsSearchResponseSchema = z.object({
  hits: z
    .array(
      z.object({
        objectID: z.string(),
        title: z.string().nullable().optional(),
        story_title: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        story_url: z.string().nullable().optional(),
        author: z.string().nullable().optional(),
        points: z.number().nullable().optional(),
        num_comments: z.number().nullable().optional(),
        created_at: z.string().nullable().optional(),
        story_text: z.string().nullable().optional(),
        comment_text: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

type HackerNewsSearchHit = z.infer<
  typeof HackerNewsSearchResponseSchema
>["hits"] extends Array<infer T> | undefined
  ? T
  : never;

export interface HackerNewsConfig {
  fetch?: typeof globalThis.fetch;
  maxResults?: number;
}

export function createHackerNewsSearch(config: HackerNewsConfig = {}) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const hitsPerPage = normalizeMaxResults(config.maxResults);

  return createSearchProvider({
    providerName: "Hacker News",
    responseSchema: HackerNewsSearchResponseSchema,
    throwOnParseError: true,
    mapResults: (response) => (response.hits ?? []).map(mapHackerNewsHit),
    execute: async (query, abortSignal) => {
      const url = new URL(`${API_BASE_URL}/search`);
      url.searchParams.set("query", query);
      url.searchParams.set("tags", "story");
      url.searchParams.set("hitsPerPage", String(hitsPerPage));

      const response = await fetchImpl(url.toString(), {
        headers: { accept: "application/json" },
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await formatSearchHttpError("Hacker News", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Hacker News", status, bodyPart);
      }

      return await response.text();
    },
  });
}

function mapHackerNewsHit(hit: HackerNewsSearchHit): SearchResult {
  const title = hit.title ?? hit.story_title ?? `Hacker News item ${hit.objectID}`;
  return {
    title,
    url: formatHackerNewsItemUrl(hit.objectID),
    description: formatHackerNewsDescription(hit),
  };
}

function formatHackerNewsDescription(hit: HackerNewsSearchHit): string {
  const parts = [`HN item ID: ${hit.objectID}`];
  const externalUrl = hit.url ?? hit.story_url;

  if (hit.author) parts.push(`Author: ${hit.author}`);
  if (typeof hit.points === "number") parts.push(`Points: ${hit.points}`);
  if (typeof hit.num_comments === "number") {
    parts.push(`Comments: ${hit.num_comments}`);
  }
  if (hit.created_at) parts.push(`Created: ${hit.created_at}`);
  if (externalUrl) parts.push(`External URL: ${externalUrl}`);

  const text = htmlToText(hit.story_text ?? hit.comment_text ?? "");
  if (text) parts.push(text);

  return parts.join("\n");
}

function formatHackerNewsItemUrl(objectID: string): string {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(objectID)}`;
}

function htmlToText(html: string): string {
  if (!html.trim()) return "";
  const $ = load(html);
  return $("body").text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMaxResults(maxResults: number | undefined) {
  if (!Number.isFinite(maxResults)) return DEFAULT_HITS_PER_PAGE;
  return Math.min(
    MAX_HITS_PER_PAGE,
    Math.max(1, Math.trunc(maxResults ?? DEFAULT_HITS_PER_PAGE)),
  );
}

export type HackerNewsSearchFn = (
  query: string,
  signal?: AbortSignal,
) => Promise<SearchResult[]>;
