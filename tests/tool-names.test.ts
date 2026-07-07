import { describe, it, expect } from "vitest";
import { TOOL_NAMES, type ToolName } from "../src/research-orchestrator/tool-names";

describe("TOOL_NAMES", () => {
  it("has all 15 tool names", () => {
    const keys = Object.keys(TOOL_NAMES);
    expect(keys).toHaveLength(15);
  });

  it("has every key equal to its value", () => {
    for (const [key, value] of Object.entries(TOOL_NAMES)) {
      expect(key).toBe(value);
    }
  });

  const expectedNames = [
    "ask_questions",
    "disambiguate",
    "brave_search",
    "exa_search",
    "serper_search",
    "tavily_search",
    "searxng_search",
    "youtube_search",
    "hacker_news_search",
    "aggregate_search",
    "extract_page_content",
    "research_checkpoint",
    "sequential_thinking",
    "create_research_plan",
    "facts_check",
  ];

  it.each(expectedNames)("contains %s", (name) => {
    expect(TOOL_NAMES).toHaveProperty(name, name);
  });

  it("ToolName type accepts all tool names", () => {
    const names: ToolName[] = Object.values(TOOL_NAMES);
    expect(names).toHaveLength(15);
  });
});
