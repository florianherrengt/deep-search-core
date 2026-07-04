import { createAiSdkSearchTool, createSearchExtractEngine, searchQueryInputSchema, } from "../../../search-extract/index.js";
export const youtubeSearchInputSchema = searchQueryInputSchema;
export function createYouTubeSearchTool(apiKey, fetchFn) {
    const engine = createSearchExtractEngine({
        fetch: fetchFn,
        searchProviders: {
            youtube: { apiKey },
        },
    });
    return createAiSdkSearchTool(engine, "youtube", "Search YouTube videos with the YouTube Data API. Results include video URLs and video IDs for follow-up subtitle extraction.");
}
//# sourceMappingURL=youtube.js.map