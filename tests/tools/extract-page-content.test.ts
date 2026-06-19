import { describe, it, expect } from "vitest";
import { extractPageContentInputSchema, sanitizeHtml, extractVisibleTextFromHtml } from "../../src/research-orchestrator/tools/extract-page-content";

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
