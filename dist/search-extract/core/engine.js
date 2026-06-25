import { AGGREGATABLE_PROVIDER_NAMES, } from "./types.js";
import { SearchProviderConfigError, AggregateSearchError } from "./errors.js";
import { rateLimit } from "./rate-limit.js";
import { createBraveSearch } from "../search/brave.js";
import { createExaSearch } from "../search/exa.js";
import { createSerperSearch } from "../search/serper.js";
import { createTavilySearch } from "../search/tavily.js";
import { createSearXNGFetchSearch, } from "../search/searxng.js";
import { DEFAULT_AGGREGATE_NUM_RESULTS, mergeResults, } from "../search/aggregate.js";
function getSearchFn(config, provider) {
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
function createAggregateSearchFn(config) {
    const perEngineFns = [];
    for (const name of AGGREGATABLE_PROVIDER_NAMES) {
        try {
            perEngineFns.push(getSearchFn(config, name));
        }
        catch {
            // Skip unconfigured providers.
        }
    }
    return async (query, signal) => {
        if (perEngineFns.length === 0) {
            throw new SearchProviderConfigError("Aggregate", "requires at least one underlying search provider to be configured");
        }
        const settled = await Promise.allSettled(perEngineFns.map((fn) => rateLimit(() => fn(query, signal), signal)));
        // If the caller aborted, propagate that directly rather than wrapping it
        // in an AggregateSearchError — aborts are intentional cancellations, not
        // provider failures, and downstream handlers key off the AbortError name.
        if (signal?.aborted) {
            throw new DOMException("The operation was aborted.", "AbortError");
        }
        const engineResults = [];
        const errors = [];
        for (const result of settled) {
            if (result.status === "fulfilled") {
                engineResults.push(result.value);
            }
            else {
                errors.push(result.reason);
            }
        }
        if (engineResults.length === 0 && errors.length > 0) {
            throw new AggregateSearchError(errors, `Aggregate search failed: all underlying providers failed for query "${query}"`);
        }
        const merged = mergeResults(engineResults, DEFAULT_AGGREGATE_NUM_RESULTS);
        return merged;
    };
}
function getExtractDeps(config) {
    return {
        fetch: config.fetch,
        pageLoader: config.pageLoader,
        summarizer: config.summarizer,
        extractors: config.extractors,
    };
}
export function createSearchExtractEngine(config) {
    return {
        async search(provider, query, options) {
            const searchFn = getSearchFn(config, provider);
            return rateLimit(() => searchFn(query, options?.signal), options?.signal);
        },
        async searchAll(query, options) {
            // The "aggregate" provider is itself a fan-out over the others, so
            // exclude it from the default set to avoid double-counting. Callers
            // can still request it explicitly via `options.providers`.
            const requestedProviders = options?.providers ??
                [...AGGREGATABLE_PROVIDER_NAMES];
            const enabledProviders = [];
            for (const name of requestedProviders) {
                try {
                    const fn = getSearchFn(config, name);
                    enabledProviders.push({ name, fn });
                }
                catch {
                    // Skip unconfigured providers in searchAll
                }
            }
            if (enabledProviders.length === 0) {
                return [];
            }
            const allResults = await Promise.allSettled(enabledProviders.map(({ name, fn }) => rateLimit(() => fn(query, options?.signal), options?.signal).then((results) => ({ name, results }))));
            const merged = [];
            const errors = [];
            for (const result of allResults) {
                if (result.status === "fulfilled") {
                    merged.push(...result.value.results);
                }
                else {
                    errors.push(result.reason);
                }
            }
            if (merged.length === 0 && errors.length > 0 && !options?.partial) {
                throw new AggregateSearchError(errors, `All search providers failed for query "${query}"`);
            }
            return merged;
        },
        async extract(url, options) {
            const { extractPage } = await import("../extract/extract-page.js");
            return extractPage(url, options, getExtractDeps(config));
        },
    };
}
//# sourceMappingURL=engine.js.map