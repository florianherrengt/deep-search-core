import {
  createSearchExtractEngine,
  createAiSdkSearchTool,
  searchQueryInputSchema,
} from "../../../search-extract/index.js";

export const braveSearchInputSchema = searchQueryInputSchema;

export function createBraveSearchTool(apiKey: string, fetchFn: typeof globalThis.fetch) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      brave: { apiKey },
    },
  });
  return createAiSdkSearchTool(engine, "brave", "Search the web with Brave Search");
}
