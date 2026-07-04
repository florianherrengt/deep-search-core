# Invariants

Durable rules this codebase must obey. Bug hunts should check these hold.

## Rate limiting

- The default rate limiter is a **single-slot queue** (concurrency 1, 1 req/sec).
- Any code path that *itself* fans out and rate-limits each child call MUST NOT
  also be wrapped in the outer `rateLimit()` — that is a re-entrant deadlock.
  Currently applies to the `"aggregate"` provider (see `core/engine.ts`).
- Tests that exercise providers usually stub the limiter with concurrency 10
  for speed; this MASKS re-entrant deadlocks. Keep at least one regression
  test per fan-out path that uses the real default limiter.

## Search aggregation (`search/aggregate.ts`)

- `normalizeUrl` strips: fragment, tracking params (case-insensitive), userinfo
  (`user:pass@`), one trailing slash. It lowercases the hostname.
- `mergeResults` must never silently discard all results: a non-finite
  `numResults` falls back to `DEFAULT_AGGREGATE_NUM_RESULTS`; a finite cap is
  clamped to `>= 0`.
- Per-engine duplicates count once; cross-engine dedup keys on normalized URL.

## Extractors (`search-extract/extract/extractors/*`)

- A custom extractor's `canHandle` URL guard must reject non-target pages that
  merely share path shape (e.g. GitHub `/users/<name>` has 2 segments like
  `owner/repo`). Keep `RESERVED_FIRST_SEGMENTS` complete.
- The orchestrator's `extract_page_content` tool registers its own extractor
  list in `tools/extract-page-content.ts`. When a new extractor is added to the
  package, it MUST also be registered there or it silently never runs.
- Regexes that capture numbers from rendered text must handle abbreviated forms
  (`12K`, `3.4M`) and comma-separated forms, not just bare digits.
- Regexes operating on `normalizeText($("body").text())` operate on a SINGLE
  LINE. Greedy `[^.\n]+` runs across the whole document — bound captures
  explicitly with lookaheads before known following fields.

## Error reporting

- AbortErrors must propagate as `AbortError` (name keyed by downstream handlers).
- Provider fan-out returns partial results if ≥1 engine succeeds; only throws
  `AggregateSearchError` when ALL underlying providers fail.
