import { z } from "zod";
import {
  createSearchProvider,
  formatSearchHttpError,
} from "./create-search-provider.js";
import {
  SearchProviderError,
  SearchProviderConfigError,
} from "../core/errors.js";
import type { SearchResult } from "../core/types.js";

const API_BASE_URL = "https://google.serper.dev";

const SerperWebResponseSchema = z.object({
  organic: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
});

export interface SerperConfig {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

export function createSerperSearch(config: SerperConfig) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";

  return createSearchProvider({
    providerName: "Serper",
    responseSchema: SerperWebResponseSchema,
    throwOnParseError: true,
    mapResults: (r) =>
      (r.organic ?? []).map((r) => ({
        title: r.title,
        url: r.link,
        description: r.snippet ?? "",
      })),
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "Serper",
          "requires a valid apiKey",
        );
      }

      const response = await fetchImpl(`${API_BASE_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({ q: query }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await formatSearchHttpError("Serper", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Serper", status, bodyPart);
      }

      return await response.text();
    },
  });
}

export type SerperSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
