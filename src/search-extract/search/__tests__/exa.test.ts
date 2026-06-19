import { describe, expect, it, vi } from "vitest";
import { createExaSearch } from "../exa.js";
import { SearchProviderError, SearchProviderConfigError } from "../../core/errors.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createExaSearch", () => {
  it("maps Exa results to SearchResult[]", async () => {
    const fetch = mockFetch(200, {
      results: [
        { title: "E", url: "https://e.com", text: "Exa text" },
      ],
    });
    const search = createExaSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([
      { title: "E", url: "https://e.com", description: "Exa text" },
    ]);
  });

  it("throws SearchProviderError on HTTP error", async () => {
    const fetch = mockFetch(500, {}, "Internal Server Error");
    const search = createExaSearch({ apiKey: "key", fetch });
    await expect(search("test")).rejects.toThrow(SearchProviderError);
    await expect(search("test")).rejects.toThrow(/Exa search failed/);
  });

  it("throws SearchProviderConfigError for empty apiKey", async () => {
    const search = createExaSearch({ apiKey: "" });
    await expect(search("test")).rejects.toThrow(SearchProviderConfigError);
  });

  it("makes POST request with correct body", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [] }),
    }) as unknown as typeof globalThis.fetch;

    const search = createExaSearch({ apiKey: "key", fetch });
    await search("test query");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("test query"),
      }),
    );
  });
});
