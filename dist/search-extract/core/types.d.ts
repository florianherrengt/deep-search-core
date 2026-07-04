import { z } from "zod";
export declare const SEARCH_PROVIDER_NAMES: readonly ["brave", "exa", "serper", "tavily", "searxng", "youtube", "aggregate"];
export type SearchProviderName = (typeof SEARCH_PROVIDER_NAMES)[number];
/**
 * Providers that can be queried individually and aggregated by the
 * "aggregate" provider. Excludes "aggregate" itself to avoid recursion.
 */
export declare const AGGREGATABLE_PROVIDER_NAMES: readonly ["brave", "exa", "serper", "tavily", "searxng"];
export type AggregatableProviderName = (typeof AGGREGATABLE_PROVIDER_NAMES)[number];
export declare const searchResultSchema: z.ZodObject<{
    title: z.ZodString;
    url: z.ZodString;
    description: z.ZodString;
    snippet: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
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
export declare const searchQueryInputSchema: z.ZodObject<{
    query: z.ZodString;
}, z.core.$strip>;
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
//# sourceMappingURL=types.d.ts.map