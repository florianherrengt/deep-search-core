import { describe, it, expect, vi } from "vitest";
import { createDisambiguateTool, disambiguateInputSchema } from "../../src/research-orchestrator/tools/disambiguate";

describe("disambiguateInputSchema", () => {
  it("accepts valid terms array", () => {
    const result = disambiguateInputSchema.safeParse({
      terms: ["API", "SaaS"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts single term", () => {
    const result = disambiguateInputSchema.safeParse({
      terms: ["API"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing terms", () => {
    const result = disambiguateInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-array terms", () => {
    const result = disambiguateInputSchema.safeParse({ terms: "API" });
    expect(result.success).toBe(false);
  });

  it("rejects non-string items", () => {
    const result = disambiguateInputSchema.safeParse({ terms: [123] });
    expect(result.success).toBe(false);
  });
});

describe("createDisambiguateTool", () => {
  it("returns a tool with a description", () => {
    const tool = createDisambiguateTool(globalThis.fetch);
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe("string");
  });

  it("has inputSchema defined", () => {
    const tool = createDisambiguateTool(globalThis.fetch);
    expect(tool.inputSchema).toBeDefined();
  });

  it("execute returns result for each term", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    const tool = createDisambiguateTool(mockFetch as unknown as typeof globalThis.fetch);

    if (!tool.execute) throw new Error("expected execute handler");
    const result = await tool.execute(
      { terms: ["API", "SaaS"] },
      { toolCallId: "t1", messages: [] },
    );
    expect(result).toContain("API:");
    expect(result).toContain("SaaS:");
  });

  it("handles empty terms array", async () => {
    const mockFetch = vi.fn();
    const tool = createDisambiguateTool(mockFetch as unknown as typeof globalThis.fetch);

    if (!tool.execute) throw new Error("expected execute handler");
    const result = await tool.execute(
      { terms: [] },
      { toolCallId: "t1", messages: [] },
    );
    expect(result).toBe("");
  });
});
