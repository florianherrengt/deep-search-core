import { z } from "zod";

export const SEARCH_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng",
  "youtube",
  "aggregate",
] as const;

export type SearchProviderName = (typeof SEARCH_PROVIDER_NAMES)[number];

/**
 * Providers that can be queried individually and aggregated by the
 * "aggregate" provider. Excludes "aggregate" itself to avoid recursion.
 */
export const AGGREGATABLE_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng",
] as const;

export type AggregatableProviderName =
  (typeof AGGREGATABLE_PROVIDER_NAMES)[number];

export const searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
  snippet: z.string().optional(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

/**
 * A SearchResult augmented with cross-engine ranking signals produced by
 * merging results from multiple providers.
 *
 * - `frequency`: how many distinct engines returned this URL.
 * - `bestPosition`: the best (lowest) 1-based rank observed across engines.
 */
export interface MergedResult extends SearchResult {
  frequency: number;
  bestPosition: number;
}

export const searchQueryInputSchema = z.object({
  query: z.string().min(1).describe("Search query"),
});

export interface SearchOptions {
  signal?: AbortSignal;
}

export interface SearchAllOptions {
  signal?: AbortSignal;
  providers?: SearchProviderName[];
  /** If true, ignore per-provider errors and return partial results. Default false. */
  partial?: boolean;
}

export interface PageLoadOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface PageRenderOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface PageLoader {
  fetchHtml?: (url: string, options: PageLoadOptions) => Promise<string | null>;
  renderHtml?: (url: string, options: PageRenderOptions) => Promise<string | null>;
}

export type Summarizer = (input: {
  content: string;
  query?: string;
  signal?: AbortSignal;
}) => Promise<string>;

export interface ExtractOptions {
  method?: "auto" | "fetch" | "render";
  summarize?: boolean;
  query?: string;
  signal?: AbortSignal;
}

export interface ExtractResult {
  url: string;
  content: string;
  summary?: string;
  html?: string | null;
  usedCustomExtractor: boolean;
  extractorName?: string;
  method: "fetch" | "render" | "custom";
  warnings?: string[];
}
