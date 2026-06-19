import { describe, expect, it, vi } from "vitest";
import { createBraveSearch } from "../brave.js";
import { SearchProviderError, SearchProviderConfigError } from "../../core/errors.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createBraveSearch", () => {
  it("returns structured SearchResult[] on success", async () => {
    const fetch = mockFetch(200, {
      web: {
        results: [
          { title: "T", url: "https://a.com", description: "D" },
        ],
      },
    });
    const search = createBraveSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([
      { title: "T", url: "https://a.com", description: "D" },
    ]);
  });

  it("returns empty array for empty web results", async () => {
    const fetch = mockFetch(200, { web: { results: [] } });
    const search = createBraveSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([]);
  });

  it("returns empty array when web is missing", async () => {
    const fetch = mockFetch(200, {});
    const search = createBraveSearch({ apiKey: "key", fetch });
    const results = await search("test");
    expect(results).toEqual([]);
  });

  it("throws SearchProviderError on HTTP 429", async () => {
    const fetch = mockFetch(429, {}, "Too Many Requests");
    const search = createBraveSearch({ apiKey: "key", fetch });
    await expect(search("test")).rejects.toThrow(SearchProviderError);
    await expect(search("test")).rejects.toThrow(/Brave search failed/);
  });

  it("throws SearchProviderError on HTTP 403 with body", async () => {
    const fetch = mockFetch(403, { error: "Invalid API key" }, "Forbidden");
    const search = createBraveSearch({ apiKey: "key", fetch });
    await expect(search("test")).rejects.toThrow(SearchProviderError);
    await expect(search("test")).rejects.toThrow(/403/);
  });

  it("throws SearchProviderConfigError for empty apiKey", async () => {
    const search = createBraveSearch({ apiKey: "" });
    await expect(search("test")).rejects.toThrow(SearchProviderConfigError);
  });

  it("passes abort signal to fetch", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    ) as unknown as typeof globalThis.fetch;
    const search = createBraveSearch({ apiKey: "key", fetch });
    await expect(search("test", controller.signal)).rejects.toThrow("abort");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.search.brave.com"),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
