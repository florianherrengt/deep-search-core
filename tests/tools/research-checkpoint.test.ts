import { describe, it, expect, vi } from "vitest";
import { createResearchCheckpointTool } from "../../src/research-orchestrator/tools/research-checkpoint";
import type { LanguageModel } from "ai";

describe("createResearchCheckpointTool", () => {
  const mockModel = {
    specificationVersion: "v1",
    provider: "mock",
    modelId: "mock",
  } as unknown as LanguageModel;

  it("returns a tool with a description", () => {
    const tool = createResearchCheckpointTool(mockModel);
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe("string");
  });

  it("has inputSchema defined", () => {
    const tool = createResearchCheckpointTool(mockModel);
    expect(tool.inputSchema).toBeDefined();
  });
});
