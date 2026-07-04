import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGGREGATE_NUM_RESULTS,
  mergeResults,
  normalizeUrl,
} from "../aggregate.js";
import type { SearchResult } from "../../core/types.js";

function r(
  title: string,
  url: string,
  description = "",
): SearchResult {
  return { title, url, description };
}

describe("normalizeUrl", () => {
  it("lowercases the hostname", () => {
    expect(normalizeUrl("https://EXAMPLE.com/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("strips the fragment", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe(
      "https://example.com/page",
    );
  });

  it("removes known tracking query parameters", () => {
    const out = normalizeUrl(
      "https://example.com/p?utm_source=foo&keep=1&gclid=abc",
    );
    expect(out).toBe("https://example.com/p?keep=1");
  });

  it("removes tracking params case-insensitively", () => {
    const out = normalizeUrl("https://example.com/p?UTM_SOURCE=foo&keep=1");
    expect(out).toBe("https://example.com/p?keep=1");
  });

  it("strips a single trailing slash from non-root paths", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
  });

  it("does not strip the trailing slash from the root path", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("preserves non-tracking query params and their order semantics", () => {
    expect(normalizeUrl("https://example.com/p?a=1&b=2")).toBe(
      "https://example.com/p?a=1&b=2",
    );
  });

  it("throws on an invalid URL", () => {
    expect(() => normalizeUrl("not-a-url")).toThrow();
  });
});

describe("mergeResults", () => {
  it("returns merged results sorted by frequency then bestPosition", () => {
    const engineA: SearchResult[] = [
      r("A-only", "https://a.example/a"),
      r("Shared", "https://shared.example/x", "desc A"),
      r("A-third", "https://a.example/c"),
    ];
    const engineB: SearchResult[] = [
      r("Shared", "https://shared.example/x", "desc B longer"),
      r("B-only", "https://b.example/b"),
    ];

    const merged = mergeResults([engineA, engineB]);

    // The shared URL has frequency 2 and should come first.
    expect(merged[0]).toMatchObject({
      url: "https://shared.example/x",
      frequency: 2,
      bestPosition: 1,
    });
    // Followed by the frequency-1 results ordered by their best position.
    expect(merged[1]).toMatchObject({ url: "https://a.example/a", frequency: 1 });
    expect(merged[2]).toMatchObject({
      url: "https://b.example/b",
      frequency: 1,
    });
    expect(merged[3]).toMatchObject({
      url: "https://a.example/c",
      frequency: 1,
    });
  });

  it("breaks frequency ties using bestPosition across engines", () => {
    // URL X appears at position 3 in engine A and not in engine B.
    // URL Y appears at position 1 in engine B and not in engine A.
    // Both have frequency 1, but Y has the better bestPosition.
    const engineA: SearchResult[] = [
      r("A1", "https://a.example/1"),
      r("A2", "https://a.example/2"),
      r("X", "https://x.example/x"),
    ];
    const engineB: SearchResult[] = [r("Y", "https://y.example/y")];

    const merged = mergeResults([engineA, engineB]);
    const urls = merged.map((m) => m.url);

    // X (bestPosition 3) and Y (bestPosition 1) both have frequency 1,
    // so Y should come first by bestPosition tiebreak.
    expect(urls.indexOf("https://y.example/y")).toBeLessThan(
      urls.indexOf("https://x.example/x"),
    );
  });

  it("deduplicates within a single engine (only counts once)", () => {
    const engine: SearchResult[] = [
      r("Dup", "https://dup.example/"),
      r("Dup again", "https://dup.example/"),
    ];

    const merged = mergeResults([engine]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.frequency).toBe(1);
  });

  it("deduplicates across engines using normalized URLs", () => {
    // Same resource, different URL surfaces (tracking param, trailing slash,
    // fragment, hostname casing).
    const engineA: SearchResult[] = [
      r("A", "https://example.com/page?utm_source=x"),
    ];
    const engineB: SearchResult[] = [
      r("B", "https://EXAMPLE.com/page/#frag"),
    ];
    const engineC: SearchResult[] = [
      r("C", "https://example.com/page/"),
    ];

    const merged = mergeResults([engineA, engineB, engineC]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.frequency).toBe(3);
  });

  it("keeps the longest title and description across engines", () => {
    const engineA: SearchResult[] = [
      r("Hi", "https://example.com/x", "short"),
    ];
    const engineB: SearchResult[] = [
      r("Hello world", "https://example.com/x", "a much longer description"),
    ];

    const merged = mergeResults([engineA, engineB]);

    expect(merged[0]).toMatchObject({
      title: "Hello world",
      description: "a much longer description",
    });
  });

  it("preserves the original (non-normalized) URL in the output", () => {
    const engine: SearchResult[] = [
      r("T", "https://example.com/page?utm_source=foo", "d"),
    ];

    const merged = mergeResults([engine]);

    expect(merged[0]!.url).toBe("https://example.com/page?utm_source=foo");
  });

  it("skips results whose URL cannot be parsed", () => {
    const engine: SearchResult[] = [
      r("Bad", "not-a-url", "d"),
      r("Good", "https://example.com/good", "d"),
    ];

    const merged = mergeResults([engine]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.url).toBe("https://example.com/good");
  });

  it("respects the numResults cap", () => {
    const engine: SearchResult[] = Array.from({ length: 10 }, (_, i) =>
      r(`T${i}`, `https://example.com/${i}`),
    );

    const merged = mergeResults([engine], 3);

    expect(merged).toHaveLength(3);
  });

  it("defaults to DEFAULT_AGGREGATE_NUM_RESULTS", () => {
    const engine: SearchResult[] = Array.from(
      { length: DEFAULT_AGGREGATE_NUM_RESULTS + 5 },
      (_, i) => r(`T${i}`, `https://example.com/${i}`),
    );

    const merged = mergeResults([engine]);

    expect(merged).toHaveLength(DEFAULT_AGGREGATE_NUM_RESULTS);
  });

  it("handles empty input", () => {
    expect(mergeResults([])).toEqual([]);
  });

  it("handles engines that returned no results", () => {
    const merged = mergeResults([[], [r("A", "https://a.example")], []]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.frequency).toBe(1);
  });

  it("treats a negative numResults as zero", () => {
    const merged = mergeResults(
      [[r("A", "https://a.example")]],
      -5,
    );
    expect(merged).toEqual([]);
  });

  it("does not silently drop all results when numResults is NaN", () => {
    // Regression: slice(0, NaN) returns [], so a NaN cap previously discarded
    // every result with no error. A non-finite cap should fall back to the
    // default rather than erase the data.
    const merged = mergeResults(
      [[r("A", "https://a.example")]],
      Number.NaN,
    );
    expect(merged).toHaveLength(1);
  });

  it("truncates fractional numResults rather than dropping all", () => {
    // slice(0, 2.5) keeps 2; just assert it does not drop everything.
    const merged = mergeResults(
      [
        [
          r("A", "https://a.example"),
          r("B", "https://b.example"),
          r("C", "https://c.example"),
        ],
      ],
      2.5,
    );
    expect(merged).toHaveLength(2);
  });

  it("strips userinfo (user:pass@) from the normalized URL", () => {
    expect(normalizeUrl("https://user:pass@Example.com/path/")).toBe(
      "https://example.com/path",
    );
  });

  it("strips userinfo so phishing-style URLs dedup against the bare host", () => {
    // https://google.com@evil.com/ keeps host "evil.com" after URL parsing,
    // so the userinfo here is purely obfuscation and must not survive.
    expect(normalizeUrl("https://google.com@evil.com/x")).toBe(
      "https://evil.com/x",
    );
  });

  it("deduplicates URLs that differ only in userinfo", () => {
    const merged = mergeResults([
      [r("A", "https://user@site.example/x", "")],
      [r("B", "https://site.example/x", "")],
    ]);
    expect(merged).toHaveLength(1);
  });

  it("preserves the longest snippet when present", () => {
    const engineA: SearchResult[] = [
      { title: "T", url: "https://example.com/x", description: "d", snippet: "short" },
    ];
    const engineB: SearchResult[] = [
      { title: "T", url: "https://example.com/x", description: "d", snippet: "a longer snippet" },
    ];

    const merged = mergeResults([engineA, engineB]);

    expect(merged[0]!.snippet).toBe("a longer snippet");
  });
});
