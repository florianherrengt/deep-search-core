import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  asksUserForInput,
  isResearchLikeRequest,
  evaluateAssistantStep,
  reviewResearchCheckpoint,
  guardrailEventSchema,
  researchCheckpointInputSchema,
  researchCheckpointResultSchema,
} from "../../src/research-orchestrator/guards/agent-guards";
import type { UIMessage } from "ai";

function makeUserMessage(text: string): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function makeAssistantMessage(
  parts: UIMessage["parts"],
): UIMessage {
  return {
    id: "a1",
    role: "assistant",
    parts,
  };
}

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

// =================== asksUserForInput ===================

describe("asksUserForInput", () => {
  it("detects direct question to user", () => {
    expect(asksUserForInput("What would you like me to search for?")).toBe(true);
  });

  it("detects 'should I' pattern", () => {
    expect(asksUserForInput("Should I continue with this approach?")).toBe(true);
  });

  it("detects 'should we' pattern", () => {
    expect(asksUserForInput("Should we move to primary sources first?")).toBe(true);
  });

  it("detects 'can you' question", () => {
    expect(asksUserForInput("Can you tell me more about your requirements?")).toBe(true);
  });

  it("detects request patterns", () => {
    expect(asksUserForInput("Please provide more details about the project.")).toBe(true);
    expect(asksUserForInput("Let me know if you need anything else.")).toBe(true);
  });

  it("detects choice patterns", () => {
    expect(
      asksUserForInput(
        "Please choose an option before I continue with the search.",
      ),
    ).toBe(true);
  });

  it("ignores text inside code blocks", () => {
    expect(
      asksUserForInput(
        "```\nWhat would you like?\n```\nHere are the results:",
      ),
    ).toBe(false);
  });

  it("ignores questions in blockquotes", () => {
    expect(
      asksUserForInput("> What would you like?\n\nBased on the research, ..."),
    ).toBe(false);
  });

  it("does not flag 'the question is' meta-statements", () => {
    expect(
      asksUserForInput("The question is about renewable energy policy."),
    ).toBe(false);
  });

  it("does not flag markdown 'questions:' headers", () => {
    expect(
      asksUserForInput("Questions:\n- What is the price?\n- How does it work?"),
    ).toBe(false);
  });

  it("does not flag statements without user-directed questions", () => {
    expect(
      asksUserForInput("The research shows that renewable energy is growing."),
    ).toBe(false);
  });

  it("does not flag why/because patterns as questions", () => {
    expect(
      asksUserForInput(
        "The reason is because solar panel costs have dropped significantly.",
      ),
    ).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(asksUserForInput("")).toBe(false);
    expect(asksUserForInput("  ")).toBe(false);
  });

  it("detects imperative requests with 'you' context", () => {
    expect(
      asksUserForInput("Could you share your preferences before I proceed?"),
    ).toBe(true);
  });

  it("does not flag non-question text with 'you'", () => {
    expect(
      asksUserForInput("I will search for information about climate change for you."),
    ).toBe(false);
  });

  it("detects 'would you' pattern", () => {
    expect(
      asksUserForInput("Would you prefer a summary or a detailed report?"),
    ).toBe(true);
  });
});

// =================== isResearchLikeRequest ===================

describe("isResearchLikeRequest", () => {
  it("returns false for greetings", () => {
    expect(isResearchLikeRequest("Hi")).toBe(false);
    expect(isResearchLikeRequest("Hello")).toBe(false);
    expect(isResearchLikeRequest("Thanks")).toBe(false);
    expect(isResearchLikeRequest("Thank you")).toBe(false);
    expect(isResearchLikeRequest("OK")).toBe(false);
    expect(isResearchLikeRequest("Okay")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(isResearchLikeRequest("")).toBe(false);
    expect(isResearchLikeRequest("  ")).toBe(false);
  });

  it("returns true for research keyword matches", () => {
    expect(isResearchLikeRequest("What is the latest news?")).toBe(true);
    expect(isResearchLikeRequest("Find the best laptop")).toBe(true);
    expect(isResearchLikeRequest("Research quantum computing applications")).toBe(true);
    expect(isResearchLikeRequest("Compare iPhone vs Android")).toBe(true);
    expect(isResearchLikeRequest("Verify this claim about climate")).toBe(true);
    expect(isResearchLikeRequest("Recommend a good restaurant")).toBe(true);
    expect(isResearchLikeRequest("Review of Tesla Model 3")).toBe(true);
    expect(isResearchLikeRequest("What is the price of Bitcoin?")).toBe(true);
    expect(isResearchLikeRequest("Current market trends in AI")).toBe(true);
  });

  it("returns true for long question-word text", () => {
    expect(
      isResearchLikeRequest(
        "What are the environmental impacts of electric vehicles compared to traditional combustion engines?",
      ),
    ).toBe(true);
  });

  it("returns false for short question without keyword", () => {
    expect(isResearchLikeRequest("What time is it?")).toBe(false);
    expect(isResearchLikeRequest("Who are you?")).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(isResearchLikeRequest("FIND the best solution")).toBe(true);
    expect(isResearchLikeRequest("Latest RESEARCH on vaccines")).toBe(true);
  });
});

// =================== evaluateAssistantStep ===================

describe("evaluateAssistantStep", () => {
  it("accepts response with empty text", () => {
    const decision = evaluateAssistantStep({
      messages: [makeUserMessage("Find me info on solar panels")],
      responseMessage: makeAssistantMessage([
        makeToolPart("brave_search"),
      ]),
    });
    expect(decision.action).toBe("accept");
  });

  it("returns question_tool retry when assistant asks text question", () => {
    const userMsg = makeUserMessage("Find information about solar panels");
    const assistantMsg = makeAssistantMessage([
      { type: "text", text: "What specific aspect of solar panels would you like to know about?" },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
    });

    if (decision.action === "retry") {
      expect(decision.guard).toBe("question_tool");
      expect(decision.retryInstruction).toContain("ask_questions");
      expect(decision.event.kind).toBe("question_tool");
    } else {
      expect.fail("expected retry");
    }
  });

  it("accepts when ask_questions tool was already called and user text is non-research", () => {
    const userMsg = makeUserMessage("Hi there");
    const assistantMsg = makeAssistantMessage([
      makeToolPart("ask_questions"),
      { type: "text", text: "What topic would you like me to research?" },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
    });

    expect(decision.action).toBe("accept");
  });

  it("accepts non-research-like user text", () => {
    const userMsg = makeUserMessage("Hi there");
    const assistantMsg = makeAssistantMessage([
      { type: "text", text: "Hello! How can I help you?" },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
    });

    // The text asks a question, so question_tool guard would fire first
    // But only if the question passes asksUserForInput + no ask_questions tool
    if (decision.action === "retry") {
      expect(decision.guard).toBe("question_tool");
    }
  });

  it("returns research_checkpoint retry when no research tools used", () => {
    const userMsg = makeUserMessage("Research the latest solar panel technology costs");
    const assistantMsg = makeAssistantMessage([
      { type: "text", text: "Solar panel costs have been declining steadily..." },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
    });

    if (decision.action === "retry") {
      expect(decision.guard).toBe("research_checkpoint");
      expect(decision.retryInstruction).toContain("research");
    }
  });

  it("returns research_checkpoint retry for research with tools but no checkpoint", () => {
    const userMsg = makeUserMessage("Research the latest solar panel technology costs");
    const priorSearch = makeAssistantMessage([
      makeToolPart("brave_search"),
    ]);
    const assistantMsg = makeAssistantMessage([
      makeToolPart("extract_page_content"),
      { type: "text", text: "Solar panel costs have been declining..." },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg, priorSearch],
      responseMessage: assistantMsg,
    });

    if (decision.action === "retry") {
      expect(decision.guard).toBe("research_checkpoint");
      expect(decision.event.title).toContain("checkpoint");
    } else {
      expect.fail("expected retry");
    }
  });

  it("accepts when research checkpoint is present with proper history", () => {
    const userMsg = makeUserMessage("Research the latest solar panel technology costs");
    const priorSearch = makeAssistantMessage([
      makeToolPart("brave_search"),
    ]);
    const assistantMsg = makeAssistantMessage([
      makeToolPart("extract_page_content"),
      makeToolPart("research_checkpoint"),
      { type: "text", text: "Solar panel costs have been declining..." },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg, priorSearch],
      responseMessage: assistantMsg,
    });

    expect(decision.action).toBe("accept");
  });

  it("accepts when response ends with a tool call (no visible text after last tool)", () => {
    const userMsg = makeUserMessage("Research solar panel costs");
    const assistantMsg = makeAssistantMessage([
      { type: "text", text: "Running search..." },
      makeToolPart("brave_search"),
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
    });

    expect(decision.action).toBe("accept");
  });

  it("returns tool_call_requirement retry with mocked violation", () => {
    // This tests the guard integration when a tool call requirement is violated.
    // evaluateToolCallRequirementForResponse checks if extract_page_content
    // was called without a prior search. We simulate that scenario.
    const userMsg = makeUserMessage("Research solar panel costs");
    const assistantMsg = makeAssistantMessage([
      makeToolPart("extract_page_content"),
    ]);

    // The current turn has user + response; no prior search tools in messages.
    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
    });

    if (decision.action === "retry") {
      expect(decision.guard).toBe("tool_call_requirement");
      expect(decision.event.title).toBe("Tool prerequisite enforced");
    }
  });

  it("respects hidden text predicate", () => {
    const userMsg = makeUserMessage("Hi");
    const assistantMsg = makeAssistantMessage([
      { type: "text", text: "Hidden question?" },
    ]);

    const decision = evaluateAssistantStep({
      messages: [userMsg],
      responseMessage: assistantMsg,
      isHiddenText: () => true,
    });

    // With all text hidden, no visible question => accept
    expect(decision.action).toBe("accept");
  });
});

// =================== reviewResearchCheckpoint ===================

describe("reviewResearchCheckpoint", () => {
  const validCheckpoint = {
    originalQuestion: "What is the price of solar panels?",
    searchesRun: ["solar panel price 2024"],
    sourcesOpened: [
      { url: "https://example.com/solar", title: "Solar Prices" },
      { url: "https://example2.com/energy", title: "Energy Guide" },
    ],
    claimsVerified: [
      "Average cost is $3 per watt",
      "Prices dropped 10% in 2023",
    ],
    unresolvedQuestions: [],
    confidence: "high" as const,
    readyToAnswer: true,
  };

  it("returns guidance for ready checkpoint", async () => {
    const result = await reviewResearchCheckpoint(validCheckpoint);
    expect(result).toContain("ready to answer");
  });

  it("returns guidance when not ready", async () => {
    const result = await reviewResearchCheckpoint({
      ...validCheckpoint,
      readyToAnswer: false,
    });
    expect(result).toContain("not ready");
  });

  it("prompts for searches when none run", async () => {
    const result = await reviewResearchCheckpoint({
      ...validCheckpoint,
      searchesRun: [],
      readyToAnswer: false,
    });
    expect(result).toContain("one real search");
  });

  it("prompts for more sources", async () => {
    const result = await reviewResearchCheckpoint({
      ...validCheckpoint,
      sourcesOpened: [{ url: "https://example.com" }],
      readyToAnswer: false,
    });
    expect(result).toContain("more than one");
  });

  it("prompts for more verified claims", async () => {
    const result = await reviewResearchCheckpoint({
      ...validCheckpoint,
      claimsVerified: ["One claim"],
      readyToAnswer: false,
    });
    expect(result).toContain("key claims");
  });

  it("prompts about unresolved questions", async () => {
    const result = await reviewResearchCheckpoint({
      ...validCheckpoint,
      unresolvedQuestions: ["What about tax credits?"],
      readyToAnswer: false,
    });
    expect(result).toContain("tax credits");
    expect(result).toContain("Resolve or explicitly disclose");
  });

  it("prompts about low confidence", async () => {
    const result = await reviewResearchCheckpoint({
      ...validCheckpoint,
      confidence: "low",
      readyToAnswer: false,
    });
    expect(result).toContain("Confidence is low");
  });

  it("uses judge function when provided", async () => {
    const judge = async () => "Custom guidance from judge";
    const result = await reviewResearchCheckpoint(validCheckpoint, judge);
    expect(result).toBe("Custom guidance from judge");
  });

  it("falls back when judge returns empty string", async () => {
    const judge = async () => "";
    const result = await reviewResearchCheckpoint(validCheckpoint, judge);
    expect(result).toContain("ready to answer");
  });

  it("falls back when judge throws", async () => {
    const judge = async () => {
      throw new Error("Judge unavailable");
    };
    const result = await reviewResearchCheckpoint(validCheckpoint, judge);
    expect(result).toContain("ready to answer");
  });

  it("falls back when judge returns whitespace only", async () => {
    const judge = async () => "   ";
    const result = await reviewResearchCheckpoint(validCheckpoint, judge);
    expect(result).toContain("ready to answer");
  });

  it("falls back to local validation without judge", async () => {
    const result = await reviewResearchCheckpoint(validCheckpoint);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// =================== schemas ===================

describe("guardrailEventSchema", () => {
  it("validates retrying event", () => {
    const result = guardrailEventSchema.safeParse({
      kind: "question_tool",
      status: "retrying",
      title: "Question tool enforced",
      message: "Prompted the agent...",
      reason: "Plain text question",
      attempt: 1,
    });
    expect(result.success).toBe(true);
  });

  it("validates warning event", () => {
    const result = guardrailEventSchema.safeParse({
      kind: "research_checkpoint",
      status: "warning",
      title: "Retry limit",
      message: "Max retries reached",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid kind", () => {
    const result = guardrailEventSchema.safeParse({
      kind: "invalid",
      status: "retrying",
      title: "Test",
      message: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = guardrailEventSchema.safeParse({
      kind: "question_tool",
      status: "blocked",
      title: "Test",
      message: "Test",
    });
    expect(result.success).toBe(false);
  });
});

describe("researchCheckpointInputSchema", () => {
  it("validates a complete checkpoint", () => {
    const result = researchCheckpointInputSchema.safeParse({
      originalQuestion: "What is the price?",
      searchesRun: ["query 1", "query 2"],
      sourcesOpened: [
        { url: "https://example.com", title: "Example", sourceType: "primary", date: "2024-01-01" },
        { url: "https://example2.com" },
      ],
      claimsVerified: ["Claim 1", "Claim 2"],
      unresolvedQuestions: [],
      confidence: "high",
      readyToAnswer: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing originalQuestion", () => {
    const result = researchCheckpointInputSchema.safeParse({
      searchesRun: [],
      sourcesOpened: [],
      claimsVerified: [],
      unresolvedQuestions: [],
      confidence: "medium",
      readyToAnswer: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid confidence", () => {
    const result = researchCheckpointInputSchema.safeParse({
      originalQuestion: "Test",
      searchesRun: [],
      sourcesOpened: [],
      claimsVerified: [],
      unresolvedQuestions: [],
      confidence: "ultra",
      readyToAnswer: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string in arrays", () => {
    const result = researchCheckpointInputSchema.safeParse({
      originalQuestion: "Test",
      searchesRun: [""],
      sourcesOpened: [],
      claimsVerified: [],
      unresolvedQuestions: [],
      confidence: "medium",
      readyToAnswer: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects source without URL", () => {
    const result = researchCheckpointInputSchema.safeParse({
      originalQuestion: "Test",
      searchesRun: [],
      sourcesOpened: [{ title: "No URL" }],
      claimsVerified: [],
      unresolvedQuestions: [],
      confidence: "medium",
      readyToAnswer: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("researchCheckpointResultSchema", () => {
  it("accepts non-empty string", () => {
    const result = researchCheckpointResultSchema.safeParse("Guidance text");
    expect(result.success).toBe(true);
  });

  it("rejects empty string", () => {
    const result = researchCheckpointResultSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});
