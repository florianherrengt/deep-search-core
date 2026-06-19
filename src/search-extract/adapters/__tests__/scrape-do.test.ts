import { describe, expect, it, vi } from "vitest";
import {
  createScrapeDoPageLoader,
  fetchScrapeDoHtml,
} from "../scrape-do";
import { UrlValidationError } from "../../core/errors";

describe("fetchScrapeDoHtml", () => {
  it("requests Scrape.do with token and target URL", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Rendered</body></html>"),
    });

    const result = await fetchScrapeDoHtml(
      "https://example.com/page?q=1",
      {
        apiKey: "test-token",
        endpoint: "https://scraper.test/",
        fetch,
      },
    );

    expect(result).toContain("Rendered");
    const [calledUrl, init] = fetch.mock.calls[0]!;
    const endpoint = new URL(calledUrl as string);
    expect(endpoint.origin).toBe("https://scraper.test");
    expect(endpoint.searchParams.get("token")).toBe("test-token");
    expect(endpoint.searchParams.get("url")).toBe("https://example.com/page?q=1");
    expect(init).toMatchObject({
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
    });
  });

  it("returns null for missing API keys", async () => {
    const fetch = vi.fn();

    const result = await fetchScrapeDoHtml("https://example.com/page", {
      apiKey: " ",
      fetch,
    });

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null for failed remote responses", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("blocked"),
    });

    const result = await fetchScrapeDoHtml("https://example.com/page", {
      apiKey: "test-token",
      fetch,
    });

    expect(result).toBeNull();
  });

  it("returns null for network errors", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await fetchScrapeDoHtml("https://example.com/page", {
      apiKey: "test-token",
      fetch,
    });

    expect(result).toBeNull();
  });

  it("propagates abort errors", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetch = vi.fn().mockRejectedValue(abortError);

    await expect(
      fetchScrapeDoHtml("https://example.com/page", {
        apiKey: "test-token",
        fetch,
      }),
    ).rejects.toThrow("aborted");
  });

  it("rejects invalid target URLs", async () => {
    await expect(
      fetchScrapeDoHtml("http://localhost/page", {
        apiKey: "test-token",
        fetch: vi.fn(),
      }),
    ).rejects.toThrow(UrlValidationError);
  });
});

describe("createScrapeDoPageLoader", () => {
  it("exposes Scrape.do as a renderHtml loader", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Rendered</body></html>"),
    });

    const loader = createScrapeDoPageLoader({
      apiKey: "test-token",
      fetch,
    });

    await expect(loader.renderHtml?.("https://example.com/page", {})).resolves.toContain(
      "Rendered",
    );
  });
});
