import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createSearchExtractEngine,
  type SearchExtractEngine,
} from "../engine.js";
import {
  SearchProviderConfigError,
  SearchProviderError,
  SearchProviderResponseError,
  AggregateSearchError,
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
      youtube: { apiKey: "key-youtube" },
      hackerNews: {},
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

  it("dispatches to youtube provider and returns video results", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        items: [
          {
            id: { videoId: "abc123DEF45" },
            snippet: {
              title: "YouTube Result",
              description: "Video description",
              channelTitle: "Channel",
            },
          },
        ],
      }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("youtube", "test query");

    expect(results).toEqual([
      {
        title: "YouTube Result",
        url: "https://www.youtube.com/watch?v=abc123DEF45",
        description: "Video ID: abc123DEF45\nChannel: Channel\nVideo description",
      },
    ]);
  });

  it("dispatches to hackernews provider and returns HN story results", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        hits: [
          {
            objectID: "123",
            title: "HN Result",
            author: "alice",
            points: 10,
          },
        ],
      }),
    );

    const engine = createTestEngine(mockFetch);
    const results = await engine.search("hackernews", "test query");

    expect(results).toEqual([
      {
        title: "HN Result",
        url: "https://news.ycombinator.com/item?id=123",
        description: "HN item ID: 123\nAuthor: alice\nPoints: 10",
      },
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

describe("engine aggregate provider", () => {
  beforeEach(() => {
    resetRateLimiter();
    const fastQueue = new PQueue({ concurrency: 10 });
    setRateLimiter({ schedule: (fn) => fastQueue.add(fn) });
  });

  // Build a mock fetch that routes by hostname and returns one in-common
  // result ("https://shared.example") plus a per-engine unique result.
  function makeRoutingFetch() {
    return vi.fn().mockImplementation((url: string) => {
      let body: unknown;
      if (url.includes("brave.com")) {
        body = {
          web: {
            results: [
              { title: "Shared Long Title", url: "https://shared.example/x", description: "Brave desc" },
              { title: "Brave Unique", url: "https://brave.unique.example", description: "Only Brave" },
            ],
          },
        };
      } else if (url.includes("exa.ai")) {
        body = {
          results: [
            { title: "Sh", url: "https://shared.example/x", text: "Exa desc" },
            { title: "Exa Unique", url: "https://exa.unique.example", text: "Only Exa" },
          ],
        };
      } else if (url.includes("serper.dev")) {
        body = {
          organic: [{ title: "Serper Unique", link: "https://serper.unique.example", snippet: "Only Serper" }],
        };
      } else if (url.includes("tavily.com")) {
        body = {
          results: [{ title: "Tavily Unique", url: "https://tavily.unique.example", content: "Only Tavily" }],
        };
      } else {
        body = {
          results: [{ title: "SearXNG Unique", url: "https://searxng.unique.example", content: "Only SearXNG" }],
        };
      }
      return Promise.resolve(makeResponse(200, body));
    });
  }

  it("merges results from all configured providers, ranking shared URLs first", async () => {
    const mockFetch = makeRoutingFetch();
    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    const results = await engine.search("aggregate", "test query");

    // The shared URL appeared in 2 of 5 engines and should be ranked first.
    expect(results[0]).toMatchObject({
      url: "https://shared.example/x",
      title: "Shared Long Title",
    });
    // 1 shared URL + 5 unique per-engine URLs = 6 total after dedup.
    expect(results).toHaveLength(6);
    const urls = results.map((r) => r.url);
    expect(urls).toContain("https://brave.unique.example");
    expect(urls).toContain("https://exa.unique.example");
    expect(urls).toContain("https://serper.unique.example");
    expect(urls).toContain("https://tavily.unique.example");
    expect(urls).toContain("https://searxng.unique.example");
  });

  it("calls every configured provider in parallel", async () => {
    const mockFetch = makeRoutingFetch();
    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    await engine.search("aggregate", "test query");

    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("skips unconfigured providers when aggregating", async () => {
    const engine = createSearchExtractEngine({
      fetch: makeRoutingFetch() as unknown as typeof globalThis.fetch,
      searchProviders: {
        brave: { apiKey: "key-brave" },
        exa: { apiKey: "key-exa" },
      },
    });

    const results = await engine.search("aggregate", "test query");

    // Only brave + exa contribute: shared URL + 2 unique URLs.
    expect(results).toHaveLength(3);
    const urls = results.map((r) => r.url);
    expect(urls).toContain("https://shared.example/x");
    expect(urls).toContain("https://brave.unique.example");
    expect(urls).toContain("https://exa.unique.example");
  });

  it("throws SearchProviderConfigError when no providers are configured", async () => {
    const engine = createSearchExtractEngine({
      fetch: globalThis.fetch,
    });

    await expect(engine.search("aggregate", "q")).rejects.toThrow(
      SearchProviderConfigError,
    );
  });

  it("throws AggregateSearchError when all underlying providers fail", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(500, { error: "boom" }),
    );
    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    await expect(engine.search("aggregate", "q")).rejects.toThrow(
      AggregateSearchError,
    );
  });

  it("returns partial merged results when some providers fail", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      // Brave succeeds; everything else 500s.
      if (url.includes("brave.com")) {
        return Promise.resolve(
          makeResponse(200, {
            web: {
              results: [
                { title: "OK", url: "https://ok.example", description: "d" },
              ],
            },
          }),
        );
      }
      return Promise.resolve(makeResponse(500, { error: "boom" }));
    });

    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    const results = await engine.search("aggregate", "q");

    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://ok.example");
  });

  it("returns provider diagnostics with partial aggregate results", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("brave.com")) {
        return Promise.resolve(
          makeResponse(200, {
            web: {
              results: [
                { title: "OK", url: "https://ok.example", description: "d" },
              ],
            },
          }),
        );
      }
      return Promise.resolve(makeResponse(500, { error: "boom" }));
    });
    const engine = createSearchExtractEngine({
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      searchProviders: {
        brave: { apiKey: "key-brave" },
        tavily: { apiKey: "key-tavily" },
      },
    });

    const aggregate = await engine.searchAggregate("q");

    expect(aggregate.results).toHaveLength(1);
    expect(aggregate.diagnostics).toEqual([
      { provider: "brave", status: "fulfilled", resultCount: 1 },
      expect.objectContaining({ provider: "tavily", status: "rejected" }),
    ]);
  });

  it("propagates AbortSignal to underlying provider calls", async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation(
      (_input: string, init?: RequestInit) =>
        new Promise<MockResponse>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    const p = engine.search("aggregate", "q", { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);

    await expect(p).rejects.toThrow("abort");
  });
});

describe("engine aggregate with default (concurrency-1) rate limiter", () => {
  // IMPORTANT: this block deliberately does NOT replace the default rate
  // limiter. The default limiter is a single-slot queue (concurrency 1,
  // 1 request/second), which is the production configuration. A previous
  // version wrapped the aggregate orchestration in the outer rate limiter
  // *and* rate-limited each underlying provider call inside it, producing a
  // re-entrant deadlock that hung forever. These tests guard against that
  // regression by asserting completion rather than hanging.
  //
  // The deadlock reproduces with even a single configured provider (the outer
  // call holds the only slot while the inner per-provider call waits for it),
  // so we configure just one to keep the test fast while still catching the
  // regression under the real serial limiter.
  function singleProviderEngine(fetch: typeof globalThis.fetch) {
    return createSearchExtractEngine({
      fetch,
      searchProviders: { brave: { apiKey: "k" } },
    });
  }

  beforeEach(() => {
    resetRateLimiter();
  });

  it("completes (does not deadlock) when aggregating under the default rate limiter", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        web: {
          results: [
            { title: "R", url: "https://b.example", description: "d" },
          ],
        },
      }),
    );

    const engine = singleProviderEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    // Race against a hard timeout. Under the deadlock the aggregate never
    // resolves; with the fix it completes after the single serialized call.
    const results = await Promise.race([
      engine.search("aggregate", "q"),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("DEADLOCK: aggregate never resolved")),
          5000,
        ),
      ),
    ]);

    expect(Array.isArray(results)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  }, 8000);

  it("keeps the queue usable after an aggregate call", async () => {
    // Under the deadlock, even a subsequent single-provider call would queue
    // behind the stuck aggregate and never run. Verify the queue stays usable.
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        web: {
          results: [
            { title: "R", url: "https://b.example", description: "d" },
          ],
        },
      }),
    );

    const engine = singleProviderEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );

    await engine.search("aggregate", "q");
    await engine.search("brave", "q");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 8000);
});

describe("engine searchAll excludes aggregate by default", () => {
  beforeEach(() => {
    resetRateLimiter();
    const fastQueue = new PQueue({ concurrency: 10 });
    setRateLimiter({ schedule: (fn) => fastQueue.add(fn) });
  });

  it("does not invoke aggregate when no providers are specified", async () => {
    // If "aggregate" were in the default set, every call would fan out to all
    // providers, multiplying fetch counts. We assert a single fan-out only.
    const callCount = { count: 0 };
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      callCount.count++;
      let body: unknown;
      if (url.includes("brave.com")) {
        body = { web: { results: [{ title: "B", url: "https://b.example", description: "d" }] } };
      } else if (url.includes("exa.ai")) {
        body = { results: [{ title: "E", url: "https://e.example", text: "t" }] };
      } else if (url.includes("serper.dev")) {
        body = { organic: [{ title: "S", link: "https://s.example", snippet: "sn" }] };
      } else if (url.includes("tavily.com")) {
        body = { results: [{ title: "T", url: "https://t.example", content: "c" }] };
      } else {
        body = { results: [{ title: "X", url: "https://x.example", content: "c" }] };
      }
      return Promise.resolve(makeResponse(200, body));
    });

    const engine = createTestEngine(
      mockFetch as unknown as typeof globalThis.fetch,
    );
    await engine.searchAll("test query");

    // Exactly 5 calls (one per real provider), NOT 5 + 5 from an aggregate
    // fan-out.
    expect(callCount.count).toBe(5);
  });
});
