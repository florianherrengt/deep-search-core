import { describe, it, expect } from "vitest";
import type { UIMessage, ModelMessage } from "ai";
import {
  evaluateToolCallRequirementForResponse,
  evaluateToolCallRequirementForUIMessages,
  evaluateToolCallRequirementForModelMessages,
  getToolCallNamesFromUIMessages,
  getToolCallNamesFromModelMessages,
  formatToolCallRequirementViolation,
  applyToolCallRequirementSafeguards,
  getActiveToolNamesForMessages,
  ToolCallRequirementError,
  TOOL_CALL_REQUIREMENTS,
} from "../../src/research-orchestrator/guards/tool-call-requirements";
import { TOOL_NAMES } from "../../src/research-orchestrator/tool-names";

function makeToolPart(name: string): UIMessage["parts"][number] {
  return {
    type: `tool-${name}`,
    toolInvocation: {
      toolCallId: `call-${name}`,
      toolName: name,
      state: "result",
      args: {},
      result: "ok",
    },
  } as unknown as UIMessage["parts"][number];
}

function makeUserMessage(text: string): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function makeAssistantMessage(parts: UIMessage["parts"]): UIMessage {
  return {
    id: "a1",
    role: "assistant",
    parts,
  };
}

describe("TOOL_CALL_REQUIREMENTS", () => {
  it("create_research_plan requires ask_questions", () => {
    const req = TOOL_CALL_REQUIREMENTS[TOOL_NAMES.create_research_plan];
    expect(req.requiredPreviousTools).toContain(TOOL_NAMES.ask_questions);
  });

  it("extract_page_content requires any search tool", () => {
    const req = TOOL_CALL_REQUIREMENTS[TOOL_NAMES.extract_page_content];
    expect(req.anyOfPreviousTools).toEqual([
      TOOL_NAMES.brave_search,
      TOOL_NAMES.exa_search,
      TOOL_NAMES.serper_search,
      TOOL_NAMES.tavily_search,
      TOOL_NAMES.searxng_search,
      TOOL_NAMES.youtube_search,
      TOOL_NAMES.hacker_news_search,
      TOOL_NAMES.aggregate_search,
    ]);
  });
});

describe("evaluateToolCallRequirementForUIMessages", () => {
  it("returns null for tool with no requirement", () => {
    const result = evaluateToolCallRequirementForUIMessages("brave_search", []);
    expect(result).toBeNull();
  });

  it("returns violation when create_research_plan called without ask_questions", () => {
    const messages: UIMessage[] = [
      makeUserMessage("research solar panels"),
      makeAssistantMessage([makeToolPart("create_research_plan")]),
    ];

    const result = evaluateToolCallRequirementForUIMessages(
      TOOL_NAMES.create_research_plan,
      messages.slice(0, 1), // only user message, no ask_questions
    );
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe(TOOL_NAMES.create_research_plan);
    expect(result!.missingPreviousTools).toContain(TOOL_NAMES.ask_questions);
  });

  it("returns null when create_research_plan called after ask_questions", () => {
    const messages: UIMessage[] = [
      makeUserMessage("research solar panels"),
      makeAssistantMessage([makeToolPart("ask_questions")]),
    ];

    const result = evaluateToolCallRequirementForUIMessages(
      TOOL_NAMES.create_research_plan,
      messages,
    );
    expect(result).toBeNull();
  });

  it("returns violation when extract_page_content called without any search", () => {
    const messages: UIMessage[] = [
      makeUserMessage("research solar panels"),
    ];

    const result = evaluateToolCallRequirementForUIMessages(
      TOOL_NAMES.extract_page_content,
      messages,
    );
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe(TOOL_NAMES.extract_page_content);
    expect(result!.missingAnyOfTools).toBeDefined();
  });

  it("returns null when extract_page_content called after brave_search", () => {
    const messages: UIMessage[] = [
      makeUserMessage("research solar panels"),
      makeAssistantMessage([makeToolPart("brave_search")]),
    ];

    const result = evaluateToolCallRequirementForUIMessages(
      TOOL_NAMES.extract_page_content,
      messages,
    );
    expect(result).toBeNull();
  });

  it("returns null when extract_page_content called after tavily_search", () => {
    const messages: UIMessage[] = [
      makeUserMessage("research solar panels"),
      makeAssistantMessage([makeToolPart("tavily_search")]),
    ];

    const result = evaluateToolCallRequirementForUIMessages(
      TOOL_NAMES.extract_page_content,
      messages,
    );
    expect(result).toBeNull();
  });

  it("returns null when extract_page_content called after hacker_news_search", () => {
    const messages: UIMessage[] = [
      makeUserMessage("research launch reactions"),
      makeAssistantMessage([makeToolPart("hacker_news_search")]),
    ];

    const result = evaluateToolCallRequirementForUIMessages(
      TOOL_NAMES.extract_page_content,
      messages,
    );
    expect(result).toBeNull();
  });
});

describe("evaluateToolCallRequirementForModelMessages", () => {
  function makeModelAssistantMsg(toolNames: string[]): ModelMessage {
    return {
      role: "assistant",
      content: toolNames.map((name) => ({
        type: "tool-call",
        toolCallId: `call-${name}`,
        toolName: name,
        args: {},
      })),
    };
  }

  it("returns null for tool with no requirement", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "test" },
    ];
    expect(
      evaluateToolCallRequirementForModelMessages("brave_search", messages),
    ).toBeNull();
  });

  it("returns violation for create_research_plan without ask_questions", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "test" },
      makeModelAssistantMsg(["create_research_plan"]),
    ];
    const result = evaluateToolCallRequirementForModelMessages(
      TOOL_NAMES.create_research_plan,
      messages.slice(0, 1),
    );
    expect(result).not.toBeNull();
  });

  it("skips non-assistant model messages", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "test" },
      { role: "system", content: "system" },
    ];
    expect(
      evaluateToolCallRequirementForModelMessages(
        TOOL_NAMES.create_research_plan,
        messages,
      ),
    ).not.toBeNull();
  });

  it("handles string content model messages", () => {
    const messages: ModelMessage[] = [
      { role: "assistant", content: "just text, no tool calls" },
    ];
    expect(
      evaluateToolCallRequirementForModelMessages(
        TOOL_NAMES.create_research_plan,
        messages,
      ),
    ).not.toBeNull();
  });
});

describe("evaluateToolCallRequirementForResponse", () => {
  it("returns null when response has no violating tool calls", () => {
    const messages: UIMessage[] = [
      makeUserMessage("test"),
    ];
    const responseMsg = makeAssistantMessage([
      makeToolPart("brave_search"),
    ]);

    const result = evaluateToolCallRequirementForResponse({
      messages,
      responseMessage: responseMsg,
    });
    expect(result).toBeNull();
  });

  it("returns violation when response calls extract_page_content without search", () => {
    const messages: UIMessage[] = [
      makeUserMessage("test"),
    ];
    const responseMsg = makeAssistantMessage([
      makeToolPart("extract_page_content"),
    ]);

    const result = evaluateToolCallRequirementForResponse({
      messages,
      responseMessage: responseMsg,
    });
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe(TOOL_NAMES.extract_page_content);
  });

  it("returns null when response has multiple tools all valid", () => {
    const messages: UIMessage[] = [
      makeUserMessage("test"),
      makeAssistantMessage([makeToolPart("brave_search")]),
    ];
    const responseMsg = makeAssistantMessage([
      makeToolPart("extract_page_content"),
      makeToolPart("sequential_thinking"),
    ]);

    const result = evaluateToolCallRequirementForResponse({
      messages,
      responseMessage: responseMsg,
    });
    expect(result).toBeNull();
  });
});

describe("getToolCallNamesFromUIMessages", () => {
  it("extracts tool names from messages", () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([makeToolPart("brave_search"), makeToolPart("extract_page_content")]),
    ];
    expect(getToolCallNamesFromUIMessages(messages)).toEqual([
      "brave_search",
      "extract_page_content",
    ]);
  });

  it("returns empty for messages with no tool calls", () => {
    const messages: UIMessage[] = [
      makeUserMessage("test"),
      makeAssistantMessage([{ type: "text", text: "hello" }]),
    ];
    expect(getToolCallNamesFromUIMessages(messages)).toEqual([]);
  });

  it("returns empty for empty array", () => {
    expect(getToolCallNamesFromUIMessages([])).toEqual([]);
  });
});

describe("getToolCallNamesFromModelMessages", () => {
  it("extracts tool names from model messages", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "1", toolName: "brave_search", args: {} },
          { type: "tool-call", toolCallId: "2", toolName: "extract_page_content", args: {} },
        ],
      },
    ];
    expect(getToolCallNamesFromModelMessages(messages)).toEqual([
      "brave_search",
      "extract_page_content",
    ]);
  });

  it("skips non-assistant messages", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "test" },
    ];
    expect(getToolCallNamesFromModelMessages(messages)).toEqual([]);
  });

  it("skips string content messages", () => {
    const messages: ModelMessage[] = [
      { role: "assistant", content: "text" },
    ];
    expect(getToolCallNamesFromModelMessages(messages)).toEqual([]);
  });
});

describe("formatToolCallRequirementViolation", () => {
  it("formats missing required tools", () => {
    const result = formatToolCallRequirementViolation({
      toolName: "create_research_plan",
      requiredPreviousTools: ["ask_questions"],
      missingPreviousTools: ["ask_questions"],
      instruction: "Call ask_questions first.",
    });
    expect(result).toContain("create_research_plan");
    expect(result).toContain("ask_questions");
    expect(result).toContain("Call ask_questions first.");
  });

  it("formats missing any-of tools", () => {
    const result = formatToolCallRequirementViolation({
      toolName: "extract_page_content",
      anyOfPreviousTools: ["brave_search", "exa_search"],
      missingAnyOfTools: ["brave_search", "exa_search"],
      instruction: "Run a search first.",
    });
    expect(result).toContain("extract_page_content");
    expect(result).toContain("At least one of these tools");
    expect(result).toContain("brave_search");
    expect(result).toContain("exa_search");
  });
});

describe("ToolCallRequirementError", () => {
  it("has correct name and message", () => {
    const violation = {
      toolName: "create_research_plan",
      requiredPreviousTools: ["ask_questions"],
      missingPreviousTools: ["ask_questions"],
      instruction: "Call ask_questions first.",
    };
    const error = new ToolCallRequirementError(violation);
    expect(error.name).toBe("ToolCallRequirementError");
    expect(error.violation).toBe(violation);
    expect(error.message).toContain("create_research_plan");
  });
});

describe("applyToolCallRequirementSafeguards", () => {
  it("wraps tools without changing non-executing tools", () => {
    const tools = {
      ask_questions: {
        description: "Ask questions",
        parameters: { strict: true },
      },
    };
    const wrapped = applyToolCallRequirementSafeguards(tools);
    expect(wrapped.ask_questions.description).toContain("Ask questions");
    expect(wrapped.ask_questions.parameters).toBe(tools.ask_questions.parameters);
  });

  it("appends prerequisite description to tools with requirements", () => {
    const tools = {
      create_research_plan: {
        description: "Create a plan",
        parameters: { strict: true },
        execute: async () => "ok",
      },
    };
    const wrapped = applyToolCallRequirementSafeguards(tools);
    expect(wrapped.create_research_plan.description).toContain("Prerequisite");
    expect(wrapped.create_research_plan.description).toContain("ask_questions");
  });

  it("wrapped execute throws on violation", () => {
    const tools = {
      extract_page_content: {
        description: "Extract",
        parameters: { strict: true },
        execute: async () => "ok",
      },
    };
    const wrapped = applyToolCallRequirementSafeguards(tools);

    expect(() =>
      wrapped.extract_page_content.execute!({ url: "https://example.com" }, {
        toolCallId: "t1",
        messages: [{ role: "user", content: "test" }],
      }),
    ).toThrow(ToolCallRequirementError);
  });

  it("wrapped execute passes through when requirements met", async () => {
    const tools = {
      brave_search: {
        description: "Search",
        parameters: { strict: true },
        execute: async () => "search done",
      },
      extract_page_content: {
        description: "Extract",
        parameters: { strict: true },
        execute: async () => "extract done",
      },
    };
    const wrapped = applyToolCallRequirementSafeguards(tools);

    const result = await wrapped.extract_page_content.execute!(
      { url: "https://example.com" },
      {
        toolCallId: "t2",
        messages: [
          { role: "user", content: "test" },
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "brave_search", args: {} }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "brave_search", result: "ok" }] },
        ],
      },
    );
    expect(result).toBe("extract done");
  });
});

describe("getActiveToolNamesForMessages", () => {
  it("filters out tools with unmet requirements", () => {
    const tools = {
      brave_search: {
        description: "Search",
        parameters: { strict: true },
      },
      extract_page_content: {
        description: "Extract",
        parameters: { strict: true },
      },
      ask_questions: {
        description: "Ask",
        parameters: { strict: true },
      },
      create_research_plan: {
        description: "Plan",
        parameters: { strict: true },
      },
    };
    const messages: UIMessage[] = [
      makeUserMessage("test"),
    ];

    const active = getActiveToolNamesForMessages(tools, messages);
    expect(active).toContain("brave_search");
    expect(active).toContain("ask_questions");
    expect(active).not.toContain("create_research_plan");
    expect(active).not.toContain("extract_page_content");
  });

  it("returns all tools when requirements are met", () => {
    const tools = {
      brave_search: {
        description: "Search",
        parameters: { strict: true },
      },
      extract_page_content: {
        description: "Extract",
        parameters: { strict: true },
      },
    };
    const messages: UIMessage[] = [
      makeUserMessage("test"),
      makeAssistantMessage([makeToolPart("brave_search")]),
    ];

    const active = getActiveToolNamesForMessages(tools, messages);
    expect(active).toContain("brave_search");
    expect(active).toContain("extract_page_content");
  });
});
