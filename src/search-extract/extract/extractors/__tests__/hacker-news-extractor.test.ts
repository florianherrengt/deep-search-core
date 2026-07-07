import { describe, expect, it, vi } from "vitest";
import {
  HackerNewsExtractor,
  extractHackerNewsItemId,
  hackerNewsHtmlToMarkdown,
  isHackerNewsItemUrl,
} from "../hacker-news.js";
import type { ExtractorInput } from "../base.js";

function makeFetch(items: Record<number, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    const match = url.match(/\/item\/(\d+)\.json$/);
    const id = match ? Number.parseInt(match[1]!, 10) : NaN;
    const body = items[id] ?? null;
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(body),
    });
  }) as unknown as typeof globalThis.fetch;
}

function makeInput(
  fetch: typeof globalThis.fetch,
  url = "https://news.ycombinator.com/item?id=100",
): ExtractorInput {
  return {
    url: new URL(url),
    loader: {},
    fetch,
  };
}

describe("HackerNewsExtractor URL handling", () => {
  it("matches Hacker News item URLs", () => {
    expect(isHackerNewsItemUrl(new URL("https://news.ycombinator.com/item?id=100"))).toBe(true);
    expect(isHackerNewsItemUrl(new URL("https://news.ycombinator.com/item?id=abc"))).toBe(false);
    expect(isHackerNewsItemUrl(new URL("https://news.ycombinator.com/news"))).toBe(false);
    expect(isHackerNewsItemUrl(new URL("https://example.com/item?id=100"))).toBe(false);
  });

  it("extracts safe integer ids", () => {
    expect(extractHackerNewsItemId(new URL("https://news.ycombinator.com/item?id=100"))).toBe(100);
    expect(extractHackerNewsItemId(new URL("https://news.ycombinator.com/item?id=1.5"))).toBeNull();
    expect(extractHackerNewsItemId(new URL("https://news.ycombinator.com/item"))).toBeNull();
  });
});

describe("hackerNewsHtmlToMarkdown", () => {
  it("converts common Hacker News comment HTML", () => {
    const markdown = hackerNewsHtmlToMarkdown(
      '<p>Hello <a href="https://example.com">link</a><p><pre><code>const x = 1;</code></pre>',
    );

    expect(markdown).toContain("Hello link (https://example.com)");
    expect(markdown).toContain("```");
    expect(markdown).toContain("const x = 1;");
  });
});

describe("HackerNewsExtractor.extract", () => {
  it("fetches a story and bounded comment tree from Firebase", async () => {
    const fetch = makeFetch({
      100: {
        id: 100,
        type: "story",
        by: "alice",
        time: 1_704_067_200,
        title: "Ask HN: Best tools?",
        text: "<p>What should I use?</p>",
        url: "https://example.com/tools",
        score: 55,
        descendants: 3,
        kids: [101, 102],
      },
      101: {
        id: 101,
        type: "comment",
        by: "bob",
        time: 1_704_067_260,
        text: '<p>Use <a href="https://example.com/a">A</a>.</p>',
        kids: [103],
      },
      102: {
        id: 102,
        type: "comment",
        by: "carol",
        time: 1_704_067_320,
        text: "<p>B is better.</p>",
      },
      103: {
        id: 103,
        type: "comment",
        by: "dave",
        time: 1_704_067_380,
        text: "<p>Why?</p>",
      },
    });
    const extractor = new HackerNewsExtractor();

    const result = await extractor.extract(makeInput(fetch));

    expect(result).not.toBeNull();
    expect(result!.content).toContain("# Ask HN: Best tools?");
    expect(result!.content).toContain("Source: https://news.ycombinator.com/item?id=100");
    expect(result!.content).toContain("Author: alice");
    expect(result!.content).toContain("External URL: https://example.com/tools");
    expect(result!.content).toContain("What should I use?");
    expect(result!.content).toContain("- **bob**");
    expect(result!.content).toContain("Use A (https://example.com/a).");
    expect(result!.content).toContain("  - **dave**");
    expect(result!.content).toContain("- **carol**");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("returns null for missing or deleted items", async () => {
    const missingFetch = makeFetch({});
    const deletedFetch = makeFetch({
      100: { id: 100, type: "story", deleted: true },
    });
    const extractor = new HackerNewsExtractor();

    await expect(extractor.extract(makeInput(missingFetch))).resolves.toBeNull();
    await expect(extractor.extract(makeInput(deletedFetch))).resolves.toBeNull();
  });

  it("adds warnings when comment limits are hit", async () => {
    const fetch = makeFetch({
      100: {
        id: 100,
        type: "story",
        title: "Story",
        kids: [101, 102],
      },
      101: {
        id: 101,
        type: "comment",
        by: "bob",
        text: "one",
      },
      102: {
        id: 102,
        type: "comment",
        by: "carol",
        text: "two",
      },
    });
    const extractor = new HackerNewsExtractor({ maxComments: 1 });

    const result = await extractor.extract(makeInput(fetch));

    expect(result).not.toBeNull();
    expect(result!.content).toContain("- **bob**");
    expect(result!.content).not.toContain("- **carol**");
    expect(result!.warnings).toEqual([
      "Comment extraction stopped after 1 comments.",
    ]);
    expect(result!.content).toContain("## Extraction Notes");
  });

  it("returns null when URL does not include an item id", async () => {
    const extractor = new HackerNewsExtractor();

    await expect(
      extractor.extract(makeInput(makeFetch({}), "https://news.ycombinator.com/news")),
    ).resolves.toBeNull();
  });
});
