import { describe, expect, it, vi } from "vitest";
import { createSearXNGFetchSearch } from "../searxng.js";
import { SearchProviderError } from "../../core/errors.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createSearXNGFetchSearch", () => {
  it("maps SearXNG content to description", async () => {
    const fetch = mockFetch(200, {
      results: [
        { title: "Sx", url: "https://sx.com", content: "SearXNG content" },
      ],
    });
    const search = createSearXNGFetchSearch({
      baseUrl: "http://localhost:8080",
      fetch,
    });
    const results = await search("test");
    expect(results).toEqual([
      { title: "Sx", url: "https://sx.com", description: "SearXNG content" },
    ]);
  });

  it("uses format=json query param", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [] }),
    }) as unknown as typeof globalThis.fetch;

    const search = createSearXNGFetchSearch({
      baseUrl: "http://localhost:8080",
      fetch,
    });
    await search("test query");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("format=json"),
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=test+query"),
      expect.anything(),
    );
  });

  it("uses default baseUrl http://localhost:8080", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [] }),
    }) as unknown as typeof globalThis.fetch;

    const search = createSearXNGFetchSearch({ fetch });
    await search("test");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("localhost:8080"),
      expect.anything(),
    );
  });

  it("throws SearchProviderError on HTTP error", async () => {
    const fetch = mockFetch(502, "", "Bad Gateway");
    const search = createSearXNGFetchSearch({ fetch });
    await expect(search("test")).rejects.toThrow(SearchProviderError);
  });

  it("passes abort signal", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(
      new DOMException("abort", "AbortError"),
    ) as unknown as typeof globalThis.fetch;

    const search = createSearXNGFetchSearch({ fetch });
    await expect(search("test", controller.signal)).rejects.toThrow("abort");
  });
});
