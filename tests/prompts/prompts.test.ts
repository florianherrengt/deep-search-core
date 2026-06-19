import { describe, it, expect } from "vitest";
import { DEFAULT_SYSTEM_PROMPT } from "../../src/research-orchestrator/prompts/system-prompt";
import { RESEARCH_PLANNER_PROMPT } from "../../src/research-orchestrator/prompts/research-planner-prompt";

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeTruthy();
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe("string");
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("mentions core workflow tools", () => {
    const prompt = DEFAULT_SYSTEM_PROMPT;
    expect(prompt).toMatch(/sequential_thinking/);
    expect(prompt).toMatch(/ask_questions/);
    expect(prompt).toMatch(/create_research_plan/);
    expect(prompt).toMatch(/extract_page_content/);
    expect(prompt).toMatch(/research_checkpoint/);
    expect(prompt).toMatch(/facts_check/);
    expect(prompt).toMatch(/disambiguate/);
  });

  it("includes research workflow phases", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Clarify before planning/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Plan the research/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Research in passes/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Analyze and answer/);
  });

  it("includes stop conditions guidance", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Stop only when/);
  });

  it("includes citation requirements", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Cite URLs/);
  });
});

describe("RESEARCH_PLANNER_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(RESEARCH_PLANNER_PROMPT).toBeTruthy();
    expect(typeof RESEARCH_PLANNER_PROMPT).toBe("string");
    expect(RESEARCH_PLANNER_PROMPT.length).toBeGreaterThan(100);
  });

  it("includes required output sections", () => {
    const prompt = RESEARCH_PLANNER_PROMPT;
    expect(prompt).toMatch(/## Objective/);
    expect(prompt).toMatch(/## Context extracted/);
    expect(prompt).toMatch(/## Must-answer questions/);
    expect(prompt).toMatch(/## Source priority/);
    expect(prompt).toMatch(/## Research passes/);
    expect(prompt).toMatch(/## Confidence rules/);
    expect(prompt).toMatch(/## Stop conditions/);
  });

  it("includes goal classification types", () => {
    expect(RESEARCH_PLANNER_PROMPT).toMatch(/decide, compare, verify, explain, find, or troubleshoot/);
  });

  it("includes source classification levels", () => {
    const prompt = RESEARCH_PLANNER_PROMPT;
    expect(prompt).toMatch(/Primary/);
    expect(prompt).toMatch(/Secondary/);
    expect(prompt).toMatch(/Experiential/);
    expect(prompt).toMatch(/Weak/);
  });
});
