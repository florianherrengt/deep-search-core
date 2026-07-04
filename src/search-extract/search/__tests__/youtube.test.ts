import { describe, expect, it, vi } from "vitest";
import { SearchProviderConfigError, SearchProviderError } from "../../core/errors.js";
import { createYouTubeSearch } from "../youtube.js";

function mockFetch(status: number, body: unknown, statusText?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

describe("createYouTubeSearch", () => {
  it("searches YouTube videos with the Google API key and maps results", async () => {
    const fetch = mockFetch(200, {
      items: [
        {
          id: { videoId: "abc123DEF45" },
          snippet: {
            title: "Video title",
            description: "Video description",
            channelTitle: "Channel name",
            publishedAt: "2026-01-02T03:04:05Z",
          },
        },
      ],
    });
    const search = createYouTubeSearch({ apiKey: " youtube-key ", fetch });

    const results = await search("deep search");

    expect(results).toEqual([
      {
        title: "Video title",
        url: "https://www.youtube.com/watch?v=abc123DEF45",
        description:
          "Video ID: abc123DEF45\nChannel: Channel name\nPublished: 2026-01-02T03:04:05Z\nVideo description",
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://www.googleapis.com/youtube/v3/search"),
      expect.objectContaining({
        headers: { accept: "application/json" },
      }),
    );
    const calledUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("part")).toBe("snippet");
    expect(calledUrl.searchParams.get("type")).toBe("video");
    expect(calledUrl.searchParams.get("q")).toBe("deep search");
    expect(calledUrl.searchParams.get("maxResults")).toBe("5");
    expect(calledUrl.searchParams.get("key")).toBe("youtube-key");
  });

  it("skips non-video items without a video ID", async () => {
    const fetch = mockFetch(200, {
      items: [
        {
          id: {},
          snippet: { title: "Channel", description: "not a video" },
        },
      ],
    });
    const search = createYouTubeSearch({ apiKey: "key", fetch });

    await expect(search("test")).resolves.toEqual([]);
  });

  it("throws SearchProviderConfigError for empty apiKey", async () => {
    const search = createYouTubeSearch({ apiKey: "" });

    await expect(search("test")).rejects.toThrow(SearchProviderConfigError);
  });

  it("throws SearchProviderError on HTTP error", async () => {
    const fetch = mockFetch(403, { error: "invalid key" }, "Forbidden");
    const search = createYouTubeSearch({ apiKey: "bad-key", fetch });

    await expect(search("test")).rejects.toThrow(SearchProviderError);
    await expect(search("test")).rejects.toThrow(/YouTube search failed/);
  });

  it("clamps maxResults to the YouTube API limit", async () => {
    const fetch = mockFetch(200, { items: [] });
    const search = createYouTubeSearch({ apiKey: "key", fetch, maxResults: 99 });

    await search("test");

    const calledUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("maxResults")).toBe("50");
  });
});
