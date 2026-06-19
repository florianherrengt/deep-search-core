import { describe, it, expect, vi } from "vitest";
import { extractPage } from "../extract-page";
import type { PageLoader, Summarizer } from "../../core/types";
import { PageExtractor, type ExtractorInput, type ExtractorResult } from "../extractors/base";
import { UrlValidationError } from "../../core/errors";

const LONG_HTML = `<html><body><p>${"Content text. ".repeat(20)}</p></body></html>`;
const SHORT_HTML = "<html><body><p>Hi</p></body></html>";
const RENDERED_HTML = `<html><body><p>${"Rendered text. ".repeat(30)}</p></body></html>`;

function makeSummarizer(error?: Error): Summarizer {
  const fn = vi.fn<
    (input: { content: string; query?: string; signal?: AbortSignal }) => Promise<string>
  >();
  if (error) {
    fn.mockRejectedValue(error);
  } else {
    fn.mockImplementation(async ({ content }) => `Summary of: ${content.slice(0, 50)}`);
  }
  return fn;
}

describe("extractPage", () => {
  describe("URL validation", () => {
    it("throws for invalid URLs", async () => {
      await expect(extractPage("not-a-url", {}, {})).rejects.toThrow(
        UrlValidationError,
      );
    });

    it("throws for non-https URLs", async () => {
      await expect(extractPage("http://example.com", {}, {})).rejects.toThrow(
        UrlValidationError,
      );
    });
  });

  describe("generic fetch extraction", () => {
    it("fetches and sanitizes HTML content", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });

      const result = await extractPage("https://example.com/page", {}, { fetch });

      expect(result.content).toContain("Content text");
      expect(result.method).toBe("fetch");
      expect(result.usedCustomExtractor).toBe(false);
      expect(result.warnings).toEqual([]);
    });

    it("returns empty content for non-OK responses", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "text/html" }),
      });

      const result = await extractPage("https://example.com/page", {}, { fetch });

      expect(result.content).toBe("");
      expect(result.method).toBe("fetch");
    });

    it("uses pageLoader.fetchHtml when provided", async () => {
      const pageLoader: PageLoader = {
        fetchHtml: vi.fn().mockResolvedValue("<html><body><p>Loader content</p></body></html>"),
      };

      const result = await extractPage("https://example.com/page", {}, { pageLoader });

      expect(result.content).toContain("Loader content");
      expect(pageLoader.fetchHtml).toHaveBeenCalledWith(
        "https://example.com/page",
        { signal: undefined },
      );
    });
  });

  describe("render", () => {
    it("uses renderHtml when method is render", async () => {
      const pageLoader: PageLoader = {
        renderHtml: vi.fn().mockResolvedValue(LONG_HTML),
      };

      const result = await extractPage(
        "https://example.com/page",
        { method: "render" },
        { pageLoader },
      );

      expect(result.method).toBe("render");
      expect(result.content).toContain("Content text");
      expect(pageLoader.renderHtml).toHaveBeenCalledWith(
        "https://example.com/page",
        { signal: undefined },
      );
    });

    it("warns and returns empty content when renderHtml is unavailable", async () => {
      const pageLoader: PageLoader = {};

      const result = await extractPage(
        "https://example.com/page",
        { method: "render" },
        { pageLoader },
      );

      expect(result.content).toBe("");
      expect(result.method).toBe("render");
      expect(result.warnings).toContain("Renderer not available");
    });
  });

  describe("auto mode fallback", () => {
    it("falls back to render when fetched content is shorter than MIN_CONTENT_LENGTH", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(SHORT_HTML),
      });
      const pageLoader: PageLoader = {
        renderHtml: vi.fn().mockResolvedValue(RENDERED_HTML),
      };

      const result = await extractPage(
        "https://example.com/page",
        { method: "auto" },
        { fetch, pageLoader },
      );

      expect(result.method).toBe("render");
      expect(result.content).toContain("Rendered text");
      expect(pageLoader.renderHtml).toHaveBeenCalled();
    });

    it("does not fall back to render when content is long enough", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });
      const pageLoader: PageLoader = {
        renderHtml: vi.fn(),
      };

      const result = await extractPage(
        "https://example.com/page",
        { method: "auto" },
        { fetch, pageLoader },
      );

      expect(result.method).toBe("fetch");
      expect(pageLoader.renderHtml).not.toHaveBeenCalled();
    });

    it("warns when content is short and renderer is not available", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(SHORT_HTML),
      });

      const result = await extractPage(
        "https://example.com/page",
        { method: "auto" },
        { fetch },
      );

      expect(result.method).toBe("fetch");
      expect(result.warnings).toContain("Content is short and renderer is not available");
    });
  });

  describe("forced fetch", () => {
    it("never renders when method is fetch, even with short content", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(SHORT_HTML),
      });
      const pageLoader: PageLoader = {
        renderHtml: vi.fn().mockResolvedValue(LONG_HTML),
      };

      const result = await extractPage(
        "https://example.com/page",
        { method: "fetch" },
        { fetch, pageLoader },
      );

      expect(result.method).toBe("fetch");
      expect(result.content).toContain("Hi");
      expect(pageLoader.renderHtml).not.toHaveBeenCalled();
    });
  });

  describe("custom extractors", () => {
    class FakeExtractor extends PageExtractor {
      canHandle(url: URL): boolean {
        return url.href.includes("special");
      }
      async extract(_input: ExtractorInput): Promise<ExtractorResult | null> {
        return { content: "# Custom extracted content" };
      }
    }

    class NullExtractor extends PageExtractor {
      canHandle(url: URL): boolean {
        return url.href.includes("null-return");
      }
      async extract(_input: ExtractorInput): Promise<ExtractorResult | null> {
        return null;
      }
    }

    class ThrowingExtractor extends PageExtractor {
      canHandle(url: URL): boolean {
        return url.href.includes("throw");
      }
      async extract(_input: ExtractorInput): Promise<ExtractorResult | null> {
        throw new Error("Extractor error");
      }
    }

    it("routes to custom extractor by URL", async () => {
      const extractors = [new FakeExtractor()];

      const result = await extractPage(
        "https://special.example.com/page",
        {},
        { extractors },
      );

      expect(result.usedCustomExtractor).toBe(true);
      expect(result.extractorName).toBe("FakeExtractor");
      expect(result.method).toBe("custom");
      expect(result.content).toContain("Custom extracted content");
    });

    it("falls through to generic when extractor returns null", async () => {
      const extractors = [new NullExtractor()];
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });

      const result = await extractPage(
        "https://null-return.example.com/page",
        {},
        { extractors, fetch },
      );

      expect(result.usedCustomExtractor).toBe(false);
      expect(result.method).toBe("fetch");
      expect(result.content).toContain("Content text");
    });

    it("falls through to generic when extractor throws", async () => {
      const extractors = [new ThrowingExtractor()];
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });

      const result = await extractPage(
        "https://throw.example.com/page",
        {},
        { extractors, fetch },
      );

      expect(result.usedCustomExtractor).toBe(false);
      expect(result.method).toBe("fetch");
      expect(result.warnings?.length).toBeGreaterThan(0);
      expect(result.warnings?.[0]).toContain("ThrowingExtractor failed");
    });
  });

  describe("summarization", () => {
    it("summarizes when summarize is true", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });
      const summarizer = makeSummarizer();

      const result = await extractPage(
        "https://example.com/page",
        { summarize: true },
        { fetch, summarizer },
      );

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain("Summary of:");
      expect(summarizer).toHaveBeenCalledWith({
        content: expect.stringContaining("Content text"),
        query: undefined,
        signal: undefined,
      });
    });

    it("summarizes when query is provided", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });
      const summarizer = makeSummarizer();

      const result = await extractPage(
        "https://example.com/page",
        { query: "price" },
        { fetch, summarizer },
      );

      expect(result.summary).toBeDefined();
      expect(summarizer).toHaveBeenCalledWith({
        content: expect.any(String),
        query: "price",
        signal: undefined,
      });
    });

    it("does not summarize when neither summarize nor query are set", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });
      const summarizer = makeSummarizer();

      const result = await extractPage(
        "https://example.com/page",
        {},
        { fetch, summarizer },
      );

      expect(result.summary).toBeUndefined();
      expect(summarizer).not.toHaveBeenCalled();
    });

    it("handles summarizer errors gracefully", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });
      const error = new Error("Summarizer failed");
      const summarizer = makeSummarizer(error);

      const result = await extractPage(
        "https://example.com/page",
        { summarize: true },
        { fetch, summarizer },
      );

      expect(result.content).toBeDefined();
      expect(result.summary).toBeUndefined();
      expect(result.warnings).toContain("Summarization failed: Summarizer failed");
    });
  });

  describe("abort propagation", () => {
    it("throws AbortError when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        extractPage(
          "https://example.com/page",
          { signal: controller.signal },
          {},
        ),
      ).rejects.toThrow("aborted");
    });

    it("propagates AbortError from summarizer", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      const summarizer = makeSummarizer(abortError);

      await expect(
        extractPage(
          "https://example.com/page",
          { summarize: true },
          { fetch, summarizer },
        ),
      ).rejects.toThrow("aborted");
    });

    it("propagates AbortError from custom extractor", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      class AbortExtractor extends PageExtractor {
        canHandle(url: URL): boolean {
          return url.href.includes("abort");
        }
        async extract(_input: ExtractorInput): Promise<ExtractorResult | null> {
          throw abortError;
        }
      }

      await expect(
        extractPage(
          "https://abort.example.com/page",
          {},
          { extractors: [new AbortExtractor()] },
        ),
      ).rejects.toThrow("aborted");
    });
  });

  describe("structured result", () => {
    it("includes all required fields in the result", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(LONG_HTML),
      });

      const result = await extractPage("https://example.com/page", {}, { fetch });

      expect(result.url).toBe("https://example.com/page");
      expect(result.content).toBeTruthy();
      expect(result.usedCustomExtractor).toBe(false);
      expect(result.method).toBe("fetch");
      expect(result.warnings).toBeInstanceOf(Array);
    });
  });
});
