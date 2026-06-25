import { describe, it, expect } from "vitest";
import { streamResearch } from "../../src/research-orchestrator/orchestrator/stream";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { LanguageModelV3StreamPart, LanguageModelV3StreamResult } from "@ai-sdk/provider";
import type { UIMessage } from "ai";

function makeUserMessage(text: string): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function textChunks(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start" as const, warnings: [] },
    { type: "text-start" as const, id: "text-1" },
    { type: "text-delta" as const, id: "text-1", delta: text },
    { type: "text-end" as const, id: "text-1" },
    {
      type: "finish" as const,
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 5, noCache: undefined, cacheRead: undefined, cacheWrite: undefined, cacheCreation: undefined },
        outputTokens: { total: 5, reasoning: undefined, totalNoCache: undefined },
        totalTokens: 10,
        reasoningTokens: undefined,
      },
    },
  ];
}

/**
 * Builds a MockLanguageModelV3 that emits `text` as a text-delta stream and
 * finishes with `stop`. Uses simulateReadableStream so the underlying stream
 * supports pipeThrough (the bare `stream:` shortcut form produces an async
 * iterator without pipeThrough, which the AI SDK relies on internally).
 */
function makeStreamingModel(text: string) {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-model",
    doStream: async (): Promise<LanguageModelV3StreamResult> => ({
      stream: simulateReadableStream({ chunks: textChunks(text) }),
    }),
  });
}

function makeErrorModel(error: Error) {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-model",
    doStream: () => {
      throw error;
    },
  });
}

async function drain(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  const chunks: unknown[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

function chunkType(chunk: unknown): string {
  return (chunk as { type?: string }).type ?? "";
}

describe("streamResearch", () => {
  it("returns a ReadableStream", () => {
    const stream = streamResearch({
      model: makeStreamingModel("Hello"),
      messages: [makeUserMessage("Hi")],
    });
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("emits a finish chunk when the model streams successfully", async () => {
    const stream = streamResearch({
      model: makeStreamingModel("Hello world"),
      messages: [makeUserMessage("Hi")],
    });

    const chunks = await drain(stream);
    const types = chunks.map(chunkType);

    // The contract: every successful research stream MUST end with a finish
    // chunk so the downstream consumer knows the turn is over.
    expect(types[types.length - 1]).toBe("finish");
    expect(types).not.toContain("error");
    expect(types).not.toContain("abort");
  });

  it("emits an abort chunk when the abort signal is already set", async () => {
    const controller = new AbortController();
    controller.abort();

    const stream = streamResearch({
      model: makeStreamingModel("Hello"),
      messages: [makeUserMessage("Hi")],
      abortSignal: controller.signal,
    });

    const chunks = await drain(stream);
    const types = chunks.map(chunkType);

    // When the signal is already aborted, we MUST get an abort chunk (not an
    // error chunk) so the UI distinguishes user-initiated stop from a crash.
    expect(types).toContain("abort");
    expect(types).not.toContain("error");
  });

  it("emits an error chunk (not an abort chunk) when the model throws without an abort signal", async () => {
    const stream = streamResearch({
      model: makeErrorModel(new Error("model boom")),
      messages: [makeUserMessage("Hi")],
    });

    const chunks = await drain(stream);
    const types = chunks.map(chunkType);

    // Real provider failure must surface as an error chunk so the UI reports
    // the failure rather than silently treating it as a user cancellation.
    expect(types).toContain("error");
    expect(types).not.toContain("abort");
    // Error chunk must carry a non-empty diagnostic for the UI.
    const errorChunk = chunks.find((c) => chunkType(c) === "error") as
      | { errorText?: string }
      | undefined;
    expect(typeof errorChunk?.errorText).toBe("string");
    expect((errorChunk?.errorText ?? "").length).toBeGreaterThan(0);
  });

  it("emits an abort chunk when the model throws after the user aborts", async () => {
    const controller = new AbortController();
    controller.abort();

    const stream = streamResearch({
      model: makeErrorModel(new Error("aborted")),
      messages: [makeUserMessage("Hi")],
      abortSignal: controller.signal,
    });

    const chunks = await drain(stream);
    const types = chunks.map(chunkType);

    // Abort must win over error: if the user pressed stop, the UI shows abort
    // even when the underlying model call also fails.
    expect(types).toContain("abort");
    expect(types).not.toContain("error");
  });
});
