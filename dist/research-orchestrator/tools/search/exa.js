import { createSearchExtractEngine, createAiSdkSearchTool, searchQueryInputSchema, } from "../../../search-extract/index.js";
export const exaSearchInputSchema = searchQueryInputSchema;
export function createExaSearchTool(apiKey, fetchFn) {
    const engine = createSearchExtractEngine({
        fetch: fetchFn,
        searchProviders: {
            exa: { apiKey },
        },
    });
    return createAiSdkSearchTool(engine, "exa", "Search the web with Exa");
}
//# sourceMappingURL=exa.js.map