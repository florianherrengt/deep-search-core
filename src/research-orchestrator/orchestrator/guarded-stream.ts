import {
  streamText,
  convertToModelMessages,
  type FinishReason,
  type LanguageModel,
  type ModelMessage,
  type ToolChoice,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
  isToolUIPart,
} from "ai";
import {
  evaluateAssistantStep,
  type GuardrailEvent,
  type GuardDecision,
} from "../guards/agent-guards";
import { getActiveToolNamesForMessages } from "../guards/tool-call-requirements";
import { createResearchTools } from "../tools/tool-registry";
import type { SearchKeys, FetchFn, PageLoader, HiddenTextPredicate, OrchestratorEvent, ProviderOptionsCallback, StreamErrorHandler } from "../types";

const MAX_GUARD_RETRIES = 2;

const DEFAULT_MAX_RETRIES_PER_GUARD: Record<string, number> = {
  question_tool: MAX_GUARD_RETRIES,
  research_checkpoint: MAX_GUARD_RETRIES,
  tool_call_requirement: MAX_GUARD_RETRIES,
};

type AttemptFinish = {
  messages: UIMessage[];
  responseMessage: UIMessage;
  finishReason?: FinishReason;
  usage?: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
};

export function createGuardedStream({
  model,
  messages,
  abortSignal,
  fetchFn,
  searchKeys,
  pageLoader,
  systemPrompt,
  isHiddenText,
  tools: prebuiltTools,
  extraTools,
  evaluateStep,
  maxGuardRetries,
  getProviderOptions,
  onError,
  onEvent,
  controller,
}: {
  model: LanguageModel;
  messages: UIMessage[];
  abortSignal?: AbortSignal;
  fetchFn?: FetchFn;
  searchKeys?: SearchKeys;
  pageLoader?: PageLoader;
  systemPrompt: string;
  isHiddenText?: HiddenTextPredicate;
  tools?: ToolSet;
  extraTools?: ToolSet;
  evaluateStep?: (params: {
    messages: UIMessage[];
    responseMessage: UIMessage;
  }) => GuardDecision<ToolSet>;
  maxGuardRetries?: Record<string, number>;
  getProviderOptions?: ProviderOptionsCallback;
  onError?: StreamErrorHandler;
  onEvent?: (event: OrchestratorEvent) => void;
  controller: ReadableStreamDefaultController<UIMessageChunk>;
}): Promise<void> {
  return (async () => {
    const effectiveMaxRetries = { ...DEFAULT_MAX_RETRIES_PER_GUARD, ...maxGuardRetries };
    const retries: Record<string, number> = {};
    let currentUiMessages = messages;
    let toolChoice: ToolChoice<ToolSet> | undefined;
    let sendStart = true;
    let lastFinish: AttemptFinish | undefined;

    try {
      let tools: ToolSet;
      if (prebuiltTools) {
        tools = extraTools ? { ...prebuiltTools, ...extraTools } : prebuiltTools;
      } else {
        const baseTools = await createResearchTools({
          model,
          fetchFn: fetchFn ?? globalThis.fetch.bind(globalThis),
          searchKeys,
          pageLoader,
        });
        tools = extraTools ? { ...baseTools, ...extraTools } : baseTools;
      }

      let currentModelMessages = await convertToModelMessages(
        currentUiMessages,
        { tools },
      );

      while (!abortSignal?.aborted) {
        lastFinish = await runAttempt({
          model,
          tools,
          messages: currentModelMessages,
          activeTools: getActiveToolNamesForMessages(
            tools,
            currentUiMessages,
          ),
          toolChoice,
          originalMessages: currentUiMessages,
          sendStart,
          abortSignal,
          controller,
          systemPrompt,
          getProviderOptions,
          onError,
        });

        if (lastFinish.usage) {
          writeTokenUsageEvent(controller, lastFinish.usage, onEvent);
        }

        const decision = evaluateStep
          ? evaluateStep({
              messages: currentUiMessages,
              responseMessage: lastFinish.responseMessage,
            })
          : evaluateAssistantStep({
              messages: currentUiMessages,
              responseMessage: lastFinish.responseMessage,
              isHiddenText,
            });

        if (decision.action === "accept") {
          const diagnostic = getNoReplyDiagnostic(lastFinish, isHiddenText);
          if (diagnostic) {
            writeAgentDiagnosticEvent(controller, diagnostic, onEvent);
          }
          break;
        }

        const guardRetryCount = retries[decision.guard] ?? 0;
        const guardMaxRetries = effectiveMaxRetries[decision.guard] ?? MAX_GUARD_RETRIES;
        if (guardRetryCount >= guardMaxRetries) {
          writeGuardrailEvent(controller, maxRetryWarning(decision, guardMaxRetries), onEvent);
          break;
        }

        retries[decision.guard] = guardRetryCount + 1;
        writeGuardrailEvent(controller, {
          ...decision.event,
          attempt: retries[decision.guard],
        }, onEvent);

        currentUiMessages = lastFinish.messages;
        currentModelMessages = await buildRetryMessages({
          messages: currentUiMessages,
          tools,
          instruction: decision.retryInstruction,
        });
        toolChoice = decision.toolChoice;
        sendStart = false;
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        return;
      }
      throw error;
    }
  })();
}

type RunAttemptParams = {
  model: LanguageModel;
  tools: ToolSet;
  messages: ModelMessage[];
  activeTools: string[];
  toolChoice: ToolChoice<ToolSet> | undefined;
  originalMessages: UIMessage[];
  sendStart: boolean;
  abortSignal: AbortSignal | undefined;
  controller: ReadableStreamDefaultController<UIMessageChunk>;
  systemPrompt: string;
  getProviderOptions?: ProviderOptionsCallback;
  onError?: StreamErrorHandler;
};

async function runAttempt(params: RunAttemptParams): Promise<AttemptFinish> {
  try {
    return await runAttemptOnce(params);
  } catch (error) {
    if (
      params.toolChoice &&
      !params.abortSignal?.aborted &&
      isForcedToolChoiceUnsupported(error)
    ) {
      return await runAttemptOnce({ ...params, toolChoice: undefined });
    }
    throw error;
  }
}

function isForcedToolChoiceUnsupported(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    (message.includes("tool_choice") || message.includes("tool choice")) &&
    (message.includes("thinking") || message.includes("reasoning"))
  );
}

async function runAttemptOnce({
  model,
  tools,
  messages,
  activeTools,
  toolChoice,
  originalMessages,
  sendStart,
  abortSignal,
  controller,
  systemPrompt: effectiveSystemPrompt,
  getProviderOptions,
  onError,
}: RunAttemptParams): Promise<AttemptFinish> {
  let finish: AttemptFinish | undefined;
  const result = streamText({
    model,
    system: effectiveSystemPrompt,
    messages,
    tools,
    activeTools: activeTools.length > 0 ? activeTools : undefined,
    toolChoice,
    abortSignal,
    providerOptions: getProviderOptions
      ? getProviderOptions({ model, toolChoice })
      : undefined,
  });
  const stream = result.toUIMessageStream<UIMessage>({
    originalMessages,
    sendStart,
    sendFinish: false,
    onError,
    onFinish: (event) => {
      finish = {
        messages: event.messages,
        responseMessage: event.responseMessage,
        finishReason: event.finishReason,
      };
    },
  });

  await pipeUIMessageStream(stream, controller, abortSignal);

  let finishReason: FinishReason | undefined;
  let totalUsage: Awaited<typeof result.totalUsage> | undefined;

  try {
    finishReason = await result.finishReason;
    totalUsage = await result.totalUsage;
  } catch (err) {
    if (!abortSignal?.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Model attempt finished without a response message: ${message}`);
    }
  }

  if (!finish) {
    throw new Error("Model attempt finished without a response message.");
  }

  finish.finishReason = finish.finishReason ?? finishReason;
  if (totalUsage) {
    finish.usage = {
      inputTokens: totalUsage.inputTokens ?? undefined,
      outputTokens: totalUsage.outputTokens ?? undefined,
      totalTokens: totalUsage.totalTokens ?? undefined,
    };
  }

  return finish;
}

async function buildRetryMessages({
  messages,
  tools,
  instruction,
}: {
  messages: UIMessage[];
  tools: ToolSet;
  instruction: string;
}): Promise<ModelMessage[]> {
  return [
    ...(await convertToModelMessages(messages, { tools })),
    {
      role: "user",
      content: `Internal guardrail retry. ${instruction}`,
    },
  ];
}

async function pipeUIMessageStream(
  stream: ReadableStream<UIMessageChunk>,
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  abortSignal: AbortSignal | undefined,
) {
  await stream.pipeTo(
    new WritableStream<UIMessageChunk>({
      write(chunk) {
        controller.enqueue(chunk);
      },
    }),
    { signal: abortSignal, preventClose: true },
  );
}

function writeGuardrailEvent(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  event: GuardrailEvent,
  onEvent?: (event: OrchestratorEvent) => void,
) {
  controller.enqueue({
    type: "data-guardrail_event",
    id: `guardrail-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: event,
  });
  onEvent?.({ type: "guardrail", data: event as unknown as Record<string, unknown> });
}

interface AgentDiagnosticEvent {
  kind: string;
  status: string;
  title: string;
  message: string;
  reason: string;
  finishReason?: string;
  toolCallCount?: number;
}

function writeAgentDiagnosticEvent(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  event: AgentDiagnosticEvent,
  onEvent?: (event: OrchestratorEvent) => void,
) {
  controller.enqueue({
    type: "data-agent_diagnostic",
    id: `agent-diagnostic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: event,
  });
  onEvent?.({ type: "diagnostic", data: event as unknown as Record<string, unknown> });
}

function writeTokenUsageEvent(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  usage: NonNullable<AttemptFinish["usage"]>,
  onEvent?: (event: OrchestratorEvent) => void,
) {
  controller.enqueue({
    type: "data-token_usage",
    id: `token-usage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: usage,
  });
  onEvent?.({ type: "token_usage", data: usage as unknown as Record<string, unknown> });
}

function getNoReplyDiagnostic(
  finish: AttemptFinish,
  isHiddenText?: HiddenTextPredicate,
): AgentDiagnosticEvent | null {
  const summary = summarizeAssistantOutput(finish.responseMessage, isHiddenText);
  if (summary.hasVisibleReply) return null;
  if (finish.finishReason === "tool-calls") {
    return null;
  }

  return {
    kind: "empty_response",
    status: "warning",
    title: "No assistant reply",
    message: getNoReplyMessage(finish.finishReason, summary),
    reason: getNoReplyReason(finish.finishReason, summary),
    ...(finish.finishReason ? { finishReason: finish.finishReason } : {}),
    ...(summary.toolCallCount > 0
      ? { toolCallCount: summary.toolCallCount }
      : {}),
  };
}

function summarizeAssistantOutput(
  message: UIMessage,
  isHiddenText?: HiddenTextPredicate,
) {
  const hidden = isHiddenText ?? (() => false);
  let hasVisibleReply = false;
  let hasReasoning = false;
  let hasSubAgentText = false;
  let toolCallCount = 0;

  for (const part of message.parts) {
    if (part.type === "text") {
      if (!part.text.trim()) continue;
      if (hidden(part)) {
        hasSubAgentText = true;
      } else {
        hasVisibleReply = true;
      }
      continue;
    }

    if (part.type === "reasoning" && part.text.trim()) {
      hasReasoning = true;
      continue;
    }

    if (
      part.type === "source-url" ||
      part.type === "source-document" ||
      part.type === "file"
    ) {
      hasVisibleReply = true;
      continue;
    }

    if (isToolUIPart(part)) {
      toolCallCount += 1;
    }
  }

  return {
    hasVisibleReply,
    hasReasoning,
    hasSubAgentText,
    toolCallCount,
  };
}

function getNoReplyMessage(
  finishReason: FinishReason | undefined,
  summary: ReturnType<typeof summarizeAssistantOutput>,
) {
  if (finishReason === "length") {
    return "The provider stopped at the output limit before returning visible answer text.";
  }

  if (finishReason === "content-filter") {
    return "The provider reported a content-filter stop before returning visible answer text.";
  }

  if (summary.toolCallCount > 0) {
    return "The model finished after tool work but did not return final answer text.";
  }

  if (summary.hasSubAgentText) {
    return "Only internal verification or tool-progress text was produced; no final answer text was returned.";
  }

  if (summary.hasReasoning) {
    return "The model produced reasoning but no visible answer text.";
  }

  return "The provider ended the turn without returning visible answer text.";
}

function getNoReplyReason(
  finishReason: FinishReason | undefined,
  summary: ReturnType<typeof summarizeAssistantOutput>,
) {
  const reason = finishReason ?? "unknown";

  if (summary.toolCallCount > 0) {
    return `Finish reason: ${reason}. Tool calls in the final step: ${summary.toolCallCount}.`;
  }

  return `Finish reason: ${reason}.`;
}

function maxRetryWarning(
  decision: Extract<GuardDecision<ToolSet>, { action: "retry" }>,
  maxRetries: number,
): GuardrailEvent {
  return {
    kind: decision.guard,
    status: "warning",
    title: "Guardrail retry limit reached",
    message: "The agent kept missing this guardrail, so the latest output is shown.",
    reason: decision.event.reason,
    attempt: maxRetries,
  };
}
