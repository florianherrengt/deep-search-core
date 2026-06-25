import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";

const RESERVED_FIRST_SEGMENTS = new Set([
  "settings",
  "orgs",
  "topics",
  "search",
  "explore",
  "notifications",
  "features",
  "marketplace",
  "pulls",
  "issues",
  "new",
  "sessions",
  "login",
  "signup",
  "security",
  "about",
  "pricing",
  "customer-stories",
  "enterprise",
  "sponsors",
  "trending",
  "collections",
  "events",
  "stars",
  "dashboard",
]);

export function isGithubRepoOverviewUrl(url: URL): boolean {
  const host = url.hostname;
  if (host !== "github.com") return false;

  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 2) return false;

  const [owner, repo] = segments;
  if (RESERVED_FIRST_SEGMENTS.has(owner.toLowerCase())) return false;
  if (repo.toLowerCase() === "settings") return false;

  // Repo names cannot contain spaces and are not pure dot paths like "..".
  if (/[\s]/.test(repo)) return false;
  if (repo === "." || repo === "..") return false;

  return true;
}

export function isGithubNotFoundHtml(html: string): boolean {
  const $ = load(html);
  const title = normalizeWhitespace($("title").first().text()).toLowerCase();
  if (title.includes("page not found")) return true;

  const bodyText = normalizeWhitespace($("body").text()).toLowerCase();
  return bodyText.includes("this is not the web page you are looking for");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (v && v.trim()) return normalizeWhitespace(v);
  }
  return null;
}

function metaContent($: CheerioAPI, names: string[]): string | null {
  for (const name of names) {
    const attr = name.startsWith("og:") ? "property" : "name";
    const content = $(`meta[${attr}="${name}"]`).attr("content");
    if (content && content.trim()) return normalizeWhitespace(content);
  }
  return null;
}

function parseCountInt(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = normalizeWhitespace(text).replace(/,/g, "");
  const match = cleaned.match(/(\d+(\.\d+)?k?)/i);
  if (!match) return null;
  return match[1];
}

interface Counter {
  label: string;
  value: string;
}

function extractCounters($: CheerioAPI): Counter[] {
  const counters: Counter[] = [];

  const starsText = firstNonEmpty(
    $("#repo-stars-counter-star").text(),
    $("a[href$='/stargazers']").text(),
    $("a[href$='/stargazers/']").text(),
  );
  if (starsText) counters.push({ label: "Stars", value: parseCountInt(starsText) ?? starsText });

  const forksText = firstNonEmpty(
    $("#repo-network-counter").text(),
    $("a[href$='/forks']").text(),
    $("a[href$='/network/members']").text(),
  );
  if (forksText) counters.push({ label: "Forks", value: parseCountInt(forksText) ?? forksText });

  const watchersText = firstNonEmpty(
    $("#repo-notifications-counter").text(),
    $("a[href$='/watchers']").text(),
  );
  if (watchersText)
    counters.push({ label: "Watchers", value: parseCountInt(watchersText) ?? watchersText });

  return counters;
}

function extractTopics($: CheerioAPI): string[] {
  const topics: string[] = [];
  $(".topic-tag, a.topic-tag, a[data-octo-dimensions*='topic']").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text) topics.push(text);
  });
  return [...new Set(topics)];
}

function extractHomepage($: CheerioAPI): string | null {
  let homepage: string | null = null;
  $(
    ".BorderGrid-row a[href^='http'], .BorderGrid-cell a[href^='http'], a[data-octo-dimensions*='homepage']",
  ).each((_, el) => {
    if (homepage) return;
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href);
      if (u.hostname === "github.com" || u.hostname.endsWith(".github.com")) return;
      homepage = href;
    } catch {
      // ignore invalid URLs
    }
  });
  return homepage;
}

function extractLicense($: CheerioAPI): string | null {
  let license: string | null = null;
  $(
    "a[href*='/blob/'][href*='LICENSE' i], a[href*='/blob/'][href*='COPYING' i], a[href*='/blob/'][href*='NOTICE' i]",
  ).each((_, el) => {
    if (license) return;
    const text = normalizeWhitespace($(el).text());
    if (text && /licen[sc]e|mit|apache|bsd|gpl|mpl|isc|unlicense/i.test(text)) {
      license = text;
    }
  });
  return license;
}

interface LanguageEntry {
  name: string;
  percent: string;
}

function extractLanguages($: CheerioAPI): LanguageEntry[] {
  const languages: LanguageEntry[] = [];

  // GitHub's about sidebar lists languages with a bold name followed by a percent.
  const languagesHeading = $(
    "h2, h3, summary",
  )
    .filter((_, el) => normalizeWhitespace($(el).text()).toLowerCase() === "languages")
    .first();

  if (languagesHeading.length) {
    const container = languagesHeading.closest("div, section, details, li");
    container
      .find("span.color-fg-default.text-bold, span[itemprop], li")
      .each((_, el) => {
        const $el = $(el);
        const name = normalizeWhitespace(
          $el.find("span.color-fg-default.text-bold, span[itemprop='name']").first().text() ||
            ($el.is("li") ? $el.find("span").first().text() : ""),
        );
        const percent = normalizeWhitespace(
          $el.find("span:not(.color-fg-default):not([itemprop])").last().text(),
        );
        if (name && /^\d+(\.\d+)?%$/.test(percent)) {
          languages.push({ name, percent });
        }
      });
  }

  // Deduplicate by name, keeping the first occurrence.
  const seen = new Set<string>();
  return languages.filter((l) => {
    if (seen.has(l.name)) return false;
    seen.add(l.name);
    return true;
  });
}

interface ContributorInfo {
  count: string | null;
  topNames: string[];
}

function extractContributors($: CheerioAPI): ContributorInfo {
  const link = $("a[href$='/graphs/contributors'], a[href$='/graphs/contributors/']").first();
  let count: string | null = null;
  if (link.length) {
    const text = normalizeWhitespace(link.text());
    const parsed = parseCountInt(text);
    if (parsed) count = parsed;
  }

  const heading = $(
    "h2, h3, summary",
  )
    .filter((_, el) => normalizeWhitespace($(el).text()).toLowerCase().startsWith("contributor"))
    .first();
  if (!count && heading.length) {
    const container = heading.closest("div, section, details, li");
    const num = parseCountInt(container.find("span, h2, h3").text());
    if (num) count = num;
  }

  const topNames: string[] = [];
  $(
    "img[src*='/u/'], a[href$='/graphs/contributors'] img, .avatar, a[data-hovercard-type='user'] img, img[class*='avatar']",
  ).each((_, el) => {
    if (topNames.length >= 8) return;
    const name =
      normalizeWhitespace($(el).attr("alt") || "") ||
      (() => {
        const login = $(el).closest("a").attr("href");
        if (!login) return "";
        return login.startsWith("/") ? login.slice(1) : login;
      })();
    const cleaned = name.replace(/^@/, "");
    if (cleaned && cleaned.toLowerCase() !== "view all contributors" && !topNames.includes(cleaned)) {
      topNames.push(cleaned);
    }
  });

  return { count, topNames };
}

interface CommitInfo {
  count: string | null;
  lastCommitDate: string | null;
}

function extractCommitInfo($: CheerioAPI): CommitInfo {
  let count: string | null = null;
  const commitLinks = $(
    "a[href*='/commits/'], a[href$='/commits'], a[aria-label*='commits' i], a[title*='commits' i]",
  );
  commitLinks.each((_, el) => {
    if (count) return;
    const text = normalizeWhitespace($(el).text());
    if (/commit/i.test(text)) {
      const parsed = parseCountInt(text);
      if (parsed) count = parsed;
    }
  });

  let lastCommitDate: string | null = null;
  const relativeTime = $("relative-time[datetime]").first();
  if (relativeTime.length) {
    const datetime = relativeTime.attr("datetime");
    if (datetime) lastCommitDate = datetime;
  }
  if (!lastCommitDate) {
    const timeEl = $("time[datetime], time[title]").first();
    const datetime = timeEl.attr("datetime") || timeEl.attr("title");
    if (datetime) lastCommitDate = datetime;
  }

  return { count, lastCommitDate };
}

interface RepoFlags {
  archived: boolean;
  fork: boolean;
  disabled: boolean;
}

function extractFlags($: CheerioAPI): RepoFlags {
  const bodyText = normalizeWhitespace($("body").text()).toLowerCase();
  const bannerText = normalizeWhitespace($(".flash, .js-notice, [class*='banner']").text()).toLowerCase();
  return {
    archived: /this repository has been archived|archived/.test(bannerText),
    fork: bodyText.includes("forked from"),
    disabled: bodyText.includes("this repository is currently disabled"),
  };
}

// ─── README HTML → Markdown ────────────────────────────────────────────────

function inlineMarkdown($: CheerioAPI, el: AnyNode): string {
  if (el.type === "text") {
    const raw = (el as { data?: string }).data ?? "";
    return raw.replace(/\s+/g, " ");
  }
  if (el.type !== "tag") return "";

  const $el = $(el);
  const tag = el.tagName.toLowerCase();
  const inner = () =>
    $el
      .contents()
      .toArray()
      .map((c) => inlineMarkdown($, c))
      .join("");

  switch (tag) {
    case "a": {
      const href = $el.attr("href") || "";
      const text = inner().trim();
      if (!text) return "";
      return href ? `[${text}](${href})` : text;
    }
    case "strong":
    case "b":
      return `**${inner().trim()}**`;
    case "em":
    case "i":
      return `*${inner().trim()}*`;
    case "code":
      return `\`${$el.text()}\``;
    case "img": {
      const alt = $el.attr("alt") || "";
      const src = $el.attr("src") || "";
      return src ? `![${alt}](${src})` : "";
    }
    case "br":
      return "\n";
    case "sup":
    case "sub":
    case "span":
    case "mark":
    case "small":
      return inner();
    default:
      return inner();
  }
}

function blockMarkdown($: CheerioAPI, el: AnyNode): string {
  if (el.type === "text") {
    const raw = (el as { data?: string }).data ?? "";
    return raw.replace(/\s+/g, " ");
  }
  if (el.type !== "tag") return "";

  const $el = $(el);
  const tag = el.tagName.toLowerCase();

  const childrenBlocks = (): string =>
    $el
      .contents()
      .toArray()
      .map((c) => blockMarkdown($, c))
      .join("");

  const inlineInner = (): string => inlineMarkdown($, el).trim();

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      return `\n${"#".repeat(level)} ${inlineInner()}\n\n`;
    }
    case "p":
      return `${inlineInner()}\n\n`;
    case "pre": {
      const codeEl = $el.find("code").first();
      const codeText = codeEl.length ? codeEl.text() : $el.text();
      const langClass = codeEl.attr("class") || "";
      const langMatch = langClass.match(/language-([\w+-]+)/);
      const lang = langMatch ? langMatch[1] : "";
      return `\n\`\`\`${lang}\n${codeText.replace(/\n+$/, "")}\n\`\`\`\n\n`;
    }
    case "blockquote": {
      const inner = childrenBlocks().trim();
      return `\n${inner
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`;
    }
    case "ul":
    case "ol": {
      const items = $el.children("li").toArray();
      const lines = items.map((li, idx) => {
        const content = inlineMarkdown($, li).trim();
        const marker = tag === "ol" ? `${idx + 1}.` : "-";
        return `${marker} ${content}`;
      });
      return `${lines.join("\n")}\n\n`;
    }
    case "table": {
      const rows = $el.find("tr").toArray();
      if (rows.length === 0) return "";
      const rendered = rows.map((tr) => {
        const cells = $(tr)
          .find("th, td")
          .toArray()
          .map((c) => inlineMarkdown($, c).trim());
        return `| ${cells.join(" | ")} |`;
      });
      const firstCellCount = $(rows[0]).find("th, td").toArray().length;
      const separator = `| ${Array.from({ length: firstCellCount }, () => "---").join(" | ")} |`;
      return `\n${rendered[0]}\n${separator}\n${rendered.slice(1).join("\n")}\n\n`;
    }
    case "hr":
      return `\n---\n\n`;
    case "br":
      return "\n";
    case "div":
    case "section":
    case "article":
    case "span":
    case "details":
    case "summary":
      return childrenBlocks();
    default:
      return inlineInner() ? `${inlineInner()}\n` : "";
  }
}

function readmeToMarkdown($: CheerioAPI): string | null {
  const readmeEl = $("article.markdown-body").first();
  if (!readmeEl.length) return null;

  const blocks = readmeEl
    .contents()
    .toArray()
    .map((c) => blockMarkdown($, c))
    .join("");

  return normalizeMarkdown(blocks);
}

function normalizeMarkdown(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}

// ─── Main parser ───────────────────────────────────────────────────────────

export interface ParsedGithubRepo {
  fullName: string;
  description: string | null;
  counters: Counter[];
  topics: string[];
  homepage: string | null;
  license: string | null;
  languages: LanguageEntry[];
  contributors: ContributorInfo;
  commits: CommitInfo;
  flags: RepoFlags;
  readme: string | null;
}

export function parseGithubRepoHtml(html: string): ParsedGithubRepo | null {
  const $ = load(html);

  if (isGithubNotFoundHtml(html)) return null;

  const fullName = firstNonEmpty(
    metaContent($, ["og:title"]),
    (() => {
      const repoTitle = $("h1 [data-view-component='true'] a, h1 strong a, h1 a")
        .first()
        .attr("href");
      return repoTitle ? normalizeWhitespace(repoTitle).replace(/^\/+|\/+$/g, "") : null;
    })(),
  );

  const hasRepoShell =
    fullName ||
    $("article.markdown-body").length > 0 ||
    $("a[href$='/stargazers']").length > 0 ||
    $("[data-pjax='#repo-content-pjax-container']").length > 0;

  if (!hasRepoShell) return null;

  return {
    fullName: fullName || "github/repository",
    description: metaContent($, ["og:description", "description"]),
    counters: extractCounters($),
    topics: extractTopics($),
    homepage: extractHomepage($),
    license: extractLicense($),
    languages: extractLanguages($),
    contributors: extractContributors($),
    commits: extractCommitInfo($),
    flags: extractFlags($),
    readme: readmeToMarkdown($),
  };
}

function formatParsedRepo(repo: ParsedGithubRepo): string {
  const lines: string[] = [];
  const name = repo.fullName;

  lines.push(`# ${name}`);
  lines.push("");

  if (repo.description) {
    lines.push(repo.description);
    lines.push("");
  }

  const counterLine = repo.counters
    .filter((c) => c.value)
    .map((c) => `${c.label}: ${c.value}`)
    .join(" · ");
  if (counterLine) {
    lines.push(counterLine);
  }

  const metaParts: string[] = [];
  if (repo.license) metaParts.push(`License: ${repo.license}`);
  const langSummary = repo.languages.length
    ? repo.languages.map((l) => `${l.name} ${l.percent}`).join(" · ")
    : null;
  if (langSummary) metaParts.push(`Languages: ${langSummary}`);
  if (metaParts.length) {
    lines.push(metaParts.join(" · "));
  }

  if (repo.topics.length) {
    lines.push(`Topics: ${repo.topics.join(", ")}`);
  }
  if (repo.homepage) {
    lines.push(`Homepage: ${repo.homepage}`);
  }

  const contribParts: string[] = [];
  if (repo.contributors.count) {
    contribParts.push(`Contributors: ${repo.contributors.count}`);
  }
  if (repo.contributors.topNames.length) {
    contribParts.push(
      `Top: ${repo.contributors.topNames.map((n) => `@${n}`).join(", ")}`,
    );
  }
  if (contribParts.length) lines.push(contribParts.join(" · "));

  const commitParts: string[] = [];
  if (repo.commits.count) commitParts.push(`Commits: ${repo.commits.count}`);
  if (repo.commits.lastCommitDate)
    commitParts.push(`Last commit: ${repo.commits.lastCommitDate}`);
  if (commitParts.length) lines.push(commitParts.join(" · "));

  const activeFlags: string[] = [];
  if (repo.flags.archived) activeFlags.push("archived");
  if (repo.flags.fork) activeFlags.push("fork");
  if (repo.flags.disabled) activeFlags.push("disabled");
  if (activeFlags.length) lines.push(`Status: ${activeFlags.join(", ")}`);

  if (repo.readme) {
    lines.push("");
    lines.push("## README");
    lines.push("");
    lines.push(repo.readme);
  }

  return normalizeMarkdown(lines.join("\n"));
}

export class GithubExtractor extends PageExtractor {
  canHandle(url: URL): boolean {
    return isGithubRepoOverviewUrl(url);
  }

  async extract(input: ExtractorInput): Promise<ExtractorResult | null> {
    if (!input.loader.renderHtml) return null;

    const html = await input.loader.renderHtml(input.url.href, {
      signal: input.signal,
    });
    if (!html) return null;

    const parsed = parseGithubRepoHtml(html);
    if (!parsed) return null;

    const content = formatParsedRepo(parsed);
    if (!content.trim()) return null;

    return { content, html };
  }
}
