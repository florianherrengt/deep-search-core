import { describe, it, expect } from "vitest";
import { createSequentialThinkingTool, sequentialThinkingInputSchema } from "../../src/research-orchestrator/tools/sequential-thinking";

describe("createSequentialThinkingTool", () => {
  const tool = createSequentialThinkingTool();

  it("returns a tool with a description", () => {
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe("string");
  });

  it("has inputSchema defined", () => {
    expect(tool.inputSchema).toBeDefined();
  });

  it("execute returns { status: ok }", async () => {
    if (!tool.execute) throw new Error("expected execute handler");
    const result = await tool.execute({ thought: "test" }, { toolCallId: "t1", messages: [] });
    expect(result).toEqual({ status: "ok" });
  });

  it("execute returns ok regardless of input", async () => {
    if (!tool.execute) throw new Error("expected execute handler");
    const result = await tool.execute(
      { thought: "" },
      { toolCallId: "t1", messages: [] },
    );
    expect(result).toEqual({ status: "ok" });
  });
});

describe("sequentialThinkingInputSchema", () => {
  it("accepts valid input", () => {
    const result = sequentialThinkingInputSchema.safeParse({ thought: "Hello" });
    expect(result.success).toBe(true);
  });

  it("rejects missing thought", () => {
    const result = sequentialThinkingInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string thought", () => {
    const result = sequentialThinkingInputSchema.safeParse({ thought: 123 });
    expect(result.success).toBe(false);
  });
});
