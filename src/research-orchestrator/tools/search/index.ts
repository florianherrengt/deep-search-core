import type { SearchKeys } from "../../types";
import { createBraveSearchTool } from "./brave";
import { createExaSearchTool } from "./exa";
import { createSerperSearchTool } from "./serper";
import { createTavilySearchTool } from "./tavily";
import { createSearXNGSearchTool } from "./searxng";
import { createYouTubeSearchTool } from "./youtube";
import { createHackerNewsSearchTool } from "./hacker-news";
import { createAggregateSearchTool } from "./aggregate";
import {
  hasAggregatableSearchProviders,
  normalizeSearchKeys,
} from "./search-keys";
import { isValidServiceUrl } from "../../utils/url-validation";
import type { ToolSet } from "ai";

export function createSearchTools(
  searchKeys: SearchKeys | undefined,
  fetchFn: typeof globalThis.fetch,
): ToolSet {
  const keys = normalizeSearchKeys(searchKeys);
  const tools: ToolSet = {};
  if (keys.braveApiKey) {
    tools.brave_search = createBraveSearchTool(keys.braveApiKey, fetchFn);
  }
  if (keys.exaApiKey) {
    tools.exa_search = createExaSearchTool(keys.exaApiKey, fetchFn);
  }
  if (keys.serperApiKey) {
    tools.serper_search = createSerperSearchTool(keys.serperApiKey, fetchFn);
  }
  if (keys.tavilyApiKey) {
    tools.tavily_search = createTavilySearchTool(keys.tavilyApiKey, fetchFn);
  }
  if (keys.searxngBaseUrl && isValidServiceUrl(keys.searxngBaseUrl)) {
    tools.searxng_search = createSearXNGSearchTool(keys.searxngBaseUrl, fetchFn);
  }
  if (keys.youtubeApiKey) {
    tools.youtube_search = createYouTubeSearchTool(keys.youtubeApiKey, fetchFn);
  }
  if (keys.hackerNews) {
    tools.hacker_news_search = createHackerNewsSearchTool(fetchFn);
  }
  // The aggregate tool fans out to every configured provider above, so only
  // register it when at least one is available.
  if (hasAggregatableSearchProviders(keys)) {
    tools.aggregate_search = createAggregateSearchTool(keys, fetchFn);
  }
  return tools;
}
