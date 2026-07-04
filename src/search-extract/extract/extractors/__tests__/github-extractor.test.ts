import { describe, it, expect, vi } from "vitest";
import {
  GithubExtractor,
  isGithubRepoOverviewUrl,
  isGithubNotFoundHtml,
  parseGithubRepoHtml,
} from "../github";
import type { ExtractorInput } from "../base";

const REPO_HTML = `
<html>
<head>
  <title>GitHub - facebook/react: The library for web and native user interfaces.</title>
  <meta property="og:title" content="facebook/react">
  <meta property="og:description" content="The library for web and native user interfaces.">
  <meta name="description" content="The library for web and native user interfaces.">
</head>
<body>
  <h1><strong><a data-view-component="true" href="/facebook/react">react</a></strong></h1>

  <div id="repo-stars-counter-star">228k</div>
  <div id="repo-network-counter">47.3k</div>
  <div id="repo-notifications-counter">6.1k</div>

  <div class="BorderGrid">
    <div class="BorderGrid-row">
      <a class="topic-tag" href="/topics/javascript">javascript</a>
      <a class="topic-tag" href="/topics/react">react</a>
      <a class="topic-tag" href="/topics/ui">ui</a>
    </div>
    <div class="BorderGrid-row">
      <a href="https://react.dev">react.dev</a>
    </div>
    <div class="BorderGrid-row">
      <a href="/facebook/react/blob/main/LICENSE">MIT license</a>
    </div>

    <div class="BorderGrid-row">
      <div>
        <h2>Languages</h2>
        <ul>
          <li>
            <span class="color-fg-default text-bold">JavaScript</span>
            <span>92.3%</span>
          </li>
          <li>
            <span class="color-fg-default text-bold">HTML</span>
            <span>4.2%</span>
          </li>
          <li>
            <span class="color-fg-default text-bold">TypeScript</span>
            <span>3.5%</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="BorderGrid-row">
      <div>
        <h2>Contributors</h2>
        <a href="/facebook/react/graphs/contributors">
          <img alt="gaearon" src="https://avatars.githubusercontent.com/u/810438?u=1">
          <img alt="sebmarkbage" src="https://avatars.githubusercontent.com/u/6122?u=1">
          <span>1,692 contributors</span>
        </a>
      </div>
    </div>
  </div>

  <div class="Box-header">
    <a href="/facebook/react/commits/main">
      <svg></svg><strong>1,234</strong> commits
    </a>
    <a href="/facebook/react/commit/abc123">Fix hooks</a>
    <relative-time datetime="2026-05-14T10:00:00Z">last month</relative-time>
  </div>

  <article class="markdown-body">
    <h1>React</h1>
    <p>React is a JavaScript library for building user interfaces. <strong>Declarative</strong> and <em>component-based</em>.</p>
    <h2>Installation</h2>
    <pre><code class="language-bash">npm install react react-dom</code></pre>
    <h2>Features</h2>
    <ul>
      <li>Components</li>
      <li>Virtual DOM</li>
    </ul>
    <blockquote>React makes it painless to create interactive UIs.</blockquote>
    <p>See the <a href="https://react.dev/docs">docs</a> for more.</p>
    <table>
      <tr><th>Package</th><th>Version</th></tr>
      <tr><td>react</td><td>19.0.0</td></tr>
    </table>
  </article>
</body>
</html>
`;

const NOT_FOUND_HTML = `
<html><head><title>Page not found · GitHub</title></head>
<body>This is not the web page you are looking for.</body></html>
`;

function makeInput(html: string | null): ExtractorInput {
  return {
    url: new URL("https://github.com/facebook/react"),
    loader: {
      renderHtml: vi.fn(async () => html),
    },
  };
}

describe("GithubExtractor.canHandle / isGithubRepoOverviewUrl", () => {
  const ext = new GithubExtractor();

  it("accepts repo overview URLs", () => {
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react"))).toBe(true);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react/"))).toBe(true);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react#readme"))).toBe(true);
  });

  it("rejects non-overview or reserved paths", () => {
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react/issues"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react/pull/1"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react/blob/main/x.ts"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/facebook/react/tree/main/src"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/settings/profile"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/topics/react"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://gist.github.com/u/1"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://api.github.com/repos/facebook/react"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://example.com/facebook/react"))).toBe(false);
  });

  it("rejects user profile paths (/users/<name>) that mimic owner/repo shape", () => {
    // /users/<name> has exactly two path segments, so without reserving
    // "users" the extractor would claim a profile page and, when it has a
    // README, misparse it as a repository.
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/users/torvalds"))).toBe(false);
    expect(isGithubRepoOverviewUrl(new URL("https://github.com/users/octocat"))).toBe(false);
    expect(ext.canHandle(new URL("https://github.com/users/torvalds"))).toBe(false);
  });

  it("canHandle matches extractor", () => {
    expect(ext.canHandle(new URL("https://github.com/facebook/react"))).toBe(true);
    expect(ext.canHandle(new URL("https://github.com/facebook/react/issues/1"))).toBe(false);
  });
});

describe("isGithubNotFoundHtml", () => {
  it("detects 404 page", () => {
    expect(isGithubNotFoundHtml(NOT_FOUND_HTML)).toBe(true);
  });

  it("does not flag a real repo page", () => {
    expect(isGithubNotFoundHtml(REPO_HTML)).toBe(false);
  });
});

describe("parseGithubRepoHtml", () => {
  it("returns null for a 404 page", () => {
    expect(parseGithubRepoHtml(NOT_FOUND_HTML)).toBeNull();
  });

  it("returns null for content with no repo shell", () => {
    expect(parseGithubRepoHtml("<html><body><h1>random page</h1></body></html>")).toBeNull();
  });

  const parsed = parseGithubRepoHtml(REPO_HTML)!;

  it("parses full name and description", () => {
    expect(parsed.fullName).toBe("facebook/react");
    expect(parsed.description).toBe("The library for web and native user interfaces.");
  });

  it("parses counters", () => {
    const byLabel = Object.fromEntries(parsed.counters.map((c) => [c.label, c.value]));
    expect(byLabel.Stars).toBe("228k");
    expect(byLabel.Forks).toBe("47.3k");
    expect(byLabel.Watchers).toBe("6.1k");
  });

  it("parses topics", () => {
    expect(parsed.topics).toEqual(["javascript", "react", "ui"]);
  });

  it("parses homepage and license", () => {
    expect(parsed.homepage).toBe("https://react.dev");
    expect(parsed.license).toBe("MIT license");
  });

  it("parses languages with percentages", () => {
    expect(parsed.languages).toEqual([
      { name: "JavaScript", percent: "92.3%" },
      { name: "HTML", percent: "4.2%" },
      { name: "TypeScript", percent: "3.5%" },
    ]);
  });

  it("parses contributors count and top names", () => {
    expect(parsed.contributors.count).toBe("1692");
    expect(parsed.contributors.topNames).toContain("gaearon");
    expect(parsed.contributors.topNames).toContain("sebmarkbage");
  });

  it("parses commit count and last commit date", () => {
    expect(parsed.commits.count).toBe("1234");
    expect(parsed.commits.lastCommitDate).toBe("2026-05-14T10:00:00Z");
  });

  it("converts README to markdown", () => {
    expect(parsed.readme).toContain("# React");
    expect(parsed.readme).toContain("## Installation");
    expect(parsed.readme).toContain("```bash");
    expect(parsed.readme).toContain("npm install react react-dom");
    expect(parsed.readme).toContain("- Components");
    expect(parsed.readme).toContain("> React makes it painless");
    expect(parsed.readme).toContain("**Declarative**");
    expect(parsed.readme).toContain("*component-based*");
    expect(parsed.readme).toContain("[docs](https://react.dev/docs)");
    expect(parsed.readme).toContain("| react | 19.0.0 |");
  });
});

describe("GithubExtractor.extract", () => {
  const ext = new GithubExtractor();

  it("returns formatted markdown from rendered HTML", async () => {
    const input = makeInput(REPO_HTML);
    const result = await ext.extract(input);
    expect(result).not.toBeNull();
    expect(result!.content).toContain("# facebook/react");
    expect(result!.content).toContain("Stars: 228k");
    expect(result!.content).toContain("License: MIT license");
    expect(result!.content).toContain("Commits: 1234");
    expect(result!.content).toContain("Last commit: 2026-05-14T10:00:00Z");
    expect(result!.content).toContain("## README");
    expect(result!.html).toBe(REPO_HTML);
  });

  it("returns null on 404 page", async () => {
    const input = makeInput(NOT_FOUND_HTML);
    expect(await ext.extract(input)).toBeNull();
  });

  it("returns null when renderHtml yields nothing", async () => {
    const input = makeInput(null);
    expect(await ext.extract(input)).toBeNull();
  });

  it("returns null when loader has no renderHtml", async () => {
    const input: ExtractorInput = {
      url: new URL("https://github.com/facebook/react"),
      loader: {},
    };
    expect(await ext.extract(input)).toBeNull();
  });
});
