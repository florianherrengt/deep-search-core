import type { SearchResult } from "../core/types.js";
export interface SerperConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
}
export declare function createSerperSearch(config: SerperConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type SerperSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=serper.d.ts.map