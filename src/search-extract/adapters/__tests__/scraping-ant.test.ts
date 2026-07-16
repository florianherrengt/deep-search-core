import { describe, expect, it, vi } from "vitest";
import { UrlValidationError } from "../../core/errors";
import {
  createScrapingAntPageLoader,
  fetchScrapingAntHtml,
} from "../scraping-ant";

describe("fetchScrapingAntHtml", () => {
  it("requests the v2 HTML endpoint with browser rendering enabled", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("<html><body>Rendered</body></html>"));

    const result = await fetchScrapingAntHtml(
      "https://example.com/page?q=1",
      {
        apiKey: "test-token",
        endpoint: "https://scraper.test/v2/general",
        fetch,
      },
    );

    expect(result).toContain("Rendered");
    const [calledUrl, init] = fetch.mock.calls[0]!;
    const endpoint = new URL(calledUrl as string);
    expect(endpoint.origin).toBe("https://scraper.test");
    expect(endpoint.pathname).toBe("/v2/general");
    expect(endpoint.searchParams.get("x-api-key")).toBe("test-token");
    expect(endpoint.searchParams.get("url")).toBe(
      "https://example.com/page?q=1",
    );
    expect(endpoint.searchParams.get("browser")).toBe("true");
    expect(init).toMatchObject({
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
    });
  });

  it("allows provider parameters while protecting required parameters", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<html>OK</html>"));

    await fetchScrapingAntHtml("https://example.com", {
      apiKey: "real-token",
      fetch,
      params: {
        browser: false,
        proxy_country: "fr",
        url: "https://attacker.example",
        "x-api-key": "wrong-token",
      },
    });

    const endpoint = new URL(fetch.mock.calls[0]![0] as string);
    expect(endpoint.searchParams.get("browser")).toBe("false");
    expect(endpoint.searchParams.get("proxy_country")).toBe("fr");
    expect(endpoint.searchParams.get("url")).toBe("https://example.com/");
    expect(endpoint.searchParams.get("x-api-key")).toBe("real-token");
  });

  it("reports missing credentials and remote HTTP failures", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("blocked", { status: 429 }));

    await expect(
      fetchScrapingAntHtml("https://example.com", { apiKey: " ", fetch }),
    ).rejects.toThrow("ScrapingAnt API key is required");
    await expect(
      fetchScrapingAntHtml("https://example.com", {
        apiKey: "test-token",
        fetch,
      }),
    ).rejects.toThrow("ScrapingAnt request failed with HTTP 429");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a sanitized transport category without leaking credentials", async () => {
    const transportError = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.scrapingant.com"), {
        code: "ENOTFOUND",
      }),
    });

    const result = fetchScrapingAntHtml("https://example.com", {
      apiKey: "secret-token",
      fetch: vi.fn().mockRejectedValue(transportError),
    });

    await expect(result).rejects.toThrow(
      "ScrapingAnt request failed during DNS lookup",
    );
    await expect(result).rejects.not.toThrow("secret-token");
  });

  it("propagates aborts and rejects private target URLs", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    await expect(
      fetchScrapingAntHtml("https://example.com", {
        apiKey: "test-token",
        fetch: vi.fn().mockRejectedValue(abortError),
      }),
    ).rejects.toThrow("aborted");
    await expect(
      fetchScrapingAntHtml("http://localhost/page", {
        apiKey: "test-token",
        fetch: vi.fn(),
      }),
    ).rejects.toThrow(UrlValidationError);
  });
});

describe("createScrapingAntPageLoader", () => {
  it("exposes ScrapingAnt as a render loader and enforces byte limits", async () => {
    const loader = createScrapingAntPageLoader({
      apiKey: "test-token",
      fetch: vi.fn().mockResolvedValue(
        new Response("x".repeat(1024), {
          headers: { "content-type": "text/html" },
        }),
      ),
    });

    await expect(
      loader.renderHtml?.("https://example.com/page", { maxBytes: 128 }),
    ).resolves.toBeNull();
  });
});
