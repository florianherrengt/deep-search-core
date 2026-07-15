import { type AggregatableProviderName, type MergedResult, type SearchProviderName, type SearchResult, type SearchAllOptions, type PageLoader, type Summarizer, type ExtractOptions, type ExtractResult } from "./types.js";
import { type BraveConfig } from "../search/brave.js";
import { type ExaConfig } from "../search/exa.js";
import { type SerperConfig } from "../search/serper.js";
import { type TavilyConfig } from "../search/tavily.js";
import { type SearXNGConfig } from "../search/searxng.js";
import { type YouTubeConfig } from "../search/youtube.js";
import { type HackerNewsConfig } from "../search/hacker-news.js";
import type { PageExtractor } from "../extract/extractors/base.js";
export interface CreateEngineConfig {
    fetch?: typeof globalThis.fetch;
    searchProviders?: {
        brave?: BraveConfig;
        exa?: ExaConfig;
        serper?: SerperConfig;
        tavily?: TavilyConfig;
        searxng?: SearXNGConfig;
        youtube?: YouTubeConfig;
        hackerNews?: HackerNewsConfig;
    };
    pageLoader?: PageLoader;
    summarizer?: Summarizer;
    extractors?: PageExtractor[];
}
export interface SearchExtractEngine {
    search(provider: SearchProviderName, query: string, options?: {
        signal?: AbortSignal;
    }): Promise<SearchResult[]>;
    searchAll(query: string, options?: SearchAllOptions): Promise<SearchResult[]>;
    searchAggregate(query: string, options?: {
        signal?: AbortSignal;
    }): Promise<AggregateSearchResult>;
    extract(url: string, options?: ExtractOptions): Promise<ExtractResult>;
}
export type AggregateSearchProviderDiagnostic = {
    provider: AggregatableProviderName;
    status: "fulfilled";
    resultCount: number;
} | {
    provider: AggregatableProviderName;
    status: "rejected";
    error: Error;
};
export interface AggregateSearchResult {
    results: MergedResult[];
    diagnostics: AggregateSearchProviderDiagnostic[];
}
export declare function createSearchExtractEngine(config: CreateEngineConfig): SearchExtractEngine;
//# sourceMappingURL=engine.d.ts.map