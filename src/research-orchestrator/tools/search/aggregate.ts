import {
  AGGREGATABLE_PROVIDER_NAMES,
  DEFAULT_AGGREGATE_NUM_RESULTS,
  createBraveSearch,
  createExaSearch,
  createSearXNGFetchSearch,
  createSerperSearch,
  createTavilySearch,
  formatSearchResults,
  mergeResults,
  searchQueryInputSchema,
  type AggregatableProviderName,
  type SearchResult,
} from "../../../search-extract/index.js";
import {
  AggregateSearchError,
  SearchProviderConfigError,
} from "../../../search-extract/core-api.js";
import { tool, zodSchema } from "ai";
import type { SearchKeys } from "../../types";
import { isValidServiceUrl } from "../../utils/url-validation";
import { normalizeSearchKeys } from "./search-keys";

export const aggregateSearchInputSchema = searchQueryInputSchema;
const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;

export interface CreateAggregateSearchToolOptions {
  providerTimeoutMs?: number;
}

type SearchFn = (
  query: string,
  signal?: AbortSignal,
) => Promise<SearchResult[]>;

interface ConfiguredSearchProvider {
  name: AggregatableProviderName;
  search: SearchFn;
}

function getConfiguredSearchProviders(
  searchKeys: SearchKeys,
  fetchFn: typeof globalThis.fetch,
): ConfiguredSearchProvider[] {
  const keys = normalizeSearchKeys(searchKeys);
  const providers: ConfiguredSearchProvider[] = [];

  if (keys.braveApiKey) {
    providers.push({
      name: "brave",
      search: createBraveSearch({ apiKey: keys.braveApiKey, fetch: fetchFn }),
    });
  }
  if (keys.exaApiKey) {
    providers.push({
      name: "exa",
      search: createExaSearch({ apiKey: keys.exaApiKey, fetch: fetchFn }),
    });
  }
  if (keys.serperApiKey) {
    providers.push({
      name: "serper",
      search: createSerperSearch({ apiKey: keys.serperApiKey, fetch: fetchFn }),
    });
  }
  if (keys.tavilyApiKey) {
    providers.push({
      name: "tavily",
      search: createTavilySearch({ apiKey: keys.tavilyApiKey, fetch: fetchFn }),
    });
  }
  if (keys.searxngBaseUrl && isValidServiceUrl(keys.searxngBaseUrl)) {
    providers.push({
      name: "searxng",
      search: createSearXNGFetchSearch({ baseUrl: keys.searxngBaseUrl, fetch: fetchFn }),
    });
  }

  const byName = new Map(providers.map((provider) => [provider.name, provider]));
  return AGGREGATABLE_PROVIDER_NAMES.flatMap((providerName) => {
    const provider = byName.get(providerName);
    return provider ? [provider] : [];
  });
}

/**
 * Build an AI SDK search tool that queries every configured provider in
 * parallel and returns results merged by frequency. Only providers whose
 * credentials are present in `searchKeys` contribute to the merge.
 */
export function createAggregateSearchTool(
  searchKeys: SearchKeys,
  fetchFn: typeof globalThis.fetch,
  options: CreateAggregateSearchToolOptions = {},
) {
  const providers = getConfiguredSearchProviders(searchKeys, fetchFn);
  const providerTimeoutMs = options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;

  return tool({
    description:
      "Search the web using all configured providers in parallel and merge the results. " +
      "Results that appear across multiple providers are deduplicated and ranked by " +
      "how many engines returned them, then by best per-engine rank. Use this when a " +
      "single provider's coverage is insufficient or when cross-source corroboration " +
      "matters more than latency.",
    strict: true,
    inputSchema: zodSchema(aggregateSearchInputSchema),
    execute: async ({ query }, ctx) => {
      if (providers.length === 0) {
        throw new SearchProviderConfigError(
          "Aggregate",
          "requires at least one underlying search provider to be configured",
        );
      }

      const settled = await Promise.allSettled(
        providers.map((provider) =>
          runProviderSearchWithTimeout(
            provider,
            query,
            ctx?.abortSignal,
            providerTimeoutMs,
          ),
        ),
      );

      if (ctx?.abortSignal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      const engineResults: SearchResult[][] = [];
      const errors: Error[] = [];

      for (const result of settled) {
        if (result.status === "fulfilled") {
          engineResults.push(result.value);
        } else {
          errors.push(result.reason as Error);
        }
      }

      if (engineResults.length === 0 && errors.length > 0) {
        throw new AggregateSearchError(
          errors,
          `Aggregate search failed: all underlying providers failed for query "${query}"`,
        );
      }

      return formatSearchResults(
        mergeResults(engineResults, DEFAULT_AGGREGATE_NUM_RESULTS),
      );
    },
  });
}

async function runProviderSearchWithTimeout(
  provider: ConfiguredSearchProvider,
  query: string,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const { signal, cleanup } = createChildSignalWithTimeout(
    parentSignal,
    timeoutMs,
    provider.name,
  );

  try {
    return await Promise.race([
      provider.search(query, signal),
      rejectOnAbort(signal),
    ]);
  } finally {
    cleanup();
  }
}

function createChildSignalWithTimeout(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  providerName: AggregatableProviderName,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(
        `${providerName} search timed out after ${timeoutMs}ms.`,
        "TimeoutError",
      ),
    );
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(
      parentSignal?.reason ??
        new DOMException("The operation was aborted.", "AbortError"),
    );
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(getAbortReason(signal)), {
      once: true,
    });
  });
}

function getAbortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}
