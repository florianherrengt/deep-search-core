import type { SearchResult } from "../core/types.js";
export interface SearXNGConfig {
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
}
export declare function createSearXNGFetchSearch(config?: SearXNGConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type SearXNGFetchSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=searxng.d.ts.map