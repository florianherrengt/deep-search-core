import { load } from "cheerio";
import { P as PageExtractor, V as validateUrl, U as UrlValidationError, t as formatSearchResults, N as searchQueryInputSchema } from "./hacker-news-CcmUI8pw.js";
import { tool, zodSchema, streamText } from "ai";
import { z } from "zod";
const RESERVED_FIRST_SEGMENTS = /* @__PURE__ */ new Set([
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
  // A user profile lives at /users/<name>: it has exactly two path segments
  // (like owner/repo), so without reserving it the extractor would claim it
  // and, if the profile has a README, misparse the profile README as a repo.
  "users"
]);
function isGithubRepoOverviewUrl(url) {
  const host = url.hostname;
  if (host !== "github.com") return false;
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 2) return false;
  const [owner, repo] = segments;
  if (RESERVED_FIRST_SEGMENTS.has(owner.toLowerCase())) return false;
  if (repo.toLowerCase() === "settings") return false;
  if (/[\s]/.test(repo)) return false;
  if (repo === "." || repo === "..") return false;
  return true;
}
function isGithubNotFoundHtml(html) {
  const $ = load(html);
  const title = normalizeWhitespace($("title").first().text()).toLowerCase();
  if (title.includes("page not found")) return true;
  const bodyText = normalizeWhitespace($("body").text()).toLowerCase();
  return bodyText.includes("this is not the web page you are looking for");
}
function normalizeWhitespace(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function firstNonEmpty(...values) {
  for (const v of values) {
    if (v && v.trim()) return normalizeWhitespace(v);
  }
  return null;
}
function metaContent($, names) {
  for (const name of names) {
    const attr = name.startsWith("og:") ? "property" : "name";
    const content = $(`meta[${attr}="${name}"]`).attr("content");
    if (content && content.trim()) return normalizeWhitespace(content);
  }
  return null;
}
function parseCountInt(text) {
  if (!text) return null;
  const cleaned = normalizeWhitespace(text).replace(/,/g, "");
  const match = cleaned.match(/(\d+(\.\d+)?k?)/i);
  if (!match) return null;
  return match[1];
}
function extractCounters($) {
  const counters = [];
  const starsText = firstNonEmpty(
    $("#repo-stars-counter-star").text(),
    $("a[href$='/stargazers']").text(),
    $("a[href$='/stargazers/']").text()
  );
  if (starsText) counters.push({ label: "Stars", value: parseCountInt(starsText) ?? starsText });
  const forksText = firstNonEmpty(
    $("#repo-network-counter").text(),
    $("a[href$='/forks']").text(),
    $("a[href$='/network/members']").text()
  );
  if (forksText) counters.push({ label: "Forks", value: parseCountInt(forksText) ?? forksText });
  const watchersText = firstNonEmpty(
    $("#repo-notifications-counter").text(),
    $("a[href$='/watchers']").text()
  );
  if (watchersText)
    counters.push({ label: "Watchers", value: parseCountInt(watchersText) ?? watchersText });
  return counters;
}
function extractTopics($) {
  const topics = [];
  $(".topic-tag, a.topic-tag, a[data-octo-dimensions*='topic']").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text) topics.push(text);
  });
  return [...new Set(topics)];
}
function extractHomepage($) {
  let homepage = null;
  $(
    ".BorderGrid-row a[href^='http'], .BorderGrid-cell a[href^='http'], a[data-octo-dimensions*='homepage']"
  ).each((_, el) => {
    if (homepage) return;
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href);
      if (u.hostname === "github.com" || u.hostname.endsWith(".github.com")) return;
      homepage = href;
    } catch {
    }
  });
  return homepage;
}
function extractLicense($) {
  let license = null;
  $(
    "a[href*='/blob/'][href*='LICENSE' i], a[href*='/blob/'][href*='COPYING' i], a[href*='/blob/'][href*='NOTICE' i]"
  ).each((_, el) => {
    if (license) return;
    const text = normalizeWhitespace($(el).text());
    if (text && /licen[sc]e|mit|apache|bsd|gpl|mpl|isc|unlicense/i.test(text)) {
      license = text;
    }
  });
  return license;
}
function extractLanguages($) {
  const languages = [];
  const languagesHeading = $(
    "h2, h3, summary"
  ).filter((_, el) => normalizeWhitespace($(el).text()).toLowerCase() === "languages").first();
  if (languagesHeading.length) {
    const container = languagesHeading.closest("div, section, details, li");
    container.find("span.color-fg-default.text-bold, span[itemprop], li").each((_, el) => {
      const $el = $(el);
      const name = normalizeWhitespace(
        $el.find("span.color-fg-default.text-bold, span[itemprop='name']").first().text() || ($el.is("li") ? $el.find("span").first().text() : "")
      );
      const percent = normalizeWhitespace(
        $el.find("span:not(.color-fg-default):not([itemprop])").last().text()
      );
      if (name && /^\d+(\.\d+)?%$/.test(percent)) {
        languages.push({ name, percent });
      }
    });
  }
  const seen = /* @__PURE__ */ new Set();
  return languages.filter((l) => {
    if (seen.has(l.name)) return false;
    seen.add(l.name);
    return true;
  });
}
function extractContributors($) {
  const link = $("a[href$='/graphs/contributors'], a[href$='/graphs/contributors/']").first();
  let count = null;
  if (link.length) {
    const text = normalizeWhitespace(link.text());
    const parsed = parseCountInt(text);
    if (parsed) count = parsed;
  }
  const heading = $(
    "h2, h3, summary"
  ).filter((_, el) => normalizeWhitespace($(el).text()).toLowerCase().startsWith("contributor")).first();
  if (!count && heading.length) {
    const container = heading.closest("div, section, details, li");
    const num = parseCountInt(container.find("span, h2, h3").text());
    if (num) count = num;
  }
  const topNames = [];
  $(
    "img[src*='/u/'], a[href$='/graphs/contributors'] img, .avatar, a[data-hovercard-type='user'] img, img[class*='avatar']"
  ).each((_, el) => {
    if (topNames.length >= 8) return;
    const name = normalizeWhitespace($(el).attr("alt") || "") || (() => {
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
function extractCommitInfo($) {
  let count = null;
  const commitLinks = $(
    "a[href*='/commits/'], a[href$='/commits'], a[aria-label*='commits' i], a[title*='commits' i]"
  );
  commitLinks.each((_, el) => {
    if (count) return;
    const text = normalizeWhitespace($(el).text());
    if (/commit/i.test(text)) {
      const parsed = parseCountInt(text);
      if (parsed) count = parsed;
    }
  });
  let lastCommitDate = null;
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
function extractFlags($) {
  const bodyText = normalizeWhitespace($("body").text()).toLowerCase();
  const bannerText = normalizeWhitespace($(".flash, .js-notice, [class*='banner']").text()).toLowerCase();
  return {
    archived: /this repository has been archived|archived/.test(bannerText),
    fork: bodyText.includes("forked from"),
    disabled: bodyText.includes("this repository is currently disabled")
  };
}
function inlineMarkdown($, el) {
  if (el.type === "text") {
    const raw = el.data ?? "";
    return raw.replace(/\s+/g, " ");
  }
  if (el.type !== "tag") return "";
  const $el = $(el);
  const tag = el.tagName.toLowerCase();
  const inner = () => $el.contents().toArray().map((c) => inlineMarkdown($, c)).join("");
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
function blockMarkdown($, el) {
  if (el.type === "text") {
    const raw = el.data ?? "";
    return raw.replace(/\s+/g, " ");
  }
  if (el.type !== "tag") return "";
  const $el = $(el);
  const tag = el.tagName.toLowerCase();
  const childrenBlocks = () => $el.contents().toArray().map((c) => blockMarkdown($, c)).join("");
  const inlineInner = () => inlineMarkdown($, el).trim();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      return `
${"#".repeat(level)} ${inlineInner()}

`;
    }
    case "p":
      return `${inlineInner()}

`;
    case "pre": {
      const codeEl = $el.find("code").first();
      const codeText = codeEl.length ? codeEl.text() : $el.text();
      const langClass = codeEl.attr("class") || "";
      const langMatch = langClass.match(/language-([\w+-]+)/);
      const lang = langMatch ? langMatch[1] : "";
      return `
\`\`\`${lang}
${codeText.replace(/\n+$/, "")}
\`\`\`

`;
    }
    case "blockquote": {
      const inner = childrenBlocks().trim();
      return `
${inner.split("\n").map((l) => `> ${l}`).join("\n")}

`;
    }
    case "ul":
    case "ol": {
      const items = $el.children("li").toArray();
      const lines = items.map((li, idx) => {
        const content = inlineMarkdown($, li).trim();
        const marker = tag === "ol" ? `${idx + 1}.` : "-";
        return `${marker} ${content}`;
      });
      return `${lines.join("\n")}

`;
    }
    case "table": {
      const rows = $el.find("tr").toArray();
      if (rows.length === 0) return "";
      const rendered = rows.map((tr) => {
        const cells = $(tr).find("th, td").toArray().map((c) => inlineMarkdown($, c).trim());
        return `| ${cells.join(" | ")} |`;
      });
      const firstCellCount = $(rows[0]).find("th, td").toArray().length;
      const separator = `| ${Array.from({ length: firstCellCount }, () => "---").join(" | ")} |`;
      return `
${rendered[0]}
${separator}
${rendered.slice(1).join("\n")}

`;
    }
    case "hr":
      return `
---

`;
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
      return inlineInner() ? `${inlineInner()}
` : "";
  }
}
function readmeToMarkdown($) {
  const readmeEl = $("article.markdown-body").first();
  if (!readmeEl.length) return null;
  const blocks = readmeEl.contents().toArray().map((c) => blockMarkdown($, c)).join("");
  return normalizeMarkdown(blocks);
}
function normalizeMarkdown(text) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}
function parseGithubRepoHtml(html) {
  const $ = load(html);
  if (isGithubNotFoundHtml(html)) return null;
  const fullName = firstNonEmpty(
    metaContent($, ["og:title"]),
    (() => {
      const repoTitle = $("h1 [data-view-component='true'] a, h1 strong a, h1 a").first().attr("href");
      return repoTitle ? normalizeWhitespace(repoTitle).replace(/^\/+|\/+$/g, "") : null;
    })()
  );
  const hasRepoShell = fullName || $("article.markdown-body").length > 0 || $("a[href$='/stargazers']").length > 0 || $("[data-pjax='#repo-content-pjax-container']").length > 0;
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
    readme: readmeToMarkdown($)
  };
}
function formatParsedRepo(repo) {
  const lines = [];
  const name = repo.fullName;
  lines.push(`# ${name}`);
  lines.push("");
  if (repo.description) {
    lines.push(repo.description);
    lines.push("");
  }
  const counterLine = repo.counters.filter((c) => c.value).map((c) => `${c.label}: ${c.value}`).join(" · ");
  if (counterLine) {
    lines.push(counterLine);
  }
  const metaParts = [];
  if (repo.license) metaParts.push(`License: ${repo.license}`);
  const langSummary = repo.languages.length ? repo.languages.map((l) => `${l.name} ${l.percent}`).join(" · ") : null;
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
  const contribParts = [];
  if (repo.contributors.count) {
    contribParts.push(`Contributors: ${repo.contributors.count}`);
  }
  if (repo.contributors.topNames.length) {
    contribParts.push(
      `Top: ${repo.contributors.topNames.map((n) => `@${n}`).join(", ")}`
    );
  }
  if (contribParts.length) lines.push(contribParts.join(" · "));
  const commitParts = [];
  if (repo.commits.count) commitParts.push(`Commits: ${repo.commits.count}`);
  if (repo.commits.lastCommitDate)
    commitParts.push(`Last commit: ${repo.commits.lastCommitDate}`);
  if (commitParts.length) lines.push(commitParts.join(" · "));
  const activeFlags = [];
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
class GithubExtractor extends PageExtractor {
  canHandle(url) {
    return isGithubRepoOverviewUrl(url);
  }
  async extract(input) {
    if (!input.loader.renderHtml) return null;
    const html = await input.loader.renderHtml(input.url.href, {
      signal: input.signal
    });
    if (!html) return null;
    const parsed = parseGithubRepoHtml(html);
    if (!parsed) return null;
    const content = formatParsedRepo(parsed);
    if (!content.trim()) return null;
    return { content, html };
  }
}
const SUMMARY_SYSTEM_PROMPT = "You are a research assistant. Extract and summarize the key information from this page content. Be concise but thorough. Preserve factual details, names, dates, and numbers.";
function createAiSdkSummarizer(model) {
  return async ({ content, query, signal }) => {
    if (!content.trim()) return "";
    const result = streamText({
      model,
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: `${content}${query ? `

Focus on information related to: ${query}` : ""}`,
      abortSignal: signal
    });
    return result.text;
  };
}
function createAiSdkSearchTool(engine, provider, description) {
  return tool({
    description,
    strict: true,
    inputSchema: zodSchema(searchQueryInputSchema),
    execute: async ({ query }, ctx) => {
      const results = await engine.search(provider, query, {
        signal: ctx?.abortSignal
      });
      return formatSearchResults(results);
    }
  });
}
const extractPageContentInputSchema = z.object({
  url: z.string().describe("URL to extract content from"),
  query: z.string().optional().describe(
    'What you want from the page — focuses the summary on specific information (e.g. "price", "ingredients list", "author biography").'
  ),
  summarize: z.boolean().optional().describe(
    "Set to false to get the full page content. By default the page is summarized."
  ),
  method: z.enum(["auto", "fetch", "webview"]).optional().describe(
    "Extraction method. 'auto' tries fetch then falls back to webview. 'fetch' forces HTTP-only. 'webview' forces browser rendering."
  )
});
function mapExtractionMethod(method) {
  if (!method) return void 0;
  if (method === "webview") return "render";
  return method;
}
function createAiSdkExtractPageContentTool(engine, options) {
  const summarizer = options?.summarizer ?? (options?.model ? createAiSdkSummarizer(options.model) : void 0);
  return tool({
    description: 'Extract the plain-text content of a web page with scripts, styles, hidden UI, and obvious boilerplate stripped. Use this to read the content of a URL found during research.\n\nBy default the page is summarized. Provide a `query` to focus the summary on specific information — for example `query: "price and availability"` returns a summary centered on those details. Set `summarize: false` when you need the full page content.',
    strict: true,
    inputSchema: zodSchema(extractPageContentInputSchema),
    outputSchema: zodSchema(z.string().describe("Extracted page content")),
    execute: async ({ url, query, summarize: doSummarize, method }, ctx) => {
      try {
        validateUrl(url);
      } catch (e) {
        if (e instanceof UrlValidationError) return `Error: ${e.message}`;
        throw e;
      }
      const result = await engine.extract(url, {
        method: mapExtractionMethod(method),
        summarize: false,
        signal: ctx?.abortSignal
      });
      if (!result.content && !result.html) {
        return appendExtractionWarnings(
          `No content could be extracted from ${url}. The page may be empty, require JavaScript rendering, or be blocked by a paywall or captcha.`,
          result.warnings
        );
      }
      const shouldSummarize = !!query || doSummarize === true || doSummarize !== false && !result.usedCustomExtractor;
      if (shouldSummarize && summarizer && result.content?.trim()) {
        try {
          const summary = await summarizer({
            content: result.content,
            query,
            signal: ctx?.abortSignal
          });
          return summary || result.content;
        } catch {
        }
      }
      return result.content;
    }
  });
}
function appendExtractionWarnings(message, warnings) {
  const usefulWarnings = (warnings ?? []).filter((warning) => warning.trim());
  if (usefulWarnings.length === 0) return message;
  return `${message}

Warnings:
${usefulWarnings.map((warning) => `- ${warning}`).join("\n")}`;
}
export {
  GithubExtractor as G,
  createAiSdkSearchTool as a,
  createAiSdkSummarizer as b,
  createAiSdkExtractPageContentTool as c,
  isGithubRepoOverviewUrl as d,
  isGithubNotFoundHtml as i,
  parseGithubRepoHtml as p
};
//# sourceMappingURL=ai-sdk-DjXVreCY.js.map
