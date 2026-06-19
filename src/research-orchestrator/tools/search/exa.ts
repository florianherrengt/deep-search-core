import {
  createSearchExtractEngine,
  createAiSdkSearchTool,
  searchQueryInputSchema,
} from "../../../search-extract/index.js";

export const exaSearchInputSchema = searchQueryInputSchema;

export function createExaSearchTool(apiKey: string, fetchFn: typeof globalThis.fetch) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      exa: { apiKey },
    },
  });
  return createAiSdkSearchTool(engine, "exa", "Search the web with Exa");
}
