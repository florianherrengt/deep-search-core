# Bug Hunt Memory

## Current status

- Last run: 2026-07-03
- Last inspected commit: d4b9728 (feat: add github + trustpilot extractors and search aggregation)
- Suggested next focus: **Research lifecycle / streaming & guard layer** (`orchestrator/stream.ts`, `guards/agent-guards.ts`, `guards/tool-call-requirements.ts`). Untouched this run; complex async + state. Also revisit remaining OPEN RISKS below.

## Recent runs

Keep only the last 3 runs.

### 2026-07-03 — commit d4b9728

- **Focus areas:** search aggregation + engine, github extractor, trustpilot extractor, orchestrator tool wiring.
- **Bugs fixed (all verified with regression tests that fail on the old code):**
  1. **CRITICAL — aggregate search deadlock.** `engine.search("aggregate", q)` wrapped the whole fan-out in the single-slot `rateLimit()` while the aggregate fn rate-limited each provider call inside it → re-entrant deadlock, hung forever in production. Existing tests masked it by stubbing the limiter to concurrency 10. Fix: bypass the outer limiter for the `"aggregate"` provider (`core/engine.ts`). Added 2 tests using the REAL default limiter.
  2. **HIGH — GitHub `/users/<name>` accepted as repo.** Missing `"users"` in `RESERVED_FIRST_SEGMENTS`; profile pages claimed by extractor, profile README misparsed as repo. Fix: reserved set (`extractors/github.ts`).
  3. **HIGH — Trustpilot `/reviews/` (plural) rejected** by exported `isTrustpilotReviewPageUrl`. Fix: accept both `review`/`reviews` first segment.
  4. **HIGH — Trustpilot review counts with K/M suffix dropped to null.** `([\d,]+)` regex missed `12K reviews`. Fix: shared COUNT pattern handling abbreviations + decimals.
  5. **MEDIUM — Trustpilot `profileStatus` greedy over-capture.** `[^.|\n]+` over single-line body swallowed adjacent trust score digit (`"September 2025 4"`). Fix: bounded regex with lookahead.
  6. **MEDIUM — `mergeResults(NaN)` silently dropped all results.** `slice(0, NaN)` → `[]`. Fix: non-finite cap → default.
  7. **MEDIUM — `normalizeUrl` kept userinfo.** `user:pass@` not stripped → credential pass-through + dedup miss + phishing-vector passthrough. Fix: clear username/password.
  8. **HIGH (integration) — `GithubExtractor` not registered in orchestrator.** `tools/extract-page-content.ts` cached-engine extractor list omitted `GithubExtractor` → GitHub URLs fell through to generic extraction. Fix: added to list.
- **Tests added:** 12 new (engine deadlock ×2, aggregate edge cases ×5, github url ×1, trustpilot plural/abbrev-count/profileStatus ×4). Suite 517 → 528.
- **Verification:** `npm test` (528 passed), `npm run typecheck`, `npm run build` — all clean. Each fix confirmed by temporarily reverting and watching its test fail.
- **Remaining risks:** see Open risks.

## Recurring patterns

Stable lessons from previous runs:

- **Re-entrant rate-limit deadlock.** The single-slot default limiter + nested `rateLimit()` calls deadlock. Any fan-out that rate-limits children must NOT be wrapped again. Tests that stub the limiter mask this — always keep one test on the real limiter per fan-out path.
- **Greedy regex over `normalizeText($("body").text())`.** Body is one line; `[^.\n]+` runs across the whole document. Bound captures with lookaheads before known following fields (trust score, review count).
- **Number parsing assumes bare digits.** Rendered counts use `K`/`M`/commas; parsers must handle all forms.
- **Two-place extractor registration.** Adding an extractor to the package does NOT register it in the orchestrator's `extract_page_content` tool. Check both sites when adding extractors.
- **URL-shape guards miss sibling reserved paths.** 2-segment guards (owner/repo) need a complete reserved-segment set.

## Recently inspected areas

Areas checked recently with no major findings:

- (none beyond this run's focus yet)

## Open risks

Known risks that were not fixed yet:

- **Risk:** Trustpilot extractor has ZERO coverage of the `__NEXT_DATA__` parse path (`parseNextData`/`collectObjects`/`parseNextReview`/`parseBusinessScore`), which is the primary real-Trustpilot data source. Test fixtures are synthetic HTML.
  - Files: `extract/extractors/trustpilot.ts` (lines ~607-645), `__tests__/trustpilot-extractor.test.ts`.
  - Why it matters: the most impactful real-world path is untested; selector drift will silently produce empty fields. Several fixed bugs (K/M counts, profileStatus) were only discoverable against realistic markup.
  - Suggested follow-up: capture a sanitized real `__NEXT_DATA__` blob and add fixture-driven tests.
- **Risk:** `extractProfileStatus` still does a whole-body scan; the bounded regex is heuristic. If Trustpilot reorders fields, capture may drift again.
  - Files: `extractors/trustpilot.ts` `extractProfileStatus`.
  - Suggested follow-up: prefer a targeted element selector once real markup is available.
- **Risk:** GitHub `extractContributors` uses broad `.avatar` / `img[class*='avatar']` selectors that can pull non-contributor avatars; tests use `toContain` not `toEqual` so won't catch leakage.
  - Files: `extractors/github.ts` ~231-246; `__tests__/github-extractor.test.ts`.
- **Risk:** GitHub `blockMarkdown`/`inlineMarkdown` recurse with no depth guard → `RangeError` stack overflow on adversarial deeply-nested README HTML; nested lists flattened; tables with unequal cell counts emit malformed GFM.
  - Files: `extractors/github.ts` ~303-436.
  - Suggested follow-up: add depth cap; normalize table columns.
- **Risk:** Trustpilot reply-company capture is fragile for company names containing date-like substrings; reply body filter compares whole-part equality and leaks when company+date share a `<p>`.
  - Files: `extractors/trustpilot.ts` ~358-392.
- **Risk:** `mergeResults` keeps the FIRST engine's URL verbatim in output, so if the first engine attaches tracking junk the normalized key strips but the surfaced URL keeps it.
  - Files: `search/aggregate.ts` ~118-141.
  - Suggested follow-up: surface the normalized URL (or shortest clean URL seen) instead of first-emitted.
- **Risk:** Stream/guard layer (`orchestrator/stream.ts`, `guards/*`) entirely uninspected this run.
  - Suggested follow-up: next run primary focus.
