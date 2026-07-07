import { describe, expect, it, vi } from "vitest";
import { SearchProviderError } from "../../core/errors.js";
import { createHackerNewsSearch } from "../hacker-news.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createHackerNewsSearch", () => {
  it("searches Hacker News stories and returns HN item URLs", async () => {
    const fetch = mockFetch(200, {
      hits: [
        {
          objectID: "123",
          title: "Launch HN: Example",
          url: "https://example.com",
          author: "alice",
          points: 42,
          num_comments: 7,
          created_at: "2026-01-02T03:04:05Z",
          story_text: "<p>Hello &amp; welcome</p>",
        },
      ],
    });
    const search = createHackerNewsSearch({ fetch });

    const results = await search("example");

    expect(results).toEqual([
      {
        title: "Launch HN: Example",
        url: "https://news.ycombinator.com/item?id=123",
        description:
          "HN item ID: 123\nAuthor: alice\nPoints: 42\nComments: 7\nCreated: 2026-01-02T03:04:05Z\nExternal URL: https://example.com\nHello & welcome",
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://hn.algolia.com/api/v1/search"),
      expect.objectContaining({
        headers: { accept: "application/json" },
      }),
    );
    const calledUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("query")).toBe("example");
    expect(calledUrl.searchParams.get("tags")).toBe("story");
    expect(calledUrl.searchParams.get("hitsPerPage")).toBe("10");
  });

  it("falls back to story_title and item id", async () => {
    const fetch = mockFetch(200, {
      hits: [
        {
          objectID: "456",
          story_title: "Ask HN: Test",
        },
        {
          objectID: "789",
        },
      ],
    });
    const search = createHackerNewsSearch({ fetch });

    const results = await search("ask hn");

    expect(results[0]!.title).toBe("Ask HN: Test");
    expect(results[1]!.title).toBe("Hacker News item 789");
  });

  it("clamps maxResults", async () => {
    const fetch = mockFetch(200, { hits: [] });
    const search = createHackerNewsSearch({ fetch, maxResults: 999 });

    await search("test");

    const calledUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("hitsPerPage")).toBe("100");
  });

  it("throws SearchProviderError on HTTP error", async () => {
    const fetch = mockFetch(503, { error: "unavailable" }, "Service Unavailable");
    const search = createHackerNewsSearch({ fetch });

    await expect(search("test")).rejects.toThrow(SearchProviderError);
    await expect(search("test")).rejects.toThrow(/Hacker News search failed/);
  });

  it("passes abort signal", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(
      new DOMException("abort", "AbortError"),
    ) as unknown as typeof globalThis.fetch;
    const search = createHackerNewsSearch({ fetch });

    await expect(search("test", controller.signal)).rejects.toThrow("abort");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("hn.algolia.com"),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
