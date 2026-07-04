import type { SearchResult } from "../core/types.js";
export interface YouTubeConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
    maxResults?: number;
}
export declare function createYouTubeSearch(config: YouTubeConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type YouTubeSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=youtube.d.ts.map