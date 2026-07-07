import { describe, it, expect, vi } from "vitest";
import {
  extractPageContent,
  extractPageContentInputSchema,
  sanitizeHtml,
  extractVisibleTextFromHtml,
} from "../../src/research-orchestrator/tools/extract-page-content";

describe("extractPageContentInputSchema", () => {
  it("accepts minimal valid input", () => {
    const result = extractPageContentInputSchema.safeParse({
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full options", () => {
    const result = extractPageContentInputSchema.safeParse({
      url: "https://example.com",
      query: "price",
      summarize: true,
      method: "fetch",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing url", () => {
    const result = extractPageContentInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid method", () => {
    const result = extractPageContentInputSchema.safeParse({
      url: "https://example.com",
      method: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string url", () => {
    const result = extractPageContentInputSchema.safeParse({ url: 123 });
    expect(result.success).toBe(false);
  });
});

describe("re-exports from search-extract", () => {
  it("sanitizeHtml is a function", () => {
    expect(typeof sanitizeHtml).toBe("function");
  });

  it("extractVisibleTextFromHtml is a function", () => {
    expect(typeof extractVisibleTextFromHtml).toBe("function");
  });
});

describe("extractPageContent custom extractors", () => {
  it("uses HackerNewsExtractor for Hacker News item URLs", async () => {
    const fetch = vi.fn().mockImplementation((url: string) => {
      const match = url.match(/\/item\/(\d+)\.json$/);
      const id = match ? Number.parseInt(match[1]!, 10) : NaN;
      const items: Record<number, unknown> = {
        100: {
          id: 100,
          type: "story",
          title: "Ask HN: Extract me",
          by: "alice",
          kids: [101],
        },
        101: {
          id: 101,
          type: "comment",
          by: "bob",
          text: "<p>HN comment body</p>",
        },
      };

      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "",
        text: async () => JSON.stringify(items[id] ?? null),
      });
    }) as unknown as typeof globalThis.fetch;

    const content = await extractPageContent({
      url: "https://news.ycombinator.com/item?id=100",
      fetchFn: fetch,
      summarize: false,
    });

    expect(content).toContain("# Ask HN: Extract me");
    expect(content).toContain("- **bob**");
    expect(content).toContain("HN comment body");
    expect(fetch).toHaveBeenCalledWith(
      "https://hacker-news.firebaseio.com/v0/item/100.json",
      expect.anything(),
    );
  });
});
