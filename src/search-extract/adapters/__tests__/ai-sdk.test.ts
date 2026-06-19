import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SearchExtractEngine } from "../../core/engine.js";
import type { SearchResult, Summarizer, ExtractResult } from "../../core/types.js";

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: aiMocks.streamText,
    zodSchema: aiMocks.zodSchema,
  };
});

import {
  createAiSdkSummarizer,
  createAiSdkSearchTool,
  createAiSdkExtractPageContentTool,
} from "../ai-sdk.js";

function makeMockEngine(overrides: {
  search?: (provider: string, query: string, opts?: { signal?: AbortSignal }) => Promise<SearchResult[]>;
  extract?: (url: string, opts?: Record<string, unknown>) => Promise<ExtractResult>;
} = {}): SearchExtractEngine {
  return {
    search: overrides.search ?? vi.fn().mockResolvedValue([]),
    extract: overrides.extract ?? vi.fn().mockResolvedValue({
      url: "",
      content: "",
      usedCustomExtractor: false,
      method: "fetch" as const,
    }),
    searchAll: vi.fn().mockResolvedValue([]),
  };
}

function makeExtractResult(overrides: Partial<ExtractResult> = {}): ExtractResult {
  return {
    url: "https://example.com/page",
    content: "Extracted page content text.",
    usedCustomExtractor: false,
    method: "fetch",
    ...overrides,
  };
}

describe("createAiSdkSummarizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Summarizer that calls streamText with the correct system prompt", async () => {
    aiMocks.streamText.mockReturnValue({
      text: Promise.resolve("Summarized content."),
      textStream: (async function* () {})(),
    });

    const model = { modelId: "test-model" } as unknown as import("ai").LanguageModel;
    const summarizer = createAiSdkSummarizer(model);

    const result = await summarizer({
      content: "Some long page content to summarize.",
    });

    expect(result).toBe("Summarized content.");
    expect(aiMocks.streamText).toHaveBeenCalledTimes(1);
    expect(aiMocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        system: expect.stringContaining("research assistant"),
        prompt: expect.stringContaining("Some long page content"),
      }),
    );
  });

  it("returns empty string for empty content", async () => {
    aiMocks.streamText.mockReturnValue({
      text: Promise.resolve("Should not be called"),
      textStream: (async function* () {})(),
    });

    const model = { modelId: "test-model" } as unknown as import("ai").LanguageModel;
    const summarizer = createAiSdkSummarizer(model);

    const result = await summarizer({ content: "" });

    expect(result).toBe("");
    expect(aiMocks.streamText).not.toHaveBeenCalled();
  });

  it("appends query to the prompt when provided", async () => {
    aiMocks.streamText.mockReturnValue({
      text: Promise.resolve("Focused summary."),
      textStream: (async function* () {})(),
    });

    const model = { modelId: "test-model" } as unknown as import("ai").LanguageModel;
    const summarizer = createAiSdkSummarizer(model);

    await summarizer({
      content: "Page content.",
      query: "price and availability",
    });

    expect(aiMocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Focus on information related to: price and availability"),
      }),
    );
  });

  it("passes abortSignal to streamText", async () => {
    aiMocks.streamText.mockReturnValue({
      text: Promise.resolve("Summary."),
      textStream: (async function* () {})(),
    });

    const model = { modelId: "test-model" } as unknown as import("ai").LanguageModel;
    const summarizer = createAiSdkSummarizer(model);
    const controller = new AbortController();

    await summarizer({
      content: "Page content.",
      signal: controller.signal,
    });

    expect(aiMocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
      }),
    );
  });
});

describe("createAiSdkSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted results from engine.search", async () => {
    const engine = makeMockEngine({
      search: vi.fn().mockResolvedValue([
        { title: "Result 1", url: "https://example.com/1", description: "First result" },
        { title: "Result 2", url: "https://example.com/2", description: "Second result" },
      ]),
    });

    const searchTool = createAiSdkSearchTool(engine, "brave", "Search with Brave");
    const result = await searchTool.execute?.({ query: "test" }, { toolCallId: "1", messages: [] });

    expect(result).toBe(
      "Result 1: https://example.com/1\nFirst result\n-\nResult 2: https://example.com/2\nSecond result",
    );
    expect(engine.search).toHaveBeenCalledWith("brave", "test", { signal: undefined });
  });

  it("returns 'No results found.' for empty results", async () => {
    const engine = makeMockEngine({
      search: vi.fn().mockResolvedValue([]),
    });

    const searchTool = createAiSdkSearchTool(engine, "exa", "Search with Exa");
    const result = await searchTool.execute?.({ query: "nothing" }, { toolCallId: "1", messages: [] });

    expect(result).toBe("No results found.");
  });

  it("propagates abortSignal to engine", async () => {
    const engine = makeMockEngine({
      search: vi.fn().mockResolvedValue([]),
    });

    const controller = new AbortController();
    const searchTool = createAiSdkSearchTool(engine, "brave", "Search");
    await searchTool.execute?.({ query: "test" }, { toolCallId: "1", messages: [], abortSignal: controller.signal });

    expect(engine.search).toHaveBeenCalledWith("brave", "test", { signal: controller.signal });
  });
});

describe("createAiSdkExtractPageContentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("URL validation", () => {
    it("returns 'Error: ...' for invalid URLs", async () => {
      const engine = makeMockEngine();
      const tool = createAiSdkExtractPageContentTool(engine);

      const result = await tool.execute?.({ url: "not-a-url" }, { toolCallId: "1", messages: [] });

      expect(result).toMatch(/^Error: /);
      expect(engine.extract).not.toHaveBeenCalled();
    });

    it("returns 'Error: ...' for non-https URLs", async () => {
      const engine = makeMockEngine();
      const tool = createAiSdkExtractPageContentTool(engine);

      const result = await tool.execute?.({ url: "http://example.com" }, { toolCallId: "1", messages: [] });

      expect(result).toMatch(/^Error: /);
    });
  });

  describe("no content fallback", () => {
    it("returns fallback message when no content or html", async () => {
      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({ content: "", html: null }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine);
      const result = await tool.execute?.({ url: "https://example.com" }, { toolCallId: "1", messages: [] });

      expect(result).toContain("No content could be extracted");
    });
  });

  describe("summarization defaults", () => {
    it("summarizes by default for generic extraction when summarizer exists", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("Summarized page content.");

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Full page content here.",
            usedCustomExtractor: false,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.({ url: "https://example.com" }, { toolCallId: "1", messages: [] });

      expect(result).toBe("Summarized page content.");
      expect(mockSummarizer).toHaveBeenCalledWith({
        content: "Full page content here.",
        query: undefined,
        signal: undefined,
      });
    });

    it("does NOT summarize by default for custom extractor results", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("Should not be called");

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Custom extracted content.",
            usedCustomExtractor: true,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.({ url: "https://example.com" }, { toolCallId: "1", messages: [] });

      expect(result).toBe("Custom extracted content.");
      expect(mockSummarizer).not.toHaveBeenCalled();
    });

    it("summarizes when query is provided (even for custom extractor)", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("Focused summary.");

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Custom extracted content.",
            usedCustomExtractor: true,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.({ url: "https://example.com", query: "pricing" }, { toolCallId: "1", messages: [] });

      expect(result).toBe("Focused summary.");
      expect(mockSummarizer).toHaveBeenCalledWith({
        content: "Custom extracted content.",
        query: "pricing",
        signal: undefined,
      });
    });

    it("summarizes when summarize: true is explicitly set", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("Explicit summary.");

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Some content.",
            usedCustomExtractor: true,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.({ url: "https://example.com", summarize: true }, { toolCallId: "1", messages: [] });

      expect(result).toBe("Explicit summary.");
      expect(mockSummarizer).toHaveBeenCalled();
    });

    it("returns full content when summarize: false", async () => {
      const mockSummarizer = vi.fn();

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Full page content.",
            usedCustomExtractor: false,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.({ url: "https://example.com", summarize: false }, { toolCallId: "1", messages: [] });

      expect(result).toBe("Full page content.");
      expect(mockSummarizer).not.toHaveBeenCalled();
    });
  });

  describe("return value", () => {
    it("returns summary when summarizer produces result", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("Summarized output.");

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Raw content.",
            usedCustomExtractor: false,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.(
        { url: "https://example.com" },
        { toolCallId: "1", messages: [] },
      );

      expect(result).toBe("Summarized output.");
    });

    it("returns content when no summarizer is configured", async () => {
      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Raw extracted content.",
            usedCustomExtractor: false,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine);

      const result = await tool.execute?.(
        { url: "https://example.com" },
        { toolCallId: "1", messages: [] },
      );

      expect(result).toBe("Raw extracted content.");
    });

    it("returns content when summarizer returns empty string", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("");

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Fallback content.",
            usedCustomExtractor: false,
          }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine, {
        summarizer: mockSummarizer as Summarizer,
      });

      const result = await tool.execute?.(
        { url: "https://example.com" },
        { toolCallId: "1", messages: [] },
      );

      expect(result).toBe("Fallback content.");
    });
  });

  describe("method mapping", () => {
    it('maps "webview" method to "render" for the engine', async () => {
      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({ content: "Rendered content." }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine);

      await tool.execute?.(
        { url: "https://example.com", method: "webview" },
        { toolCallId: "1", messages: [] },
      );

      expect(engine.extract).toHaveBeenCalledWith("https://example.com", {
        method: "render",
        summarize: false,
        signal: undefined,
      });
    });

    it("passes 'fetch' method directly to the engine", async () => {
      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({ content: "Fetched content." }),
        ),
      });

      const tool = createAiSdkExtractPageContentTool(engine);

      await tool.execute?.(
        { url: "https://example.com", method: "fetch" },
        { toolCallId: "1", messages: [] },
      );

      expect(engine.extract).toHaveBeenCalledWith("https://example.com", {
        method: "fetch",
        summarize: false,
        signal: undefined,
      });
    });
  });

  describe("abortSignal propagation", () => {
    it("passes abortSignal from ctx to engine.extract", async () => {
      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(makeExtractResult()),
      });

      const tool = createAiSdkExtractPageContentTool(engine);
      const controller = new AbortController();

      await tool.execute?.(
        { url: "https://example.com" },
        { toolCallId: "1", messages: [], abortSignal: controller.signal },
      );

      expect(engine.extract).toHaveBeenCalledWith("https://example.com", {
        summarize: false,
        signal: controller.signal,
      });
    });
  });

  describe("uses model to create summarizer when summarizer not provided", () => {
    it("creates a summarizer from model for summarization", async () => {
      aiMocks.streamText.mockReturnValue({
        text: Promise.resolve("Model-summarized content."),
        textStream: (async function* () {})(),
      });

      const engine = makeMockEngine({
        extract: vi.fn().mockResolvedValue(
          makeExtractResult({
            content: "Some content to summarize.",
            usedCustomExtractor: false,
          }),
        ),
      });

      const model = { modelId: "test-model" } as unknown as import("ai").LanguageModel;
      const tool = createAiSdkExtractPageContentTool(engine, { model });

      const result = await tool.execute?.(
        { url: "https://example.com" },
        { toolCallId: "1", messages: [] },
      );

      expect(result).toBe("Model-summarized content.");
      expect(aiMocks.streamText).toHaveBeenCalledTimes(1);
    });
  });
});
