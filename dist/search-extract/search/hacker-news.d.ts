import type { SearchResult } from "../core/types.js";
export interface HackerNewsConfig {
    fetch?: typeof globalThis.fetch;
    maxResults?: number;
}
export declare function createHackerNewsSearch(config?: HackerNewsConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type HackerNewsSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=hacker-news.d.ts.map