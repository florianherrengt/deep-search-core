import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedditExtractor, isRedditChallengeHtml, parseOldRedditHtml } from "../reddit";
import type { ExtractorInput } from "../base";

const OLD_REDDIT_HTML = `
<html>
<body>
<div class="content">
  <div class="thing link" data-author="tester" data-score="10">
    <p class="title"><a class="title">Test Post</a></p>
    <div class="tagline"><a class="author">tester</a></div>
    <div class="expando"><div class="usertext-body">Body text</div></div>
  </div>
  <div class="commentarea">
    <div class="sitetable nestedlisting">
      <div class="thing comment" data-author="commenter1" data-score="3">
        <div class="entry">
          <div class="tagline"><a class="author">commenter1</a></div>
          <div class="usertext-body">Hello</div>
          <span class="score unvoted">3 points</span>
        </div>
        <div class="child">
          <div class="sitetable">
            <div class="thing comment" data-author="reply1" data-score="2">
              <div class="entry">
                <div class="tagline"><a class="author">reply1</a></div>
                <div class="usertext-body">Nested reply</div>
                <span class="score unvoted">2 points</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="thing comment" data-author="commenter2" data-score="1">
        <div class="entry">
          <div class="tagline"><a class="author">commenter2</a></div>
          <div class="usertext-body">World</div>
          <span class="score unvoted">1 point</span>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>
`;

function makeInput(renderHtml: (url: string) => Promise<string | null>): ExtractorInput {
  return {
    url: new URL("https://www.reddit.com/r/test/comments/abc/test_post/"),
    loader: {
      renderHtml,
    },
  };
}

describe("RedditExtractor", () => {
  let extractor: RedditExtractor;

  beforeEach(() => {
    extractor = new RedditExtractor();
  });

  describe("canHandle", () => {
    it("matches reddit.com URLs", () => {
      expect(extractor.canHandle(new URL("https://www.reddit.com/r/test/comments/abc/"))).toBe(true);
    });

    it("matches old.reddit.com URLs", () => {
      expect(extractor.canHandle(new URL("https://old.reddit.com/r/test/comments/abc/"))).toBe(true);
    });

    it("does not match non-reddit URLs", () => {
      expect(extractor.canHandle(new URL("https://example.com"))).toBe(false);
    });
  });

  describe("extract", () => {
    it("opens old.reddit.com via renderHtml and returns markdown", async () => {
      const renderHtml = vi.fn().mockResolvedValue(OLD_REDDIT_HTML);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("# Test Post");
      expect(result!.content).toContain("## Comments");
      expect(result!.content).toContain("├── **commenter1** · 3 pts: Hello");
      expect(result!.content).toContain("│   └── **reply1** · 2 pts: Nested reply");
      expect(result!.content).toContain("└── **commenter2** · 1 pt: World");
      expect(renderHtml).toHaveBeenCalledWith(
        "https://old.reddit.com/r/test/comments/abc/test_post/",
        {},
      );
    });

    it("returns null when renderHtml returns null", async () => {
      const renderHtml = vi.fn().mockResolvedValue(null);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).toBeNull();
    });

    it("returns null when parsing fails (challenge page)", async () => {
      const renderHtml = vi.fn().mockResolvedValue("<html><body>challenge page</body></html>");
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).toBeNull();
    });

    it("returns null for .json URLs", async () => {
      const renderHtml = vi.fn();
      const input: ExtractorInput = {
        url: new URL("https://www.reddit.com/r/test/comments/abc/test_post.json"),
        loader: { renderHtml },
      };

      const result = await extractor.extract(input);

      expect(result).toBeNull();
      expect(renderHtml).not.toHaveBeenCalled();
    });

    it("returns null when renderHtml is not available", async () => {
      const input: ExtractorInput = { url: new URL("https://www.reddit.com/r/test/comments/abc/test_post/"), loader: {} };

      const result = await extractor.extract(input);

      expect(result).toBeNull();
    });

    it("extracts posts with 'json' in the post slug", async () => {
      const renderHtml = vi.fn().mockResolvedValue(OLD_REDDIT_HTML);
      const input: ExtractorInput = {
        url: new URL("https://www.reddit.com/r/programming/comments/abc/working-with-json-data/"),
        loader: { renderHtml },
      };

      const result = await extractor.extract(input);

      expect(renderHtml).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.content).toContain("# Test Post");
    });

    it("includes post selftext in output", async () => {
      const renderHtml = vi.fn().mockResolvedValue(OLD_REDDIT_HTML);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("Body text");
    });

    it("parses old reddit post title from fallback selectors", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html>
          <head><meta property="og:title" content="Fallback Title" /></head>
          <body>
            <div class="commentarea">
              <div class="sitetable nestedlisting">
                <div class="thing comment" data-author="commenter" data-score="4">
                  <div class="entry"><div class="usertext-body"><div class="md">Fallback comment</div></div></div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("# Fallback Title");
      expect(result!.content).toContain("└── **commenter** · 4 pts: Fallback comment");
    });
  });

  describe("parseOldRedditHtml", () => {
    it("parses old reddit HTML into markdown", () => {
      const result = parseOldRedditHtml(OLD_REDDIT_HTML);
      expect(result).toContain("# Test Post");
      expect(result).toContain("├── **commenter1** · 3 pts: Hello");
    });

    it("returns null for HTML without post content", () => {
      expect(parseOldRedditHtml("<html><body>No post here</body></html>")).toBeNull();
    });
  });

  describe("isRedditChallengeHtml", () => {
    it("returns false for parseable old reddit HTML", () => {
      expect(isRedditChallengeHtml(OLD_REDDIT_HTML)).toBe(false);
    });

    it("detects 'verify you are human' text", () => {
      expect(isRedditChallengeHtml("<html><body>verify you are human</body></html>")).toBe(true);
    });

    it("detects #challenge-form element", () => {
      expect(isRedditChallengeHtml("<html><body><div id=\"challenge-form\">...</div></body></html>")).toBe(true);
    });

    it("detects .g-recaptcha element", () => {
      expect(isRedditChallengeHtml("<html><body><div class=\"g-recaptcha\"></div></body></html>")).toBe(true);
    });

    it("detects recaptcha iframe", () => {
      expect(isRedditChallengeHtml("<html><body><iframe src=\"https://www.google.com/recaptcha/api2/anchor\"></iframe></body></html>")).toBe(true);
    });

    it("does not retry parseable old reddit HTML even with captcha markup", () => {
      expect(isRedditChallengeHtml(`${OLD_REDDIT_HTML}<script>var captcha = true;</script>`)).toBe(false);
    });

    it("detects 'captcha challenge' text", () => {
      expect(isRedditChallengeHtml("<html><body>captcha challenge</body></html>")).toBe(true);
    });

    it("detects 'captcha required' text", () => {
      expect(isRedditChallengeHtml("<html><body>captcha required</body></html>")).toBe(true);
    });

    it("detects 'checking if the site connection is secure' text", () => {
      expect(isRedditChallengeHtml("<html><body>checking if the site connection is secure</body></html>")).toBe(true);
    });

    it("detects 'checking your browser' text", () => {
      expect(isRedditChallengeHtml("<html><body>checking your browser</body></html>")).toBe(true);
    });

    it("detects 'are you a robot' text", () => {
      expect(isRedditChallengeHtml("<html><body>are you a robot</body></html>")).toBe(true);
    });

    it("detects 'security check' text", () => {
      expect(isRedditChallengeHtml("<html><body>security check</body></html>")).toBe(true);
    });

    it("detects .cf-challenge element", () => {
      expect(isRedditChallengeHtml("<html><body><div class=\"cf-challenge-running\"></div></body></html>")).toBe(true);
    });
  });
});
