import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createSearchExtractEngine,
  type SearchExtractEngine,
} from "../engine.js";
import {
  SearchProviderConfigError,
  SearchProviderError,
  SearchProviderResponseError,
} from "../errors.js";
import { setRateLimiter, resetRateLimiter } from "../rate-limit.js";
import PQueue from "p-queue";

interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

function makeResponse(
  status: number,
  body: unknown,
  statusText?: string,
): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body),
  };
}

function createTestEngine(
  fetch: (input: string, init?: RequestInit) => Promise<MockResponse>,
): SearchExtractEngine {
  return createSearchExtractEngine({
    fetch: fetch as typeof globalThis.fetch,
    searchProviders: {
      brave: { apiKey: "key-brave" },
      exa: { apiKey: "key-exa" },
      serper: { apiKey: "key-serper" },
      tavily: { apiKey: "key-tavily" },
      searxng: { baseUrl: "http://localhost:8080" },
    },
  });
}

describe("engine search dispatch", () => {
  beforeEach(() => {
    resetRateLimiter();
    // Use a fast rate limiter for tests so rate limiting doesn't impact timing
    const fastQueue = new PQueue({ concurrency: 10 });
    setRateLimiter({ schedule: (fn) => fastQueue.add(fn) });
  });

  it("dispatches to brave provider and returns structured results", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        web: {
          results: [
            {
              title: "Brave Result",
              url: "https://brave.example",
              description: "A brave result",
            },
          ],
        },
      }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("brave", "test query");

    expect(results).toEqual([
      {
        title: "Brave Result",
        url: "https://brave.example",
        description: "A brave result",
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("dispatches to exa provider and returns structured results", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        results: [{ title: "Exa Result", url: "https://exa.example", text: "Exa text" }],
      }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("exa", "test query");

    expect(results).toEqual([
      { title: "Exa Result", url: "https://exa.example", description: "Exa text" },
    ]);
  });

  it("dispatches to serper provider and returns structured results", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        organic: [{ title: "Serper Result", link: "https://serper.example", snippet: "Serper snippet" }],
      }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("serper", "test query");

    expect(results).toEqual([
      { title: "Serper Result", url: "https://serper.example", description: "Serper snippet" },
    ]);
  });

  it("dispatches to tavily provider and returns structured results", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        results: [{ title: "Tavily Result", url: "https://tavily.example", content: "Tavily content" }],
      }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("tavily", "test query");

    expect(results).toEqual([
      { title: "Tavily Result", url: "https://tavily.example", description: "Tavily content" },
    ]);
  });

  it("returns empty array when no results in response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { web: {} }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("brave", "test query");

    expect(results).toEqual([]);
  });

  it("throws SearchProviderError on non-ok HTTP response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(429, { error: "rate limited" }, "Too Many Requests"),
    );

    const engine = createTestEngine(mockFetch);

    await expect(engine.search("brave", "test query")).rejects.toThrow(
      SearchProviderError,
    );
    await expect(engine.search("brave", "test query")).rejects.toThrow(
      /Brave search failed/,
    );
  });

  it("throws SearchProviderError with body on 403", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(403, { error: "Invalid API key" }, "Forbidden"),
    );

    const engine = createTestEngine(mockFetch);

    await expect(engine.search("brave", "test query")).rejects.toThrow(
      SearchProviderError,
    );
  });

  it("throws SearchProviderResponseError on invalid response shape", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { unexpected: "shape" }),
    );

    const engine = createTestEngine(mockFetch);

    // Exa requires `results` array in response, so missing it triggers parse error
    await expect(engine.search("exa", "test query")).rejects.toThrow(
      SearchProviderResponseError,
    );
  });
});

describe("engine searchAll", () => {
  beforeEach(() => {
    resetRateLimiter();
    // Use a fast rate limiter for tests
    const fastQueue = new PQueue({ concurrency: 10 });
    setRateLimiter({ schedule: (fn) => fastQueue.add(fn) });
  });

  it("aggregates results from all enabled providers", async () => {
    const callCount = { count: 0 };
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      callCount.count++;
      let body: unknown;
      if (url.includes("brave.com")) {
        body = { web: { results: [{ title: `B${callCount.count}`, url: "https://b.example", description: "Brave desc" }] } };
      } else if (url.includes("exa.ai")) {
        body = { results: [{ title: `E${callCount.count}`, url: "https://e.example", text: "Exa text" }] };
      } else if (url.includes("serper.dev")) {
        body = { organic: [{ title: `S${callCount.count}`, link: "https://s.example", snippet: "Serper snippet" }] };
      } else if (url.includes("tavily.com")) {
        body = { results: [{ title: `T${callCount.count}`, url: "https://t.example", content: "Tavily content" }] };
      } else {
        body = { results: [{ title: `X${callCount.count}`, url: "https://x.example", content: "SearXNG content" }] };
      }
      return Promise.resolve(makeResponse(200, body));
    });

    const engine = createTestEngine(mockFetch as unknown as typeof globalThis.fetch);
    const results = await engine.searchAll("test query");

    expect(results.length).toBe(5);
    expect(mockFetch.mock.calls.length).toBe(5);
  });

  it("filters to requested providers", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        web: {
          results: [{ title: "R", url: "https://r.example", description: "D" }],
        },
      }),
    );

    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );
    const results = await engine.searchAll("test query", {
      providers: ["brave"],
    });

    expect(results.length).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("engine disabled/unconfigured providers", () => {
  beforeEach(() => {
    resetRateLimiter();
    const fastQueue = new PQueue({ concurrency: 10 });
    setRateLimiter({ schedule: (fn) => fastQueue.add(fn) });
  });

  it("throws SearchProviderConfigError for missing provider", async () => {
    const engine = createSearchExtractEngine({
      fetch: globalThis.fetch,
    });

    await expect(engine.search("brave", "test query")).rejects.toThrow(
      SearchProviderConfigError,
    );
  });

  it("throws SearchProviderConfigError for empty apiKey", async () => {
    const engine = createSearchExtractEngine({
      fetch: globalThis.fetch,
      searchProviders: { brave: { apiKey: "" } },
    });

    await expect(engine.search("brave", "test query")).rejects.toThrow(
      SearchProviderConfigError,
    );
  });

  it("searchAll skips unconfigured providers", async () => {
    const engine = createSearchExtractEngine({
      fetch: globalThis.fetch,
    });

    // searchAll with no configured providers should return []
    const results = await engine.searchAll("test query");
    expect(results).toEqual([]);
  });
});

describe("abort propagation", () => {
  beforeEach(() => {
    resetRateLimiter();
    const fastQueue = new PQueue({ concurrency: 10 });
    setRateLimiter({ schedule: (fn) => fastQueue.add(fn) });
  });

  it("aborts inflight search via AbortSignal", async () => {
    const controller = new AbortController();

    const mockFetch = vi.fn().mockImplementation(
      (_input: string, init?: RequestInit) => {
        return new Promise<MockResponse>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      },
    );

    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    const searchPromise = engine.search("brave", "test query", {
      signal: controller.signal,
    });

    // Abort after a tick
    setTimeout(() => controller.abort(), 10);

    await expect(searchPromise).rejects.toThrow("abort");
  });
});
