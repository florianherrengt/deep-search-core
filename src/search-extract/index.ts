export {
  SEARCH_PROVIDER_NAMES,
  searchResultSchema,
  searchQueryInputSchema,
} from "./core/types.js";
export type {
  SearchProviderName,
  SearchResult,
  SearchOptions,
  SearchAllOptions,
  PageLoader,
  PageLoadOptions,
  PageRenderOptions,
  Summarizer,
  ExtractOptions,
  ExtractResult,
} from "./core/types.js";

export {
  SearchProviderConfigError,
  SearchProviderError,
  SearchProviderResponseError,
  UrlValidationError,
} from "./core/errors.js";

export {
  rateLimit,
  setRateLimiter,
  resetRateLimiter,
  getRateLimiter,
} from "./core/rate-limit.js";
export type { RateLimiter } from "./core/rate-limit.js";

export { createSearchExtractEngine } from "./core/engine.js";
export type { SearchExtractEngine, CreateEngineConfig } from "./core/engine.js";

export { createSearchProvider, formatSearchHttpError } from "./search/create-search-provider.js";
export { formatSearchResults } from "./search/format.js";

export { createBraveSearch } from "./search/brave.js";
export { createExaSearch } from "./search/exa.js";
export { createSerperSearch } from "./search/serper.js";
export { createTavilySearch } from "./search/tavily.js";
export { createSearXNGFetchSearch } from "./search/searxng.js";

export type { BraveConfig, BraveSearchFn } from "./search/brave.js";
export type { ExaConfig, ExaSearchFn } from "./search/exa.js";
export type { SerperConfig, SerperSearchFn } from "./search/serper.js";
export type { TavilyConfig, TavilySearchFn } from "./search/tavily.js";
export type { SearXNGConfig, SearXNGFetchSearchFn } from "./search/searxng.js";

export { sanitizeHtml, extractVisibleTextFromHtml, MIN_CONTENT_LENGTH } from "./extract/sanitize-html.js";
export { loadPageHtml, validateUrl } from "./extract/page-loader.js";

export { PageExtractor } from "./extract/extractors/base.js";
export type { ExtractorInput, ExtractorResult } from "./extract/extractors/base.js";
export { extractors } from "./extract/extractors/registry.js";

export { parseRedditJson } from "./extract/extractors/reddit-json-parser.js";
export type { RedditPost, RedditComment } from "./extract/extractors/reddit-json-parser.js";

export {
  RedditExtractor,
  isRedditChallengeHtml,
  parseOldRedditHtml,
} from "./extract/extractors/reddit.js";

export {
  AmazonExtractor,
  isAmazonChallengePage,
  parseAmazonProductHtml,
} from "./extract/extractors/amazon.js";

export { ShopifyExtractor } from "./extract/extractors/shopify.js";

export { extractPage } from "./extract/extract-page.js";
export type { ExtractPageDeps } from "./extract/extract-page.js";

export {
  createAiSdkSummarizer,
  createAiSdkSearchTool,
  createAiSdkExtractPageContentTool,
} from "./adapters/ai-sdk.js";

export { createTauriPageLoader } from "./adapters/tauri.js";
export type { TauriLoaderCallbacks } from "./adapters/tauri.js";
export {
  SCRAPE_DO_API_URL,
  createScrapeDoPageLoader,
  fetchScrapeDoHtml,
} from "./adapters/scrape-do.js";
export type { ScrapeDoPageLoaderConfig } from "./adapters/scrape-do.js";
