import { describe, expect, it, vi } from "vitest";
import {
  formatYouTubeTranscript,
  isYouTubeVideoUrl,
  YouTubeExtractor,
} from "../youtube.js";
import { extractPage } from "../../extract-page.js";
import type { ExtractorInput } from "../base.js";
import type { YouTubeSubtitlesResult } from "../../../youtube-subtitles.js";

function makeResponse(status: number, body: unknown, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function playerHtml(captionTracks: unknown[]) {
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks,
      },
    },
  })};</script></html>`;
}

function makeFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce(
      makeResponse(
        200,
        playerHtml([
          {
            baseUrl: "https://www.youtube.com/api/timedtext?v=abc123DEF45&lang=en",
            languageCode: "en",
            name: { simpleText: "English" },
            isTranslatable: true,
          },
        ]),
      ),
    )
    .mockResolvedValueOnce(
      makeResponse(200, {
        events: [
          {
            tStartMs: 0,
            dDurationMs: 1200,
            segs: [{ utf8: "Hello" }, { utf8: " world" }],
          },
          {
            tStartMs: 65_000,
            dDurationMs: 900,
            segs: [{ utf8: "Next line" }],
          },
        ],
      }),
    ) as unknown as typeof globalThis.fetch;
}

describe("YouTubeExtractor", () => {
  it("matches YouTube video URLs only", () => {
    expect(isYouTubeVideoUrl(new URL("https://www.youtube.com/watch?v=abc123DEF45"))).toBe(true);
    expect(isYouTubeVideoUrl(new URL("https://youtu.be/abc123DEF45"))).toBe(true);
    expect(isYouTubeVideoUrl(new URL("https://www.youtube.com/shorts/abc123DEF45"))).toBe(true);
    expect(isYouTubeVideoUrl(new URL("https://www.youtube.com/@openai"))).toBe(false);
    expect(isYouTubeVideoUrl(new URL("https://example.com/watch?v=abc123DEF45"))).toBe(false);
  });

  it("extracts public caption tracks into transcript content", async () => {
    const fetch = makeFetch();
    const extractor = new YouTubeExtractor();
    const input: ExtractorInput = {
      url: new URL("https://www.youtube.com/watch?v=abc123DEF45"),
      loader: {},
      fetch,
    };

    const result = await extractor.extract(input);

    expect(result).not.toBeNull();
    expect(result!.content).toContain("# YouTube Transcript");
    expect(result!.content).toContain("Video ID: abc123DEF45");
    expect(result!.content).toContain("Language: English (en)");
    expect(result!.content).toContain("Caption type: manual");
    expect(result!.content).toContain("[00:00] Hello world");
    expect(result!.content).toContain("[01:05] Next line");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("runs as a custom extractor through extractPage", async () => {
    const fetch = makeFetch();
    const renderHtml = vi.fn();

    const result = await extractPage(
      "https://www.youtube.com/watch?v=abc123DEF45",
      { method: "auto" },
      {
        fetch,
        pageLoader: { renderHtml },
        extractors: [new YouTubeExtractor()],
      },
    );

    expect(result.usedCustomExtractor).toBe(true);
    expect(result.extractorName).toBe("YouTubeExtractor");
    expect(result.method).toBe("custom");
    expect(result.content).toContain("[00:00] Hello world");
    expect(renderHtml).not.toHaveBeenCalled();
  });

  it("does not fall through to generic rendering when subtitles fail", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(
          200,
          playerHtml([
            {
              baseUrl: "https://www.youtube.com/api/timedtext?v=abc123DEF45&lang=en",
              languageCode: "en",
              name: { simpleText: "English" },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(makeResponse(200, "")) as unknown as typeof globalThis.fetch;
    const renderHtml = vi.fn();

    const result = await extractPage(
      "https://www.youtube.com/watch?v=abc123DEF45",
      { method: "auto" },
      {
        fetch,
        pageLoader: { renderHtml },
        extractors: [new YouTubeExtractor()],
      },
    );

    expect(result.usedCustomExtractor).toBe(true);
    expect(result.extractorName).toBe("YouTubeExtractor");
    expect(result.method).toBe("custom");
    expect(result.content).toContain("# YouTube Transcript Unavailable");
    expect(result.content).toContain("YouTube returned an empty subtitle response");
    expect(result.warnings?.[0]).toContain("YouTube transcript unavailable");
    expect(renderHtml).not.toHaveBeenCalled();
  });

  it("falls back to configured subtitle downloader when public captions fail", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(
          200,
          playerHtml([
            {
              baseUrl: "https://www.youtube.com/api/timedtext?v=abc123DEF45&lang=en",
              languageCode: "en",
              name: { simpleText: "English" },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(makeResponse(200, "")) as unknown as typeof globalThis.fetch;
    const subtitleDownloader = vi.fn().mockResolvedValue({
      videoId: "abc123DEF45",
      languageCode: "en",
      languageName: "English",
      isAutoGenerated: true,
      isTranslatable: false,
      availableTracks: [
        {
          languageCode: "en",
          languageName: "English",
          isAutoGenerated: true,
          isTranslatable: false,
        },
      ],
      cues: [
        { startMs: 0, durationMs: 1000, text: "Downloaded subtitle line" },
      ],
      text: "Downloaded subtitle line",
    });

    const result = await extractPage(
      "https://www.youtube.com/watch?v=abc123DEF45",
      { method: "auto" },
      {
        fetch,
        pageLoader: { renderHtml: vi.fn() },
        extractors: [new YouTubeExtractor({ subtitleDownloader })],
      },
    );

    expect(result.usedCustomExtractor).toBe(true);
    expect(result.content).toContain("# YouTube Transcript");
    expect(result.content).toContain("Caption type: auto-generated");
    expect(result.content).toContain("[00:00] Downloaded subtitle line");
    expect(result.warnings).toContain("Used configured yt-dlp subtitle fallback.");
    expect(subtitleDownloader).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=abc123DEF45",
      videoId: "abc123DEF45",
      reason: expect.stringContaining("empty subtitle response"),
      signal: undefined,
    });
  });

  it("returns unavailable content when subtitle fallback also fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(200, playerHtml([]))) as unknown as typeof globalThis.fetch;
    const subtitleDownloader = vi.fn().mockRejectedValue(new Error("yt-dlp failed"));

    const result = await extractPage(
      "https://www.youtube.com/watch?v=abc123DEF45",
      { method: "auto" },
      {
        fetch,
        pageLoader: { renderHtml: vi.fn() },
        extractors: [new YouTubeExtractor({ subtitleDownloader })],
      },
    );

    expect(result.usedCustomExtractor).toBe(true);
    expect(result.content).toContain("# YouTube Transcript Unavailable");
    expect(result.content).toContain("yt-dlp subtitle fallback failed: yt-dlp failed");
  });
});

describe("formatYouTubeTranscript", () => {
  it("formats transcript metadata and long timestamps", () => {
    const result: YouTubeSubtitlesResult = {
      videoId: "abc123DEF45",
      languageCode: "en",
      languageName: "English",
      isAutoGenerated: true,
      isTranslatable: false,
      availableTracks: [
        {
          languageCode: "en",
          languageName: "English",
          isAutoGenerated: true,
          isTranslatable: false,
        },
      ],
      cues: [
        { startMs: 3_661_000, durationMs: 1000, text: "Past an hour" },
      ],
      text: "Past an hour",
    };

    const formatted = formatYouTubeTranscript(
      result,
      "https://www.youtube.com/watch?v=abc123DEF45",
    );

    expect(formatted).toContain("Caption type: auto-generated");
    expect(formatted).toContain("Available tracks: English (en, auto-generated)");
    expect(formatted).toContain("[1:01:01] Past an hour");
  });
});
