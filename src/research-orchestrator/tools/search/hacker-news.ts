import {
  createAiSdkSearchTool,
  createSearchExtractEngine,
  searchQueryInputSchema,
} from "../../../search-extract/index.js";

export const hackerNewsSearchInputSchema = searchQueryInputSchema;

export function createHackerNewsSearchTool(fetchFn: typeof globalThis.fetch) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      hackerNews: {},
    },
  });
  return createAiSdkSearchTool(
    engine,
    "hackernews",
    "Search Hacker News stories via HN Search. Results are Hacker News discussion URLs suitable for follow-up extraction.",
  );
}
