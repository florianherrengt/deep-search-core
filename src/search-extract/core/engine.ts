import {
  AGGREGATABLE_PROVIDER_NAMES,
  type AggregatableProviderName,
  type MergedResult,
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
import {
  createYouTubeSearch,
  type YouTubeConfig,
} from "../search/youtube.js";
import {
  createHackerNewsSearch,
  type HackerNewsConfig,
} from "../search/hacker-news.js";
import {
  DEFAULT_AGGREGATE_NUM_RESULTS,
  mergeResults,
} from "../search/aggregate.js";
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
    youtube?: YouTubeConfig;
    hackerNews?: HackerNewsConfig;
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
  searchAggregate(
    query: string,
    options?: { signal?: AbortSignal },
  ): Promise<AggregateSearchResult>;
  extract(
    url: string,
    options?: ExtractOptions,
  ): Promise<ExtractResult>;
}

export type AggregateSearchProviderDiagnostic =
  | {
      provider: AggregatableProviderName;
      status: "fulfilled";
      resultCount: number;
    }
  | {
      provider: AggregatableProviderName;
      status: "rejected";
      error: Error;
    };

export interface AggregateSearchResult {
  results: MergedResult[];
  diagnostics: AggregateSearchProviderDiagnostic[];
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
    case "youtube": {
      const youtubeConfig = providers.youtube;
      if (!youtubeConfig) {
        throw new SearchProviderConfigError("YouTube", "is not configured");
      }
      return createYouTubeSearch({ ...youtubeConfig, fetch: youtubeConfig.fetch ?? fetchImpl });
    }
    case "hackernews": {
      const hackerNewsConfig = providers.hackerNews;
      if (!hackerNewsConfig) {
        throw new SearchProviderConfigError(
          "Hacker News",
          "is not configured",
        );
      }
      return createHackerNewsSearch({
        ...hackerNewsConfig,
        fetch: hackerNewsConfig.fetch ?? fetchImpl,
      });
    }
    case "aggregate": {
      return createAggregateSearchFn(config);
    }
  }
}

/**
 * Build a SearchFn for the "aggregate" provider that fans out to every
 * configured aggregatable provider in parallel, then merges the per-engine
 * result lists via {@link mergeResults}.
 *
 * Unconfigured providers are silently skipped — this matches the philosophy
 * of `searchAll` ("combine what's available") while still letting the caller
 * invoke aggregation through the single-provider `search()` entry point.
 */
function createAggregateSearchFn(config: CreateEngineConfig): SearchFn {
  return async (query: string, signal?: AbortSignal): Promise<SearchResult[]> => {
    const result = await searchAggregate(config, query, signal);
    return result.results;
  };
}

async function searchAggregate(
  config: CreateEngineConfig,
  query: string,
  signal?: AbortSignal,
): Promise<AggregateSearchResult> {
  const providers: Array<{
    name: AggregatableProviderName;
    search: SearchFn;
  }> = [];
  for (const name of AGGREGATABLE_PROVIDER_NAMES) {
    try {
      providers.push({ name, search: getSearchFn(config, name) });
    } catch {
      // Skip unconfigured providers.
    }
  }

  if (providers.length === 0) {
    throw new SearchProviderConfigError(
      "Aggregate",
      "requires at least one underlying search provider to be configured",
    );
  }

  const settled = await Promise.allSettled(
    providers.map(({ search }) =>
      rateLimit(() => search(query, signal), signal),
    ),
  );

  // If the caller aborted, propagate that directly rather than wrapping it
  // in an AggregateSearchError — aborts are intentional cancellations, not
  // provider failures, and downstream handlers key off the AbortError name.
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const engineResults: SearchResult[][] = [];
  const errors: Error[] = [];
  const diagnostics = settled.map((result, index): AggregateSearchProviderDiagnostic => {
    const provider = providers[index]!.name;

    if (result.status === "fulfilled") {
      engineResults.push(result.value);
      return { provider, status: "fulfilled", resultCount: result.value.length };
    }

    const error = result.reason instanceof Error
      ? result.reason
      : new Error(String(result.reason));
    errors.push(error);
    return { provider, status: "rejected", error };
  });

  if (engineResults.length === 0 && errors.length > 0) {
    throw new AggregateSearchError(
      errors,
      `Aggregate search failed: all underlying providers failed for query "${query}"`,
    );
  }

  return {
    results: mergeResults(engineResults, DEFAULT_AGGREGATE_NUM_RESULTS),
    diagnostics,
  };
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
      // The "aggregate" provider fans out to every underlying provider and
      // rate-limits each one individually inside its own SearchFn. Wrapping
      // that orchestration in the outer single-slot rate limiter as well would
      // deadlock: the outer call would hold the only concurrency slot while
      // waiting on the inner per-provider calls that need that same slot. So
      // invoke aggregate directly and let it manage its own rate limiting.
      if (provider === "aggregate") {
        return searchFn(query, options?.signal);
      }
      return rateLimit(() => searchFn(query, options?.signal), options?.signal);
    },

    async searchAll(
      query: string,
      options?: SearchAllOptions,
    ): Promise<SearchResult[]> {
      // The "aggregate" provider is itself a fan-out over the others, so
      // exclude it from the default set to avoid double-counting. Callers
      // can still request it explicitly via `options.providers`.
      const requestedProviders =
        options?.providers ??
        ([...AGGREGATABLE_PROVIDER_NAMES] as SearchProviderName[]);
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

    async searchAggregate(
      query: string,
      options?: { signal?: AbortSignal },
    ): Promise<AggregateSearchResult> {
      return searchAggregate(config, query, options?.signal);
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
