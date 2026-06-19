import type { SearchResult } from "../core/types.js";
export interface TavilyConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
}
export declare function createTavilySearch(config: TavilyConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type TavilySearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=tavily.d.ts.map