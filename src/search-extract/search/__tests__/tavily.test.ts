import { describe, expect, it, vi } from "vitest";
import { createTavilySearch } from "../tavily.js";
import { SearchProviderError, SearchProviderConfigError } from "../../core/errors.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createTavilySearch", () => {
  it("maps Tavily content to description", async () => {
    const fetch = mockFetch(200, {
      results: [
        { title: "Tv", url: "https://tv.com", content: "Tavily content" },
      ],
    });
    const search = createTavilySearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([
      { title: "Tv", url: "https://tv.com", description: "Tavily content" },
    ]);
  });

  it("throws SearchProviderError on HTTP error", async () => {
    const fetch = mockFetch(500, {}, "Server Error");
    const search = createTavilySearch({ apiKey: "key", fetch });
    await expect(search("test")).rejects.toThrow(SearchProviderError);
  });

  it("throws SearchProviderConfigError for empty apiKey", async () => {
    const search = createTavilySearch({ apiKey: "" });
    await expect(search("test")).rejects.toThrow(SearchProviderConfigError);
  });

  it("uses Bearer auth header", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [] }),
    }) as unknown as typeof globalThis.fetch;

    const search = createTavilySearch({ apiKey: "tavily-key", fetch });
    await search("test");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tavily-key",
        }),
      }),
    );
  });
});
