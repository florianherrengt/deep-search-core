import { createSearchExtractEngine, createAiSdkSearchTool, searchQueryInputSchema, } from "../../../search-extract/index.js";
export const serperSearchInputSchema = searchQueryInputSchema;
export function createSerperSearchTool(apiKey, fetchFn) {
    const engine = createSearchExtractEngine({
        fetch: fetchFn,
        searchProviders: {
            serper: { apiKey },
        },
    });
    return createAiSdkSearchTool(engine, "serper", "Search the web with Serper (Google Search API)");
}
//# sourceMappingURL=serper.js.map