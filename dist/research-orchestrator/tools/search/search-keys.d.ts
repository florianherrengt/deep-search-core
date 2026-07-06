import type { SearchKeys } from "../../types";
export type ConfiguredSearchProviderId = "brave" | "exa" | "serper" | "tavily" | "searxng" | "youtube" | "aggregate";
export declare function normalizeSearchKeys(keys: SearchKeys | undefined): SearchKeys;
export declare function hasSearchProviders(keys: SearchKeys | undefined): boolean;
export declare function hasAggregatableSearchProviders(keys: SearchKeys | undefined): boolean;
export declare function getConfiguredSearchProviderIds(keys: SearchKeys | undefined, options?: {
    includeAggregate?: boolean;
}): ConfiguredSearchProviderId[];
//# sourceMappingURL=search-keys.d.ts.map