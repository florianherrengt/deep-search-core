import type { MergedResult, SearchResult } from "../core/types.js";
/**
 * Normalize a URL for deduplication across search engines.
 *
 * - lowercases the hostname
 * - drops the fragment
 * - removes tracking query parameters
 * - removes userinfo (`user:pass@`), which is never meaningful for search
 *   dedup and is a known phishing/obfuscation vector (`https://good@evil`)
 * - strips a single trailing slash from non-root paths
 *
 * Throws if `rawUrl` is not a parseable URL (callers should pre-validate).
 */
export declare function normalizeUrl(rawUrl: string): string;
/**
 * Default cap on the number of merged results returned when no explicit
 * `numResults` is provided. Chosen to match the order of magnitude of
 * individual engine result counts while remaining useful for downstream
 * ranking.
 */
export declare const DEFAULT_AGGREGATE_NUM_RESULTS = 20;
/**
 * Merge results from multiple engines into a deduplicated, frequency-ranked
 * list.
 *
 * Ranking rules (in order):
 * 1. Higher `frequency` (appeared in more engines) ranks first.
 * 2. Ties are broken by lower `bestPosition` (ranked better within at least
 *    one engine).
 *
 * Per-engine duplicates (same normalized URL appearing twice in one engine's
 * results) are counted only once.
 *
 * When the same URL is contributed by multiple engines, the longest title and
 * longest snippet/description seen are kept, on the assumption that longer
 * text is more informative.
 */
export declare function mergeResults(engineResults: ReadonlyArray<ReadonlyArray<SearchResult>>, numResults?: number): MergedResult[];
//# sourceMappingURL=aggregate.d.ts.map