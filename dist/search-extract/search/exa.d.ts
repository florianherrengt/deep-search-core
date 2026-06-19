import type { SearchResult } from "../core/types.js";
export interface ExaConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
}
export declare function createExaSearch(config: ExaConfig): (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
export type ExaSearchFn = (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
//# sourceMappingURL=exa.d.ts.map