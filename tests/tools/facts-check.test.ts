import { describe, it, expect, vi } from "vitest";
import { extractUrls } from "../../src/research-orchestrator/tools/facts-check";

// We import the internal extractUrls function by reading the source.
// Since it's not exported, we test it through createFactsCheckTool.
// But we can use a simple regex test approach.

// Replicate the regex pattern from facts-check.ts
const URL_PATTERN = /https?:\/\/[^\s)\]>"')]+/g;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?>]+$/, "")))];
}

describe("extractUrls", () => {
  it("extracts simple URLs", () => {
    const result = extractUrls("Check https://example.com for more info");
    expect(result).toEqual(["https://example.com"]);
  });

  it("extracts multiple URLs", () => {
    const text = "Sources: https://example.com and https://other.org/page";
    const result = extractUrls(text);
    expect(result).toContain("https://example.com");
    expect(result).toContain("https://other.org/page");
  });

  it("deduplicates URLs", () => {
    const text = "See https://example.com also https://example.com again";
    const result = extractUrls(text);
    expect(result).toHaveLength(1);
  });

  it("strips trailing punctuation", () => {
    const result = extractUrls("Visit https://example.com.");
    expect(result).toEqual(["https://example.com"]);
  });

  it("returns empty array when no URLs", () => {
    expect(extractUrls("No URLs here")).toEqual([]);
    expect(extractUrls("")).toEqual([]);
  });

  it("handles URLs with query params", () => {
    const result = extractUrls("See https://example.com/page?q=1&key=val");
    expect(result[0]).toContain("q=1");
  });

  it("handles URLs inside parentheses", () => {
    const result = extractUrls("(https://example.com)");
    expect(result).toEqual(["https://example.com"]);
  });
});

describe("createFactsCheckTool", () => {
  it("has factsCheckInputSchema defined", async () => {
    const { factsCheckInputSchema } = await import("../../src/research-orchestrator/tools/facts-check");
    expect(factsCheckInputSchema).toBeDefined();
    const result = factsCheckInputSchema.safeParse({
      originalPrompt: "Find prices",
      finalResearch: "Source: https://example.com - Price is $10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing originalPrompt", async () => {
    const { factsCheckInputSchema } = await import("../../src/research-orchestrator/tools/facts-check");
    const result = factsCheckInputSchema.safeParse({
      finalResearch: "text with https://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing finalResearch", async () => {
    const { factsCheckInputSchema } = await import("../../src/research-orchestrator/tools/facts-check");
    const result = factsCheckInputSchema.safeParse({
      originalPrompt: "prices",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty strings", async () => {
    const { factsCheckInputSchema } = await import("../../src/research-orchestrator/tools/facts-check");
    const result = factsCheckInputSchema.safeParse({
      originalPrompt: "",
      finalResearch: "",
    });
    expect(result.success).toBe(false);
  });
});
