import { describe, expect, it, vi } from "vitest";
import { createSerperSearch } from "../serper.js";
import { SearchProviderError, SearchProviderConfigError } from "../../core/errors.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createSerperSearch", () => {
  it("maps Serper organic results to SearchResult[]", async () => {
    const fetch = mockFetch(200, {
      organic: [
        { title: "S", link: "https://s.com", snippet: "Serper snippet" },
      ],
    });
    const search = createSerperSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([
      { title: "S", url: "https://s.com", description: "Serper snippet" },
    ]);
  });

  it("uses empty string for missing snippet", async () => {
    const fetch = mockFetch(200, {
      organic: [{ title: "T", link: "https://t.com" }],
    });
    const search = createSerperSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([
      { title: "T", url: "https://t.com", description: "" },
    ]);
  });

  it("returns empty array when organic is missing", async () => {
    const fetch = mockFetch(200, {});
    const search = createSerperSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([]);
  });

  it("throws SearchProviderError on HTTP error", async () => {
    const fetch = mockFetch(401, {}, "Unauthorized");
    const search = createSerperSearch({ apiKey: "key", fetch });
    await expect(search("test")).rejects.toThrow(SearchProviderError);
  });

  it("throws SearchProviderConfigError for empty apiKey", async () => {
    const search = createSerperSearch({ apiKey: "" });
    await expect(search("test")).rejects.toThrow(SearchProviderConfigError);
  });

  it("trims apiKey whitespace", async () => {
    const fetch = mockFetch(200, { organic: [] });
    const search = createSerperSearch({ apiKey: "  trimmed-key  ", fetch });
    const results = await search("test");
    expect(results).toEqual([]);
  });
});
