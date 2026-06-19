import { z } from "zod";
import type { SearchResult } from "../core/types.js";
export interface CreateSearchProviderOptions<TResponse> {
    /** Human-readable provider name used in error messages (e.g. "Tavily"). */
    providerName: string;
    /** Schema to validate the response. Can be the full envelope or the array. */
    responseSchema: z.ZodType<TResponse>;
    /** Map a parsed response to SearchResult[]. */
    mapResults: (response: TResponse) => SearchResult[];
    /**
     * Execute the HTTP request. Return the response body as a string.
     * Return "" if the response should be treated as no results.
     * Throw if the error is fatal and should propagate.
     */
    execute: (query: string, abortSignal?: AbortSignal) => Promise<string>;
    /**
     * If true (default false), throw on response parse failure.
     * If false, return [] on parse failure (matches Brave/Exa/SearXNG behavior).
     */
    throwOnParseError?: boolean;
}
export declare function createSearchProvider<TResponse>(options: CreateSearchProviderOptions<TResponse>): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export declare function formatSearchHttpError(providerName: string, response: Response): Promise<string>;
//# sourceMappingURL=create-search-provider.d.ts.map