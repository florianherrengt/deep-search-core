import { describe, it, expect, vi } from "vitest";
import { createResearchPlanTool, researchPlanInputSchema } from "../../src/research-orchestrator/tools/research-plan";
import type { LanguageModel } from "ai";

describe("researchPlanInputSchema", () => {
  it("accepts valid query", () => {
    const result = researchPlanInputSchema.safeParse({ query: "What is AI?" });
    expect(result.success).toBe(true);
  });

  it("rejects empty query", () => {
    const result = researchPlanInputSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing query", () => {
    const result = researchPlanInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("createResearchPlanTool", () => {
  it("returns a tool with a description", () => {
    const mockModel = {
      specificationVersion: "v1",
      provider: "mock",
      modelId: "mock",
    } as unknown as LanguageModel;

    const tool = createResearchPlanTool(mockModel);
    expect(tool.description).toBeTruthy();
  });

  it("has inputSchema defined", () => {
    const mockModel = {
      specificationVersion: "v1",
      provider: "mock",
      modelId: "mock",
    } as unknown as LanguageModel;

    const tool = createResearchPlanTool(mockModel);
    expect(tool.inputSchema).toBeDefined();
  });
});
