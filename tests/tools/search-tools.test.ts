import { describe, expect, it } from "vitest";
import {
  createSearchTools,
  getConfiguredSearchProviderIds,
  hasSearchProviders,
  normalizeSearchKeys,
} from "../../src/research-orchestrator";

describe("search tool configuration", () => {
  it("normalizes the Hacker News opt-in flag", () => {
    expect(normalizeSearchKeys({ hackerNews: true })).toMatchObject({
      hackerNews: true,
    });
    expect(normalizeSearchKeys({ hackerNews: false })).toMatchObject({
      hackerNews: false,
    });
  });

  it("reports Hacker News as configured when opted in", () => {
    expect(hasSearchProviders({ hackerNews: true })).toBe(true);
    expect(getConfiguredSearchProviderIds({ hackerNews: true })).toContain(
      "hackernews",
    );
  });

  it("registers hacker_news_search only when opted in", () => {
    expect(createSearchTools(undefined, globalThis.fetch)).not.toHaveProperty(
      "hacker_news_search",
    );
    expect(createSearchTools({ hackerNews: true }, globalThis.fetch)).toHaveProperty(
      "hacker_news_search",
    );
  });
});
