import {
  SEARCH_PROVIDER_NAMES,
  type SearchProviderName,
  type SearchResult,
  type SearchAllOptions,
  type PageLoader,
  type Summarizer,
  type ExtractOptions,
  type ExtractResult,
} from "./types.js";
import { SearchProviderConfigError, AggregateSearchError } from "./errors.js";
import { rateLimit } from "./rate-limit.js";
import { createBraveSearch, type BraveConfig } from "../search/brave.js";
import { createExaSearch, type ExaConfig } from "../search/exa.js";
import { createSerperSearch, type SerperConfig } from "../search/serper.js";
import { createTavilySearch, type TavilyConfig } from "../search/tavily.js";
import {
  createSearXNGFetchSearch,
  type SearXNGConfig,
} from "../search/searxng.js";
import type { PageExtractor } from "../extract/extractors/base.js";

type SearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;

export interface CreateEngineConfig {
  fetch?: typeof globalThis.fetch;
  searchProviders?: {
    brave?: BraveConfig;
    exa?: ExaConfig;
    serper?: SerperConfig;
    tavily?: TavilyConfig;
    searxng?: SearXNGConfig;
  };
  pageLoader?: PageLoader;
  summarizer?: Summarizer;
  extractors?: PageExtractor[];
}

export interface SearchExtractEngine {
  search(
    provider: SearchProviderName,
    query: string,
    options?: { signal?: AbortSignal },
  ): Promise<SearchResult[]>;
  searchAll(
    query: string,
    options?: SearchAllOptions,
  ): Promise<SearchResult[]>;
  extract(
    url: string,
    options?: ExtractOptions,
  ): Promise<ExtractResult>;
}

function getSearchFn(
  config: CreateEngineConfig,
  provider: SearchProviderName,
): SearchFn {
  const fetchImpl = config.fetch;
  const providers = config.searchProviders ?? {};

  switch (provider) {
    case "brave": {
      const braveConfig = providers.brave;
      if (!braveConfig) {
        throw new SearchProviderConfigError("Brave", "is not configured");
      }
      return createBraveSearch({ ...braveConfig, fetch: braveConfig.fetch ?? fetchImpl });
    }
    case "exa": {
      const exaConfig = providers.exa;
      if (!exaConfig) {
        throw new SearchProviderConfigError("Exa", "is not configured");
      }
      return createExaSearch({ ...exaConfig, fetch: exaConfig.fetch ?? fetchImpl });
    }
    case "serper": {
      const serperConfig = providers.serper;
      if (!serperConfig) {
        throw new SearchProviderConfigError("Serper", "is not configured");
      }
      return createSerperSearch({ ...serperConfig, fetch: serperConfig.fetch ?? fetchImpl });
    }
    case "tavily": {
      const tavilyConfig = providers.tavily;
      if (!tavilyConfig) {
        throw new SearchProviderConfigError("Tavily", "is not configured");
      }
      return createTavilySearch({ ...tavilyConfig, fetch: tavilyConfig.fetch ?? fetchImpl });
    }
    case "searxng": {
      const searxngConfig = providers.searxng;
      if (!searxngConfig) {
        throw new SearchProviderConfigError("SearXNG", "is not configured");
      }
      return createSearXNGFetchSearch({ ...searxngConfig, fetch: searxngConfig.fetch ?? fetchImpl });
    }
  }
}

function getExtractDeps(config: CreateEngineConfig) {
  return {
    fetch: config.fetch,
    pageLoader: config.pageLoader,
    summarizer: config.summarizer,
    extractors: config.extractors,
  };
}

export function createSearchExtractEngine(
  config: CreateEngineConfig,
): SearchExtractEngine {
  return {
    async search(
      provider: SearchProviderName,
      query: string,
      options?: { signal?: AbortSignal },
    ): Promise<SearchResult[]> {
      const searchFn = getSearchFn(config, provider);
      return rateLimit(() => searchFn(query, options?.signal), options?.signal);
    },

    async searchAll(
      query: string,
      options?: SearchAllOptions,
    ): Promise<SearchResult[]> {
      const requestedProviders =
        options?.providers ?? [...SEARCH_PROVIDER_NAMES];
      const enabledProviders: Array<{
        name: SearchProviderName;
        fn: SearchFn;
      }> = [];

      for (const name of requestedProviders) {
        try {
          const fn = getSearchFn(config, name);
          enabledProviders.push({ name, fn });
        } catch {
          // Skip unconfigured providers in searchAll
        }
      }

      if (enabledProviders.length === 0) {
        return [];
      }

      const allResults = await Promise.allSettled(
        enabledProviders.map(({ name, fn }) =>
          rateLimit(() => fn(query, options?.signal), options?.signal).then(
            (results) => ({ name, results }),
          ),
        ),
      );

      const merged: SearchResult[] = [];
      const errors: Error[] = [];

      for (const result of allResults) {
        if (result.status === "fulfilled") {
          merged.push(...result.value.results);
        } else {
          errors.push(result.reason as Error);
        }
      }

      if (merged.length === 0 && errors.length > 0 && !options?.partial) {
        throw new AggregateSearchError(
          errors,
          `All search providers failed for query "${query}"`,
        );
      }

      return merged;
    },

    async extract(
      url: string,
      options?: ExtractOptions,
    ): Promise<ExtractResult> {
      const { extractPage } = await import("../extract/extract-page.js");
      return extractPage(url, options, getExtractDeps(config));
    },
  };
}
