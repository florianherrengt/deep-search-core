import type {
  MergedResult,
  SearchResult,
} from "../core/types.js";

/**
 * Query-string parameters that are stripped during URL normalization because
 * they are tracking identifiers rather than content identifiers.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_eid",
]);

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
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  url.hostname = url.hostname.toLowerCase();
  url.username = "";
  url.password = "";
  url.hash = "";

  const toDelete: string[] = [];
  url.searchParams.forEach((_, key) => {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      toDelete.push(key);
    }
  });
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;

  return url.toString();
}

/**
 * Default cap on the number of merged results returned when no explicit
 * `numResults` is provided. Chosen to match the order of magnitude of
 * individual engine result counts while remaining useful for downstream
 * ranking.
 */
export const DEFAULT_AGGREGATE_NUM_RESULTS = 20;

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
export function mergeResults(
  engineResults: ReadonlyArray<ReadonlyArray<SearchResult>>,
  numResults: number = DEFAULT_AGGREGATE_NUM_RESULTS,
): MergedResult[] {
  const groups = new Map<
    string,
    {
      url: string;
      title: string;
      description: string;
      snippet?: string;
      frequency: number;
      bestPosition: number;
    }
  >();

  for (const results of engineResults) {
    const engineSeen = new Set<string>();
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      let normalizedUrl: string;
      try {
        normalizedUrl = normalizeUrl(result.url);
      } catch {
        // Skip results whose URL cannot be parsed — they cannot be
        // reliably deduplicated against other engines.
        continue;
      }

      if (engineSeen.has(normalizedUrl)) continue;
      engineSeen.add(normalizedUrl);

      const position = i + 1;
      const existing = groups.get(normalizedUrl);

      if (existing) {
        existing.frequency += 1;
        if (position < existing.bestPosition) {
          existing.bestPosition = position;
        }
        if (result.title.length > existing.title.length) {
          existing.title = result.title;
        }
        const existingDescLen = existing.description.length;
        if (result.description.length > existingDescLen) {
          existing.description = result.description;
        }
        if (result.snippet && result.snippet.length > (existing.snippet?.length ?? 0)) {
          existing.snippet = result.snippet;
        }
      } else {
        groups.set(normalizedUrl, {
          url: result.url,
          title: result.title,
          description: result.description,
          snippet: result.snippet,
          frequency: 1,
          bestPosition: position,
        });
      }
    }
  }

  const merged = Array.from(groups.values());

  merged.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return a.bestPosition - b.bestPosition;
  });

  // `slice(0, NaN)` returns `[]`, which would silently discard every result
  // for a non-numeric cap. Treat a non-finite cap as "use the default" so a
  // buggy upstream caller cannot erase the data, while still honouring an
  // explicit zero/negative cap (yielding no results).
  const limit = Number.isFinite(numResults)
    ? Math.max(0, Math.floor(numResults))
    : DEFAULT_AGGREGATE_NUM_RESULTS;
  return merged.slice(0, limit);
}
