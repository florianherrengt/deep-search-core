import { z } from "zod";
import { createSearchProvider, formatSearchHttpError } from "./create-search-provider.js";
import {
  SearchProviderError,
  SearchProviderConfigError,
} from "../core/errors.js";
import type { SearchResult } from "../core/types.js";

const DEFAULT_BASE_URL = "http://localhost:8080";

const SearXNGResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
    }),
  ),
});

export interface SearXNGConfig {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createSearXNGFetchSearch(config: SearXNGConfig = {}) {
  const fetchImpl = config.fetch ?? globalThis.fetch;

  // Validate baseUrl lazily at call time, not at construction time.
  // This allows the engine to be created even if SearXNG is not configured yet.

  return createSearchProvider({
    providerName: "SearXNG",
    responseSchema: SearXNGResponseSchema,
    throwOnParseError: true,
    mapResults: (r) =>
      r.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.content,
      })),
    execute: async (query, abortSignal) => {
      const baseUrl = config.baseUrl?.trim() || DEFAULT_BASE_URL;
      if (!baseUrl) {
        throw new SearchProviderConfigError(
          "SearXNG",
          "requires a valid baseUrl",
        );
      }

      const url = new URL("/search", baseUrl);
      url.searchParams.set("format", "json");
      url.searchParams.set("q", query);

      const response = await fetchImpl(url.toString(), {
        headers: { accept: "application/json" },
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await formatSearchHttpError("SearXNG", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("SearXNG", status, bodyPart);
      }

      return await response.text();
    },
  });
}
export type SearXNGFetchSearchFn = (
  query: string,
  signal?: AbortSignal,
) => Promise<SearchResult[]>;
