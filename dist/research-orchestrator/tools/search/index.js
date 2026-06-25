import { createBraveSearchTool } from "./brave.js";
import { createExaSearchTool } from "./exa.js";
import { createSerperSearchTool } from "./serper.js";
import { createTavilySearchTool } from "./tavily.js";
import { createSearXNGSearchTool } from "./searxng.js";
import { createAggregateSearchTool } from "./aggregate.js";
import { isValidServiceUrl } from "../../utils/url-validation.js";
/**
 * True if at least one search provider credential is configured. Used to
 * decide whether the aggregate tool has anything to fan out to.
 */
function hasAnySearchKey(searchKeys) {
    if (!searchKeys)
        return false;
    return Boolean(searchKeys.braveApiKey ??
        searchKeys.exaApiKey ??
        searchKeys.serperApiKey ??
        searchKeys.tavilyApiKey ??
        (searchKeys.searxngBaseUrl && isValidServiceUrl(searchKeys.searxngBaseUrl)));
}
export function createSearchTools(searchKeys, fetchFn) {
    const tools = {};
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
        tools.aggregate_search = createAggregateSearchTool(searchKeys, fetchFn);
    }
    return tools;
}
//# sourceMappingURL=index.js.map