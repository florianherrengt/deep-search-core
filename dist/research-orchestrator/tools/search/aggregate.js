import { createSearchExtractEngine, createAiSdkSearchTool, searchQueryInputSchema, } from "../../../search-extract/index.js";
export const aggregateSearchInputSchema = searchQueryInputSchema;
/**
 * Build an AI SDK search tool that queries every configured provider in
 * parallel and returns results merged by frequency. Only providers whose
 * credentials are present in `searchKeys` contribute to the merge.
 */
export function createAggregateSearchTool(searchKeys, fetchFn) {
    const engine = createSearchExtractEngine({
        fetch: fetchFn,
        searchProviders: {
            brave: searchKeys.braveApiKey ? { apiKey: searchKeys.braveApiKey } : undefined,
            exa: searchKeys.exaApiKey ? { apiKey: searchKeys.exaApiKey } : undefined,
            serper: searchKeys.serperApiKey ? { apiKey: searchKeys.serperApiKey } : undefined,
            tavily: searchKeys.tavilyApiKey ? { apiKey: searchKeys.tavilyApiKey } : undefined,
            searxng: searchKeys.searxngBaseUrl ? { baseUrl: searchKeys.searxngBaseUrl } : undefined,
        },
    });
    return createAiSdkSearchTool(engine, "aggregate", "Search the web using all configured providers in parallel and merge the results. " +
        "Results that appear across multiple providers are deduplicated and ranked by " +
        "how many engines returned them, then by best per-engine rank. Use this when a " +
        "single provider's coverage is insufficient or when cross-source corroboration " +
        "matters more than latency.");
}
//# sourceMappingURL=aggregate.js.map