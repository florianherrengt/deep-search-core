import { createSearchExtractEngine, createAiSdkSearchTool, searchQueryInputSchema, } from "../../../search-extract/index.js";
export const tavilySearchInputSchema = searchQueryInputSchema;
export function createTavilySearchTool(apiKey, fetchFn) {
    const engine = createSearchExtractEngine({
        fetch: fetchFn,
        searchProviders: {
            tavily: { apiKey },
        },
    });
    return createAiSdkSearchTool(engine, "tavily", "Search the web with Tavily Search");
}
//# sourceMappingURL=tavily.js.map