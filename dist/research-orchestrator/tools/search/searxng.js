import { validateServiceUrl } from "../../utils/url-validation.js";
import { createSearchExtractEngine, createAiSdkSearchTool, searchQueryInputSchema, } from "../../../search-extract/index.js";
const DEFAULT_BASE_URL = "http://localhost:8080";
export const searxngSearchInputSchema = searchQueryInputSchema;
export function createSearXNGSearchTool(baseUrl = DEFAULT_BASE_URL, fetchFn) {
    validateServiceUrl(baseUrl);
    const engine = createSearchExtractEngine({
        fetch: fetchFn,
        searchProviders: {
            searxng: { baseUrl },
        },
    });
    return createAiSdkSearchTool(engine, "searxng", "Search the web with SearXNG (self-hosted meta search engine)");
}
//# sourceMappingURL=searxng.js.map