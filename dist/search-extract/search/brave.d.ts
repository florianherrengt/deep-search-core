import type { SearchResult } from "../core/types.js";
export interface BraveConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
}
export declare function createBraveSearch(config: BraveConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type BraveSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=brave.d.ts.map