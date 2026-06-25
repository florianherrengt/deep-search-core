import type { SearchKeys } from "../../types";
import { createBraveSearchTool } from "./brave";
import { createExaSearchTool } from "./exa";
import { createSerperSearchTool } from "./serper";
import { createTavilySearchTool } from "./tavily";
import { createSearXNGSearchTool } from "./searxng";
import { createAggregateSearchTool } from "./aggregate";
import { isValidServiceUrl } from "../../utils/url-validation";
import type { ToolSet } from "ai";

/**
 * True if at least one search provider credential is configured. Used to
 * decide whether the aggregate tool has anything to fan out to.
 */
function hasAnySearchKey(searchKeys: SearchKeys | undefined): boolean {
  if (!searchKeys) return false;
  return Boolean(
    searchKeys.braveApiKey ??
      searchKeys.exaApiKey ??
      searchKeys.serperApiKey ??
      searchKeys.tavilyApiKey ??
      (searchKeys.searxngBaseUrl && isValidServiceUrl(searchKeys.searxngBaseUrl)),
  );
}

export function createSearchTools(
  searchKeys: SearchKeys | undefined,
  fetchFn: typeof globalThis.fetch,
): ToolSet {
  const tools: ToolSet = {};
  if (searchKeys?.braveApiKey) {
    tools.brave_search = createBraveSearchTool(searchKeys.braveApiKey, fetchFn);
  }
  if (searchKeys?.exaApiKey) {
    tools.exa_search = createExaSearchTool(searchKeys.exaApiKey, fetchFn);
  }
  if (searchKeys?.serperApiKey) {
    tools.serper_search = createSerperSearchTool(searchKeys.serperApiKey, fetchFn);
  }
  if (searchKeys?.tavilyApiKey) {
    tools.tavily_search = createTavilySearchTool(searchKeys.tavilyApiKey, fetchFn);
  }
  if (searchKeys?.searxngBaseUrl && isValidServiceUrl(searchKeys.searxngBaseUrl)) {
    tools.searxng_search = createSearXNGSearchTool(searchKeys.searxngBaseUrl, fetchFn);
  }
  // The aggregate tool fans out to every configured provider above, so only
  // register it when at least one is available.
  if (hasAnySearchKey(searchKeys)) {
    tools.aggregate_search = createAggregateSearchTool(searchKeys!, fetchFn);
  }
  return tools;
}
