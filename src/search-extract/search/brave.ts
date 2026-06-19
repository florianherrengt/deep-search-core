import { z } from "zod";
import {
  createSearchProvider,
  formatSearchHttpError,
} from "./create-search-provider.js";
import {
  SearchProviderError,
  SearchProviderConfigError,
} from "../core/errors.js";
import { searchResultSchema } from "../core/types.js";
import type { SearchResult } from "../core/types.js";

const API_BASE_URL = "https://api.search.brave.com/res/v1";

const BraveWebResponseSchema = z.object({
  web: z
    .object({
      results: z.array(searchResultSchema).optional(),
    })
    .optional(),
});

export interface BraveConfig {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

export function createBraveSearch(config: BraveConfig) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";

  if (!apiKey) {
    // validate lazily at call time
  }

  return createSearchProvider({
    providerName: "Brave",
    responseSchema: BraveWebResponseSchema,
    throwOnParseError: true,
    mapResults: (r) => r.web?.results ?? [],
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "Brave",
          "requires a valid apiKey",
        );
      }

      const url = new URL(`${API_BASE_URL}/web/search`);
      url.searchParams.set("q", query);

      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: "application/json",
          "x-subscription-token": apiKey,
        },
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await formatSearchHttpError("Brave", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Brave", status, bodyPart);
      }

      return await response.text();
    },
  });
}

export type BraveSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
