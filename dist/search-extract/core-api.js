var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/search-extract/core/errors.ts
var SearchProviderConfigError, SearchProviderError, SearchProviderResponseError, AggregateSearchError, UrlValidationError;
var init_errors = __esm({
  "src/search-extract/core/errors.ts"() {
    "use strict";
    SearchProviderConfigError = class extends Error {
      provider;
      constructor(provider, message) {
        super(`${provider} ${message}`);
        this.name = "SearchProviderConfigError";
        this.provider = provider;
      }
    };
    SearchProviderError = class extends Error {
      provider;
      status;
      constructor(provider, status, body) {
        const bodySuffix = body ? `: ${body}` : "";
        super(`${provider} search failed with HTTP ${status}${bodySuffix}`);
        this.name = "SearchProviderError";
        this.provider = provider;
        this.status = status;
      }
    };
    SearchProviderResponseError = class extends Error {
      provider;
      constructor(provider, detail) {
        const detailSuffix = detail ? `: ${detail}` : "";
        super(
          `${provider} search response did not match the expected format${detailSuffix}`
        );
        this.name = "SearchProviderResponseError";
        this.provider = provider;
      }
    };
    AggregateSearchError = class extends Error {
      errors;
      constructor(errors, message) {
        super(message);
        this.name = "AggregateSearchError";
        this.errors = [...errors];
      }
    };
    UrlValidationError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "UrlValidationError";
      }
    };
  }
});

// src/search-extract/extract/sanitize-html.ts
import { load } from "cheerio";
function isTextNode(node) {
  return node.type === "text";
}
function isElementNode(node) {
  return "tagName" in node && "children" in node;
}
function tagName(node) {
  return node.tagName.toLowerCase();
}
function normalizeInlineWhitespace(text) {
  return text.replace(/\u00a0/g, " ").replace(/[^\S\n]+/g, " ").trim();
}
function shouldAddSpace(previous, next) {
  if (!previous || previous === "\n") return false;
  if (/\s$/.test(previous)) return false;
  if (/^[,.;:!?%)\]}]/.test(next)) return false;
  if (/[([{]$/.test(previous)) return false;
  return true;
}
function appendText(parts, text) {
  const normalized = normalizeInlineWhitespace(text);
  if (!normalized) return;
  const previous = parts[parts.length - 1];
  if (shouldAddSpace(previous, normalized)) {
    parts.push(" ");
  }
  parts.push(normalized);
}
function appendBreak(parts) {
  if (parts.length === 0 || parts[parts.length - 1] === "\n") return;
  parts.push("\n");
}
function appendLine(parts, line) {
  const normalized = normalizeInlineWhitespace(line);
  if (!normalized) return;
  appendBreak(parts);
  parts.push(normalized);
  appendBreak(parts);
}
function isHiddenByStyle(style) {
  if (!style) return false;
  const compact = style.replace(/\s+/g, "").toLowerCase();
  return compact.includes("display:none") || compact.includes("visibility:hidden") || compact.includes("visibility:collapse") || compact.includes("opacity:0") || compact.includes("width:0") || compact.includes("height:0");
}
function attributeText($, element) {
  const el = $(element);
  return [
    el.attr("id"),
    el.attr("class"),
    el.attr("role"),
    el.attr("aria-label"),
    el.attr("data-testid"),
    el.attr("data-test"),
    el.attr("name")
  ].filter((value) => Boolean(value)).join(" ");
}
function shouldPruneElement($, element) {
  const el = $(element);
  const role = el.attr("role")?.toLowerCase().trim();
  return el.attr("hidden") !== void 0 || el.attr("aria-hidden")?.toLowerCase() === "true" || el.attr("type")?.toLowerCase() === "hidden" || isHiddenByStyle(el.attr("style")) || role !== void 0 && PRUNED_ROLE_VALUES.has(role) || NOISE_ATTRIBUTE_PATTERN.test(attributeText($, element));
}
function pruneDom($) {
  $(STRUCTURAL_PRUNE_TAGS.join(",")).remove();
  $("*").each((_, element) => {
    if (isElementNode(element) && shouldPruneElement($, element)) {
      $(element).remove();
    }
  });
}
function collectInlineText($, node) {
  if (isTextNode(node)) {
    return normalizeInlineWhitespace(node.data);
  }
  if (!isElementNode(node)) return "";
  const name = tagName(node);
  if (name === "br") return " ";
  if (name === "tr") {
    const cells = node.children.filter(
      (child) => isElementNode(child) && TABLE_CELL_TAGS.has(tagName(child))
    ).map((cell) => collectInlineText($, cell)).filter(Boolean);
    return cells.join(" | ");
  }
  return node.children.map((child) => collectInlineText($, child)).filter(Boolean).join(" ");
}
function walkTextNode($, node, parts) {
  if (isTextNode(node)) {
    appendText(parts, node.data);
    return;
  }
  if (!isElementNode(node)) return;
  const name = tagName(node);
  if (name === "br") {
    appendBreak(parts);
    return;
  }
  if (name === "hr") {
    appendBreak(parts);
    return;
  }
  if (name === "tr") {
    const cells = node.children.filter(
      (child) => isElementNode(child) && TABLE_CELL_TAGS.has(tagName(child))
    ).map((cell) => collectInlineText($, cell)).filter(Boolean);
    if (cells.length > 0) {
      appendLine(parts, cells.join(" | "));
      return;
    }
  }
  const isBlock = BLOCK_TAGS.has(name);
  if (isBlock) appendBreak(parts);
  for (const child of node.children) {
    walkTextNode($, child, parts);
  }
  if (isBlock) appendBreak(parts);
}
function normalizeExtractedText(text) {
  const lines = text.replace(/\u00a0/g, " ").replace(/[^\S\n]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const occurrences = /* @__PURE__ */ new Map();
  const cappedLines = [];
  for (const line of lines) {
    const key = line.toLowerCase().replace(/\s+/g, " ");
    const count = occurrences.get(key) ?? 0;
    occurrences.set(key, count + 1);
    if (count >= MAX_REPEATED_LINE_OCCURRENCES) continue;
    cappedLines.push(line);
  }
  return cappedLines.join("\n").trim();
}
function extractVisibleTextFromHtml(html) {
  const $ = load(html);
  pruneDom($);
  const roots = $("body").length > 0 ? $("body").contents().toArray() : $.root().contents().toArray();
  const parts = [];
  for (const node of roots) {
    walkTextNode($, node, parts);
  }
  return normalizeExtractedText(parts.join(""));
}
function sanitizeHtml(html) {
  return extractVisibleTextFromHtml(html);
}
var MIN_CONTENT_LENGTH, STRUCTURAL_PRUNE_TAGS, BLOCK_TAGS, TABLE_CELL_TAGS, PRUNED_ROLE_VALUES, NOISE_ATTRIBUTE_PATTERN, MAX_REPEATED_LINE_OCCURRENCES;
var init_sanitize_html = __esm({
  "src/search-extract/extract/sanitize-html.ts"() {
    "use strict";
    MIN_CONTENT_LENGTH = 200;
    STRUCTURAL_PRUNE_TAGS = [
      "audio",
      "base",
      "canvas",
      "embed",
      "footer",
      "head",
      "header",
      "iframe",
      "link",
      "map",
      "meta",
      "nav",
      "noscript",
      "object",
      "picture",
      "script",
      "source",
      "style",
      "svg",
      "template",
      "title",
      "track",
      "video",
      "aside"
    ];
    BLOCK_TAGS = /* @__PURE__ */ new Set([
      "address",
      "article",
      "blockquote",
      "body",
      "caption",
      "dd",
      "details",
      "dialog",
      "div",
      "dl",
      "dt",
      "fieldset",
      "figcaption",
      "figure",
      "form",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "html",
      "li",
      "main",
      "menu",
      "ol",
      "p",
      "pre",
      "section",
      "summary",
      "table",
      "tbody",
      "tfoot",
      "thead",
      "tr",
      "ul"
    ]);
    TABLE_CELL_TAGS = /* @__PURE__ */ new Set(["td", "th"]);
    PRUNED_ROLE_VALUES = /* @__PURE__ */ new Set([
      "alertdialog",
      "banner",
      "complementary",
      "contentinfo",
      "dialog",
      "navigation"
    ]);
    NOISE_ATTRIBUTE_PATTERN = /\b(cookie|cookies|consent|gdpr|ccpa|privacy[-_\s]?choices|popup|pop[-_\s]?up|popover|modal|overlay|newsletter|captcha|recaptcha|hcaptcha|interstitial|tracking|tracker|beacon|pixel|ad[-_\s]?(slot|container|banner|unit)|advertisement)\b/i;
    MAX_REPEATED_LINE_OCCURRENCES = 2;
  }
});

// src/search-extract/extract/page-loader.ts
import ipaddr from "ipaddr.js";
function isPrivateIp(hostname) {
  const bare = hostname.replace(/^\[|\]$/g, "");
  let addr;
  try {
    addr = ipaddr.parse(bare);
  } catch {
    return false;
  }
  if (addr.kind() === "ipv6") {
    const v6 = addr;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    }
  }
  return addr.range() !== "unicast";
}
function validateUrl(raw) {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const blockedScheme = BLOCKED_SCHEMES.find(
    (scheme) => lower.startsWith(scheme)
  );
  if (blockedScheme) {
    throw new UrlValidationError(`Blocked scheme: ${blockedScheme}`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UrlValidationError(`Invalid URL: ${trimmed}`);
  }
  if (parsed.protocol !== "https:") {
    throw new UrlValidationError(
      `Only https URLs are allowed, got: ${parsed.protocol}`
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    throw new UrlValidationError(
      `Private/loopback hostname not allowed: ${hostname}`
    );
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    throw new UrlValidationError(`Local hostname not allowed: ${hostname}`);
  }
  if (isPrivateIp(hostname)) {
    throw new UrlValidationError(
      `Private/special-use IP address not allowed: ${hostname}`
    );
  }
  return parsed;
}
async function loadPageHtml(url, fetchImpl, options) {
  validateUrl(url);
  if (options?.signal?.aborted) {
    throw createAbortError();
  }
  try {
    const response = await fetchImpl(url, {
      signal: options?.signal
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("text/plain")) {
      return null;
    }
    return await response.text();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  }
}
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
function createAbortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
var BLOCKED_SCHEMES, PRIVATE_HOSTNAMES;
var init_page_loader = __esm({
  "src/search-extract/extract/page-loader.ts"() {
    "use strict";
    init_errors();
    BLOCKED_SCHEMES = [
      "file:",
      "data:",
      "javascript:",
      "vbscript:",
      "tauri:",
      "about:",
      "blob:"
    ];
    PRIVATE_HOSTNAMES = /* @__PURE__ */ new Set([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "[::1]",
      "::1"
    ]);
  }
});

// src/search-extract/extract/extract-page.ts
var extract_page_exports = {};
__export(extract_page_exports, {
  UrlValidationError: () => UrlValidationError,
  extractPage: () => extractPage,
  validateUrl: () => validateUrl
});
async function extractPage(url, options, deps) {
  const method = options?.method ?? "auto";
  const signal = options?.signal;
  const warnings = [];
  const parsedUrl = validateUrl(url);
  if (signal?.aborted) {
    throw createAbortError2();
  }
  const extractors2 = deps.extractors ?? [];
  const extractorInput = {
    url: parsedUrl,
    loader: deps.pageLoader ?? {},
    fetch: deps.fetch ?? globalThis.fetch,
    signal
  };
  for (const extractor of extractors2) {
    if (!extractor.canHandle(parsedUrl)) continue;
    try {
      const result = await extractor.extract(extractorInput);
      if (result != null && result.content !== "") {
        const extractResult = {
          url,
          content: result.content,
          html: result.html ?? null,
          usedCustomExtractor: true,
          extractorName: extractor.constructor.name,
          method: "custom",
          warnings: [...warnings, ...result.warnings ?? []]
        };
        return applySummarization(extractResult, options, deps.summarizer);
      }
    } catch (error) {
      if (isAbortError2(error)) throw error;
      warnings.push(
        `Custom extractor ${extractor.constructor.name} failed for ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    break;
  }
  return genericExtract(url, method, signal, deps, warnings, options);
}
async function genericExtract(url, method, signal, deps, warnings, options) {
  if (signal?.aborted) {
    throw createAbortError2();
  }
  if (method === "render") {
    if (!deps.pageLoader?.renderHtml) {
      warnings.push("Renderer not available");
      const result3 = {
        url,
        content: "",
        usedCustomExtractor: false,
        method: "render",
        warnings
      };
      return result3;
    }
    const renderOptions = { signal };
    const html2 = await deps.pageLoader.renderHtml(url, renderOptions);
    const content2 = html2 ? sanitizeHtml(html2) : "";
    const result2 = {
      url,
      content: content2,
      html: html2,
      usedCustomExtractor: false,
      method: "render",
      warnings
    };
    return applySummarization(result2, options, deps.summarizer);
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const loadOptions = { signal };
  const html = deps.pageLoader?.fetchHtml ? await deps.pageLoader.fetchHtml(url, loadOptions) : await loadPageHtml(url, fetchImpl, loadOptions);
  const content = html ? sanitizeHtml(html) : "";
  if (method === "auto" && content.length < MIN_CONTENT_LENGTH) {
    if (deps.pageLoader?.renderHtml) {
      const renderOptions = { signal };
      const renderHtmlResult = await deps.pageLoader.renderHtml(url, renderOptions);
      const renderContent = renderHtmlResult ? sanitizeHtml(renderHtmlResult) : "";
      if (renderContent.length >= content.length || content.length === 0) {
        const result2 = {
          url,
          content: renderContent || content,
          html: renderHtmlResult ?? html,
          usedCustomExtractor: false,
          method: "render",
          warnings
        };
        return applySummarization(result2, options, deps.summarizer);
      }
    } else {
      warnings.push("Content is short and renderer is not available");
    }
  }
  const result = {
    url,
    content,
    html,
    usedCustomExtractor: false,
    method: "fetch",
    warnings
  };
  return applySummarization(result, options, deps.summarizer);
}
async function applySummarization(result, options, summarizer) {
  const shouldSummarize = !!(options?.query || options?.summarize);
  if (!shouldSummarize || !summarizer || !result.content.trim()) {
    return result;
  }
  try {
    result.summary = await summarizer({
      content: result.content,
      query: options?.query,
      signal: options?.signal
    });
  } catch (error) {
    if (isAbortError2(error)) throw error;
    result.warnings = result.warnings ?? [];
    result.warnings.push(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return result;
}
function isAbortError2(error) {
  return error instanceof Error && error.name === "AbortError";
}
function createAbortError2() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
var init_extract_page = __esm({
  "src/search-extract/extract/extract-page.ts"() {
    "use strict";
    init_errors();
    init_sanitize_html();
    init_page_loader();
  }
});

// src/search-extract/core/types.ts
import { z } from "zod";
var SEARCH_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng",
  "youtube",
  "aggregate"
];
var AGGREGATABLE_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng"
];
var searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
  snippet: z.string().optional()
});
var searchQueryInputSchema = z.object({
  query: z.string().min(1).describe("Search query")
});

// src/search-extract/core-api.ts
init_errors();

// src/search-extract/core/rate-limit.ts
import PQueue from "p-queue";
function createRateLimiter(requestsPerSecond = 1, concurrency = 1) {
  const queue = new PQueue({
    concurrency,
    intervalCap: requestsPerSecond,
    interval: 1e3
  });
  return {
    schedule(fn, signal) {
      return queue.add(fn, { signal });
    }
  };
}
var defaultInstance = null;
function getRateLimiter() {
  if (!defaultInstance) {
    defaultInstance = createRateLimiter();
  }
  return defaultInstance;
}
function rateLimit(fn, signal) {
  return getRateLimiter().schedule(fn, signal);
}
function setRateLimiter(limiter) {
  defaultInstance = limiter;
}
function resetRateLimiter() {
  defaultInstance = null;
}

// src/search-extract/core/engine.ts
init_errors();

// src/search-extract/search/brave.ts
import { z as z2 } from "zod";

// src/search-extract/search/create-search-provider.ts
init_errors();
function createSearchProvider(options) {
  return async (query, signal) => {
    const raw = await options.execute(query, signal);
    const parsed = tryParseJson(raw);
    const result = options.responseSchema.safeParse(parsed);
    if (!result.success) {
      if (options.throwOnParseError) {
        throw new SearchProviderResponseError(
          options.providerName,
          result.error.message
        );
      }
      return [];
    }
    return options.mapResults(result.data);
  };
}
async function formatSearchHttpError(providerName, response) {
  const body = await readResponseText(response);
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  return `${providerName} search failed with HTTP ${response.status}${statusText}${body ? `: ${body}` : ""}`;
}
async function readResponseText(response) {
  try {
    const text = await response.text();
    return truncateForError(text.trim());
  } catch {
    return "";
  }
}
function truncateForError(text) {
  const maxLength = 300;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// src/search-extract/search/brave.ts
init_errors();
var API_BASE_URL = "https://api.search.brave.com/res/v1";
var BraveWebResponseSchema = z2.object({
  web: z2.object({
    results: z2.array(searchResultSchema).optional()
  }).optional()
});
function createBraveSearch(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";
  if (!apiKey) {
  }
  return createSearchProvider({
    providerName: "Brave",
    responseSchema: BraveWebResponseSchema,
    throwOnParseError: true,
    mapResults: (r) => r.web?.results ?? [],
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "Brave",
          "requires a valid apiKey"
        );
      }
      const url = new URL(`${API_BASE_URL}/web/search`);
      url.searchParams.set("q", query);
      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: "application/json",
          "x-subscription-token": apiKey
        },
        signal: abortSignal
      });
      if (!response.ok) {
        const errText = await formatSearchHttpError("Brave", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Brave", status, bodyPart);
      }
      return await response.text();
    }
  });
}

// src/search-extract/search/exa.ts
import { z as z3 } from "zod";
init_errors();
var API_BASE_URL2 = "https://api.exa.ai";
var ExaWebResponseSchema = z3.object({
  results: z3.array(
    z3.object({
      title: z3.string(),
      url: z3.string(),
      text: z3.string()
    })
  )
});
function createExaSearch(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";
  return createSearchProvider({
    providerName: "Exa",
    responseSchema: ExaWebResponseSchema,
    throwOnParseError: true,
    mapResults: (r) => r.results.map((r2) => ({
      title: r2.title,
      url: r2.url,
      description: r2.text
    })),
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "Exa",
          "requires a valid apiKey"
        );
      }
      const response = await fetchImpl(`${API_BASE_URL2}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        body: JSON.stringify({
          query,
          type: "auto",
          numResults: 5,
          contents: { text: true }
        }),
        signal: abortSignal
      });
      if (!response.ok) {
        const errText = await formatSearchHttpError("Exa", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Exa", status, bodyPart);
      }
      return await response.text();
    }
  });
}

// src/search-extract/search/serper.ts
import { z as z4 } from "zod";
init_errors();
var API_BASE_URL3 = "https://google.serper.dev";
var SerperWebResponseSchema = z4.object({
  organic: z4.array(
    z4.object({
      title: z4.string(),
      link: z4.string(),
      snippet: z4.string().optional()
    })
  ).optional()
});
function createSerperSearch(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";
  return createSearchProvider({
    providerName: "Serper",
    responseSchema: SerperWebResponseSchema,
    throwOnParseError: true,
    mapResults: (r) => (r.organic ?? []).map((r2) => ({
      title: r2.title,
      url: r2.link,
      description: r2.snippet ?? ""
    })),
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "Serper",
          "requires a valid apiKey"
        );
      }
      const response = await fetchImpl(`${API_BASE_URL3}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey
        },
        body: JSON.stringify({ q: query }),
        signal: abortSignal
      });
      if (!response.ok) {
        const errText = await formatSearchHttpError("Serper", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Serper", status, bodyPart);
      }
      return await response.text();
    }
  });
}

// src/search-extract/search/tavily.ts
import { z as z5 } from "zod";
init_errors();
var API_BASE_URL4 = "https://api.tavily.com";
var TavilyWebResponseSchema = z5.object({
  results: z5.array(
    z5.object({
      title: z5.string(),
      url: z5.string(),
      content: z5.string()
    })
  )
});
function createTavilySearch(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";
  return createSearchProvider({
    providerName: "Tavily",
    responseSchema: TavilyWebResponseSchema,
    throwOnParseError: true,
    mapResults: (r) => r.results.map((r2) => ({
      title: r2.title,
      url: r2.url,
      description: r2.content
    })),
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "Tavily",
          "requires a valid apiKey"
        );
      }
      const response = await fetchImpl(`${API_BASE_URL4}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 5
        }),
        signal: abortSignal
      });
      if (!response.ok) {
        const errText = await formatSearchHttpError("Tavily", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("Tavily", status, bodyPart);
      }
      return await response.text();
    }
  });
}

// src/search-extract/search/searxng.ts
import { z as z6 } from "zod";
init_errors();
var DEFAULT_BASE_URL = "http://localhost:8080";
var SearXNGResponseSchema = z6.object({
  results: z6.array(
    z6.object({
      title: z6.string(),
      url: z6.string(),
      content: z6.string()
    })
  )
});
function createSearXNGFetchSearch(config = {}) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  return createSearchProvider({
    providerName: "SearXNG",
    responseSchema: SearXNGResponseSchema,
    throwOnParseError: true,
    mapResults: (r) => r.results.map((r2) => ({
      title: r2.title,
      url: r2.url,
      description: r2.content
    })),
    execute: async (query, abortSignal) => {
      const baseUrl = config.baseUrl?.trim() || DEFAULT_BASE_URL;
      if (!baseUrl) {
        throw new SearchProviderConfigError(
          "SearXNG",
          "requires a valid baseUrl"
        );
      }
      const url = new URL("/search", baseUrl);
      url.searchParams.set("format", "json");
      url.searchParams.set("q", query);
      const response = await fetchImpl(url.toString(), {
        headers: { accept: "application/json" },
        signal: abortSignal
      });
      if (!response.ok) {
        const errText = await formatSearchHttpError("SearXNG", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("SearXNG", status, bodyPart);
      }
      return await response.text();
    }
  });
}

// src/search-extract/search/youtube.ts
import { z as z7 } from "zod";
init_errors();
var API_BASE_URL5 = "https://www.googleapis.com/youtube/v3";
var DEFAULT_MAX_RESULTS = 5;
var MAX_RESULTS = 50;
var YouTubeSearchResponseSchema = z7.object({
  items: z7.array(
    z7.object({
      id: z7.object({
        videoId: z7.string().optional()
      }).optional(),
      snippet: z7.object({
        title: z7.string(),
        description: z7.string().optional(),
        channelTitle: z7.string().optional(),
        publishedAt: z7.string().optional()
      })
    })
  ).optional()
});
function createYouTubeSearch(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";
  const maxResults = normalizeMaxResults(config.maxResults);
  return createSearchProvider({
    providerName: "YouTube",
    responseSchema: YouTubeSearchResponseSchema,
    throwOnParseError: true,
    mapResults: (response) => (response.items ?? []).flatMap((item) => {
      const videoId = item.id?.videoId;
      if (!videoId) return [];
      return [
        {
          title: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          description: formatYouTubeDescription(item, videoId)
        }
      ];
    }),
    execute: async (query, abortSignal) => {
      if (!apiKey) {
        throw new SearchProviderConfigError(
          "YouTube",
          "requires a valid apiKey"
        );
      }
      const url = new URL(`${API_BASE_URL5}/search`);
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", String(maxResults));
      url.searchParams.set("key", apiKey);
      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: "application/json"
        },
        signal: abortSignal
      });
      if (!response.ok) {
        const errText = await formatSearchHttpError("YouTube", response);
        const match = errText.match(/HTTP (\d+)/);
        const status = match ? parseInt(match[1], 10) : 0;
        const bodyPart = errText.replace(/^.*?: /, "");
        throw new SearchProviderError("YouTube", status, bodyPart);
      }
      return await response.text();
    }
  });
}
function normalizeMaxResults(maxResults) {
  if (!Number.isFinite(maxResults)) return DEFAULT_MAX_RESULTS;
  return Math.min(
    MAX_RESULTS,
    Math.max(1, Math.trunc(maxResults ?? DEFAULT_MAX_RESULTS))
  );
}
function formatYouTubeDescription(item, videoId) {
  const parts = [`Video ID: ${videoId}`];
  if (item.snippet.channelTitle) {
    parts.push(`Channel: ${item.snippet.channelTitle}`);
  }
  if (item.snippet.publishedAt) {
    parts.push(`Published: ${item.snippet.publishedAt}`);
  }
  if (item.snippet.description) {
    parts.push(item.snippet.description);
  }
  return parts.join("\n");
}

// src/search-extract/search/aggregate.ts
var TRACKING_PARAMS = /* @__PURE__ */ new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_eid"
]);
function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hostname = url.hostname.toLowerCase();
  url.username = "";
  url.password = "";
  url.hash = "";
  const toDelete = [];
  url.searchParams.forEach((_, key) => {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      toDelete.push(key);
    }
  });
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;
  return url.toString();
}
var DEFAULT_AGGREGATE_NUM_RESULTS = 20;
function mergeResults(engineResults, numResults = DEFAULT_AGGREGATE_NUM_RESULTS) {
  const groups = /* @__PURE__ */ new Map();
  for (const results of engineResults) {
    const engineSeen = /* @__PURE__ */ new Set();
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      let normalizedUrl;
      try {
        normalizedUrl = normalizeUrl(result.url);
      } catch {
        continue;
      }
      if (engineSeen.has(normalizedUrl)) continue;
      engineSeen.add(normalizedUrl);
      const position = i + 1;
      const existing = groups.get(normalizedUrl);
      if (existing) {
        existing.frequency += 1;
        if (position < existing.bestPosition) {
          existing.bestPosition = position;
        }
        if (result.title.length > existing.title.length) {
          existing.title = result.title;
        }
        const existingDescLen = existing.description.length;
        if (result.description.length > existingDescLen) {
          existing.description = result.description;
        }
        if (result.snippet && result.snippet.length > (existing.snippet?.length ?? 0)) {
          existing.snippet = result.snippet;
        }
      } else {
        groups.set(normalizedUrl, {
          url: result.url,
          title: result.title,
          description: result.description,
          snippet: result.snippet,
          frequency: 1,
          bestPosition: position
        });
      }
    }
  }
  const merged = Array.from(groups.values());
  merged.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return a.bestPosition - b.bestPosition;
  });
  const limit = Number.isFinite(numResults) ? Math.max(0, Math.floor(numResults)) : DEFAULT_AGGREGATE_NUM_RESULTS;
  return merged.slice(0, limit);
}

// src/search-extract/core/engine.ts
function getSearchFn(config, provider) {
  const fetchImpl = config.fetch;
  const providers = config.searchProviders ?? {};
  switch (provider) {
    case "brave": {
      const braveConfig = providers.brave;
      if (!braveConfig) {
        throw new SearchProviderConfigError("Brave", "is not configured");
      }
      return createBraveSearch({ ...braveConfig, fetch: braveConfig.fetch ?? fetchImpl });
    }
    case "exa": {
      const exaConfig = providers.exa;
      if (!exaConfig) {
        throw new SearchProviderConfigError("Exa", "is not configured");
      }
      return createExaSearch({ ...exaConfig, fetch: exaConfig.fetch ?? fetchImpl });
    }
    case "serper": {
      const serperConfig = providers.serper;
      if (!serperConfig) {
        throw new SearchProviderConfigError("Serper", "is not configured");
      }
      return createSerperSearch({ ...serperConfig, fetch: serperConfig.fetch ?? fetchImpl });
    }
    case "tavily": {
      const tavilyConfig = providers.tavily;
      if (!tavilyConfig) {
        throw new SearchProviderConfigError("Tavily", "is not configured");
      }
      return createTavilySearch({ ...tavilyConfig, fetch: tavilyConfig.fetch ?? fetchImpl });
    }
    case "searxng": {
      const searxngConfig = providers.searxng;
      if (!searxngConfig) {
        throw new SearchProviderConfigError("SearXNG", "is not configured");
      }
      return createSearXNGFetchSearch({ ...searxngConfig, fetch: searxngConfig.fetch ?? fetchImpl });
    }
    case "youtube": {
      const youtubeConfig = providers.youtube;
      if (!youtubeConfig) {
        throw new SearchProviderConfigError("YouTube", "is not configured");
      }
      return createYouTubeSearch({ ...youtubeConfig, fetch: youtubeConfig.fetch ?? fetchImpl });
    }
    case "aggregate": {
      return createAggregateSearchFn(config);
    }
  }
}
function createAggregateSearchFn(config) {
  const perEngineFns = [];
  for (const name of AGGREGATABLE_PROVIDER_NAMES) {
    try {
      perEngineFns.push(getSearchFn(config, name));
    } catch {
    }
  }
  return async (query, signal) => {
    if (perEngineFns.length === 0) {
      throw new SearchProviderConfigError(
        "Aggregate",
        "requires at least one underlying search provider to be configured"
      );
    }
    const settled = await Promise.allSettled(
      perEngineFns.map(
        (fn) => rateLimit(() => fn(query, signal), signal)
      )
    );
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const engineResults = [];
    const errors = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        engineResults.push(result.value);
      } else {
        errors.push(result.reason);
      }
    }
    if (engineResults.length === 0 && errors.length > 0) {
      throw new AggregateSearchError(
        errors,
        `Aggregate search failed: all underlying providers failed for query "${query}"`
      );
    }
    const merged = mergeResults(engineResults, DEFAULT_AGGREGATE_NUM_RESULTS);
    return merged;
  };
}
function getExtractDeps(config) {
  return {
    fetch: config.fetch,
    pageLoader: config.pageLoader,
    summarizer: config.summarizer,
    extractors: config.extractors
  };
}
function createSearchExtractEngine(config) {
  return {
    async search(provider, query, options) {
      const searchFn = getSearchFn(config, provider);
      if (provider === "aggregate") {
        return searchFn(query, options?.signal);
      }
      return rateLimit(() => searchFn(query, options?.signal), options?.signal);
    },
    async searchAll(query, options) {
      const requestedProviders = options?.providers ?? [...AGGREGATABLE_PROVIDER_NAMES];
      const enabledProviders = [];
      for (const name of requestedProviders) {
        try {
          const fn = getSearchFn(config, name);
          enabledProviders.push({ name, fn });
        } catch {
        }
      }
      if (enabledProviders.length === 0) {
        return [];
      }
      const allResults = await Promise.allSettled(
        enabledProviders.map(
          ({ name, fn }) => rateLimit(() => fn(query, options?.signal), options?.signal).then(
            (results) => ({ name, results })
          )
        )
      );
      const merged = [];
      const errors = [];
      for (const result of allResults) {
        if (result.status === "fulfilled") {
          merged.push(...result.value.results);
        } else {
          errors.push(result.reason);
        }
      }
      if (merged.length === 0 && errors.length > 0 && !options?.partial) {
        throw new AggregateSearchError(
          errors,
          `All search providers failed for query "${query}"`
        );
      }
      return merged;
    },
    async extract(url, options) {
      const { extractPage: extractPage2 } = await Promise.resolve().then(() => (init_extract_page(), extract_page_exports));
      return extractPage2(url, options, getExtractDeps(config));
    }
  };
}

// src/search-extract/search/format.ts
function formatSearchResults(results) {
  if (results.length === 0) return "No results found.";
  return results.map((r) => `${r.title}: ${r.url}
${r.description}`).join("\n-\n");
}

// src/search-extract/youtube-subtitles.ts
import { z as z8 } from "zod";
var YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
var CaptionNameSchema = z8.object({
  simpleText: z8.string().optional(),
  runs: z8.array(
    z8.object({
      text: z8.string()
    })
  ).optional()
}).optional();
var CaptionTrackSchema = z8.object({
  baseUrl: z8.string(),
  languageCode: z8.string(),
  name: CaptionNameSchema,
  kind: z8.string().optional(),
  vssId: z8.string().optional(),
  isTranslatable: z8.boolean().optional()
});
var PlayerResponseSchema = z8.object({
  captions: z8.object({
    playerCaptionsTracklistRenderer: z8.object({
      captionTracks: z8.array(CaptionTrackSchema).optional()
    }).optional()
  }).optional()
});
var Json3TranscriptSchema = z8.object({
  events: z8.array(
    z8.object({
      tStartMs: z8.number().optional(),
      dDurationMs: z8.number().optional(),
      segs: z8.array(
        z8.object({
          utf8: z8.string().optional()
        })
      ).optional()
    })
  ).optional()
});
async function downloadYouTubeSubtitles(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const videoId = extractYouTubeVideoId(config.videoIdOrUrl);
  const tracks = await fetchCaptionTracks({
    videoId,
    languageCode: config.languageCode,
    fetchImpl,
    signal: config.signal
  });
  if (tracks.length === 0) {
    throw new Error(`No public subtitle tracks found for YouTube video ${videoId}.`);
  }
  const track = selectCaptionTrack(
    tracks,
    config.languageCode,
    Boolean(config.preferAutoGenerated)
  );
  const cues = await fetchCaptionCues(track, fetchImpl, config.signal);
  const trackMeta = toPublicTrack(track);
  return {
    videoId,
    languageCode: trackMeta.languageCode,
    languageName: trackMeta.languageName,
    isAutoGenerated: trackMeta.isAutoGenerated,
    isTranslatable: trackMeta.isTranslatable,
    cues,
    text: cues.map((cue) => cue.text).join("\n"),
    availableTracks: tracks.map(toPublicTrack)
  };
}
function extractYouTubeVideoId(input) {
  const trimmed = input.trim();
  if (YOUTUBE_VIDEO_ID_PATTERN.test(trimmed)) return trimmed;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Expected a YouTube video URL or 11-character video ID.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (YOUTUBE_VIDEO_ID_PATTERN.test(id)) return id;
  }
  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    const watchId = url.searchParams.get("v") ?? "";
    if (YOUTUBE_VIDEO_ID_PATTERN.test(watchId)) return watchId;
    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(first ?? "") && second && YOUTUBE_VIDEO_ID_PATTERN.test(second)) {
      return second;
    }
  }
  throw new Error("Expected a YouTube video URL or 11-character video ID.");
}
async function fetchCaptionTracks({
  videoId,
  languageCode,
  fetchImpl,
  signal
}) {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("hl", languageCode?.trim() || "en");
  const response = await fetchImpl(url.toString(), {
    headers: {
      accept: "text/html,*/*"
    },
    signal
  });
  if (!response.ok) {
    throw new Error(
      `YouTube video page failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`
    );
  }
  const html = await response.text();
  const playerResponse = extractYtInitialPlayerResponse(html);
  const parsed = PlayerResponseSchema.safeParse(playerResponse);
  if (!parsed.success) {
    throw new Error("Could not parse YouTube player caption metadata.");
  }
  return parsed.data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}
function extractYtInitialPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse";
  let markerIndex = html.indexOf(marker);
  while (markerIndex >= 0) {
    const braceStart = html.indexOf("{", markerIndex + marker.length);
    if (braceStart < 0) break;
    const jsonText = readBalancedJsonObject(html, braceStart);
    if (jsonText) {
      try {
        return JSON.parse(jsonText);
      } catch {
      }
    }
    markerIndex = html.indexOf(marker, markerIndex + marker.length);
  }
  throw new Error("Could not find YouTube player metadata on the video page.");
}
function readBalancedJsonObject(input, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }
  return null;
}
function selectCaptionTrack(tracks, languageCode, preferAutoGenerated) {
  const requestedLanguage = normalizeLanguageCode(languageCode);
  const candidates = requestedLanguage ? tracks.filter(
    (track) => languageMatches(track.languageCode, requestedLanguage)
  ) : tracks;
  if (candidates.length === 0) {
    throw new Error(
      `No subtitles found for language "${languageCode}". Available languages: ${formatAvailableLanguages(tracks)}.`
    );
  }
  if (!requestedLanguage) {
    const englishCandidates = candidates.filter(
      (track) => languageMatches(track.languageCode, "en")
    );
    const englishPreferred = preferAutoGenerated ? englishCandidates.find(isAutoGeneratedTrack) : englishCandidates.find((track) => !isAutoGeneratedTrack(track));
    if (englishPreferred) return englishPreferred;
    if (englishCandidates[0]) return englishCandidates[0];
  }
  const preferred = preferAutoGenerated ? candidates.find(isAutoGeneratedTrack) : candidates.find((track) => !isAutoGeneratedTrack(track));
  if (preferred) return preferred;
  return candidates[0];
}
async function fetchCaptionCues(track, fetchImpl, signal) {
  const url = new URL(track.baseUrl);
  assertYouTubeCaptionUrl(url);
  url.searchParams.set("fmt", "json3");
  const response = await fetchImpl(url.toString(), {
    headers: {
      accept: "application/json,text/plain,*/*"
    },
    signal
  });
  if (!response.ok) {
    throw new Error(
      `YouTube subtitles failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`
    );
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      "YouTube returned an empty subtitle response. This video may require YouTube's proof-of-origin token."
    );
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("YouTube subtitles response was not valid json3.");
  }
  const parsed = Json3TranscriptSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("YouTube subtitles response did not match json3 format.");
  }
  const cues = parsed.data.events?.flatMap((event) => {
    const cueText = (event.segs ?? []).map((segment) => segment.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (!cueText) return [];
    return [
      {
        startMs: event.tStartMs ?? 0,
        durationMs: event.dDurationMs ?? 0,
        text: cueText
      }
    ];
  }) ?? [];
  if (cues.length === 0) {
    throw new Error("No subtitle cues found in YouTube subtitles response.");
  }
  return cues;
}
function assertYouTubeCaptionUrl(url) {
  const hostname = url.hostname.toLowerCase();
  const allowedHosts = /* @__PURE__ */ new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);
  if (!allowedHosts.has(hostname) || url.pathname !== "/api/timedtext") {
    throw new Error("YouTube caption metadata returned an unexpected caption URL.");
  }
}
function toPublicTrack(track) {
  return {
    languageCode: track.languageCode,
    languageName: formatCaptionName(track.name) || track.languageCode,
    isAutoGenerated: isAutoGeneratedTrack(track),
    isTranslatable: Boolean(track.isTranslatable)
  };
}
function formatCaptionName(name) {
  if (!name) return "";
  if (name.simpleText) return name.simpleText;
  return (name.runs ?? []).map((run) => run.text).join("").trim();
}
function isAutoGeneratedTrack(track) {
  return track.kind === "asr" || track.vssId?.startsWith("a.") === true;
}
function normalizeLanguageCode(languageCode) {
  const trimmed = languageCode?.trim().toLowerCase();
  return trimmed || void 0;
}
function languageMatches(candidate, requested) {
  const normalizedCandidate = candidate.toLowerCase();
  return normalizedCandidate === requested || normalizedCandidate.startsWith(`${requested}-`) || requested.startsWith(`${normalizedCandidate}-`);
}
function formatAvailableLanguages(tracks) {
  return tracks.map((track) => {
    const name = formatCaptionName(track.name);
    return name ? `${track.languageCode} (${name})` : track.languageCode;
  }).join(", ");
}

// src/search-extract/core-api.ts
init_sanitize_html();
init_page_loader();

// src/search-extract/extract/extractors/base.ts
var PageExtractor = class {
};

// src/search-extract/extract/extractors/registry.ts
var extractors = [];

// src/search-extract/extract/extractors/reddit-json-parser.ts
var MAX_BODY_LENGTH = 500;
function truncate(text) {
  if (text.length <= MAX_BODY_LENGTH) return text;
  return text.slice(0, MAX_BODY_LENGTH) + " [...]";
}
function scoreStr(n) {
  return n === 1 ? "1 pt" : `${n} pts`;
}
function renderCommentTree(comments, prefix) {
  const last = comments.length - 1;
  return comments.flatMap((comment, index) => {
    const isLast = index === last;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childPrefix = isLast ? "    " : "\u2502   ";
    const body = truncate(comment.body.replace(/\n/g, " "));
    const lines = [
      `${prefix}${connector}**${comment.author}** \xB7 ${scoreStr(comment.score)}: ${body}`
    ];
    if (comment.replies.length > 0) {
      lines.push(renderCommentTree(comment.replies, prefix + childPrefix));
    }
    return lines;
  }).join("\n");
}
function parseRedditJson(post, comments) {
  const parts = [];
  parts.push(`# ${post.title}`);
  parts.push("");
  const commentCount = post.num_comments === 1 ? "1 comment" : `${post.num_comments} comments`;
  parts.push(`> **${post.author}** \xB7 ${scoreStr(post.score)} \xB7 ${commentCount}`);
  parts.push("");
  if (post.selftext.trim()) {
    parts.push(post.selftext.trim());
    parts.push("");
  }
  if (comments.length > 0) {
    parts.push("## Comments");
    parts.push("");
    parts.push(renderCommentTree(comments, ""));
  }
  return parts.join("\n").trim();
}

// src/search-extract/extract/extractors/reddit.ts
import { load as load2 } from "cheerio";
function isRedditUrl(url) {
  const host = url.hostname;
  return host === "reddit.com" || host.endsWith(".reddit.com");
}
function toOldRedditUrl(url) {
  const u = new URL(url);
  u.hostname = "old.reddit.com";
  return u.toString();
}
function normalizeText(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function parseScore(text, fallback = 0) {
  if (!text) return fallback;
  const score = Number.parseInt(text, 10);
  return Number.isFinite(score) ? score : fallback;
}
function directCommentElements($, el) {
  return $(el).children(".child").children(".sitetable").children(".thing.comment");
}
function findPostElement($) {
  return $(
    ".thing.link, .thing.self, .thing[data-fullname^='t3_'], .thing[id^='thing_t3_']"
  ).first();
}
function findPostTitle($, postEl = findPostElement($)) {
  return normalizeText(
    postEl.find("p.title a.title, a.title").first().text() || $("p.title a.title, a.title").first().text() || $("meta[property='og:title']").attr("content") || $("title").first().text().replace(/\s*:\s*.+$/, "")
  );
}
function hasOldRedditPostContent(html) {
  const $ = load2(html);
  return findPostTitle($).length > 0 && $(".commentarea, .thing.comment").length > 0;
}
function isRedditChallengeHtml(html) {
  if (hasOldRedditPostContent(html)) return false;
  const $ = load2(html);
  const bodyText = normalizeText($("body").text()).toLowerCase();
  const hasChallengeElement = $("#challenge-form").length > 0 || $(".g-recaptcha, .h-captcha").length > 0 || $("[class*='cf-challenge']").length > 0 || $("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").length > 0;
  if (hasChallengeElement) return true;
  return [
    "captcha challenge",
    "captcha required",
    "verify you are human",
    "checking if the site connection is secure",
    "checking your browser",
    "are you a robot",
    "security check"
  ].some((marker) => bodyText.includes(marker));
}
function parseOldRedditHtml(html) {
  const $ = load2(html);
  const postEl = findPostElement($);
  const title = findPostTitle($, postEl);
  if (!title) return null;
  const author = postEl.attr("data-author") || normalizeText(postEl.find(".tagline .author").first().text());
  const score = parseScore(
    postEl.attr("data-score") || normalizeText(postEl.find(".score.unvoted").first().text())
  );
  const selftext = normalizeText(
    postEl.find(".expando .usertext-body, .entry .usertext-body, .usertext-body").first().text()
  );
  function parseComment(el) {
    const commentEl = $(el);
    const entry = commentEl.children(".entry").first();
    const cAuthor = commentEl.attr("data-author") || normalizeText(entry.find(".tagline .author").first().text());
    const cBody = normalizeText(
      entry.find(".usertext-body .md, .usertext-body").first().text()
    );
    const cScore = parseScore(
      commentEl.attr("data-score") || normalizeText(entry.find(".score.unvoted").first().text())
    );
    const replies = [];
    directCommentElements($, el).each((_, child) => {
      replies.push(parseComment(child));
    });
    return {
      author: cAuthor || "[deleted]",
      body: cBody || "[deleted]",
      score: cScore,
      created_utc: 0,
      replies
    };
  }
  const directTopLevelComments = $(
    ".commentarea > .sitetable > .thing.comment"
  );
  const topLevelComments = directTopLevelComments.length > 0 ? directTopLevelComments : $(".thing.comment").filter(
    (_, el) => $(el).parents(".thing.comment").length === 0
  );
  const comments = [];
  topLevelComments.each((_, el) => {
    comments.push(parseComment(el));
  });
  const post = {
    title,
    selftext,
    author: author || "[unknown]",
    score,
    created_utc: 0,
    num_comments: comments.length
  };
  return parseRedditJson(post, comments);
}
var RedditExtractor = class extends PageExtractor {
  canHandle(url) {
    return isRedditUrl(url);
  }
  async extract(input) {
    if (input.url.pathname.endsWith(".json")) return null;
    if (!input.loader.renderHtml) return null;
    const html = await input.loader.renderHtml(toOldRedditUrl(input.url.href), {});
    if (!html) return null;
    const content = parseOldRedditHtml(html);
    if (!content) return null;
    return { content };
  }
};

// src/search-extract/extract/extractors/amazon.ts
import { load as load3 } from "cheerio";
var AMAZON_TLDS = [
  "amazon.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.nl",
  "amazon.se",
  "amazon.pl",
  "amazon.be",
  "amazon.com.be",
  "amazon.co.jp",
  "amazon.jp",
  "amazon.ca",
  "amazon.com.au",
  "amazon.com.br",
  "amazon.com.mx",
  "amazon.in",
  "amazon.sg",
  "amazon.ae",
  "amazon.sa",
  "amazon.com.tr",
  "amazon.eg",
  "amazon.cn"
];
function isAmazonUrl(url) {
  const host = url.hostname;
  return AMAZON_TLDS.some((tld) => host === tld || host.endsWith(`.${tld}`)) && /\/dp\/[A-Z0-9]{10}/i.test(url.href);
}
function normalizeText2(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function isAmazonChallengePage(html) {
  const $ = load3(html);
  const bodyText = normalizeText2($("body").text()).toLowerCase();
  if ($("#productTitle").length > 0) return false;
  return [
    "enter the characters you see below",
    "sorry, we just need to make sure you're not a robot",
    "type the characters you see in this image",
    "captcha",
    "are you a robot",
    "sorry, something went wrong"
  ].some((marker) => bodyText.includes(marker));
}
function extractPrice($) {
  const priceEl = $(
    "#priceblock_ourprice, #priceblock_dealprice, #priceblock_saleprice, .apexPriceToPay .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen, .a-price .a-offscreen"
  ).first();
  if (priceEl.length) return normalizeText2(priceEl.text());
  const whole = $("span.a-price-whole").first().text().replace(/\.$/, "").trim();
  const fraction = $("span.a-price-fraction").first().text().trim();
  const symbol = $("span.a-price-symbol").first().text().trim();
  if (whole && fraction) return `${symbol}${whole}.${fraction}`;
  return null;
}
function extractRating($) {
  const iconAlt = $("#acrPopover span.a-icon-alt").first().text().trim();
  if (iconAlt) return iconAlt;
  const reviewStars = $('[data-automation-id="reviews-stars"] span').first().text().trim();
  if (reviewStars) return reviewStars;
  return null;
}
function extractReviewCount($) {
  const el = $("#acrCustomerReviewText").first();
  return el.length ? normalizeText2(el.text()) : null;
}
function extractBrand($) {
  const byline = $("a#bylineInfo").first().text().trim();
  if (!byline) return null;
  return byline.replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "").trim();
}
function extractBreadcrumbs($) {
  return [
    ...$("#wayfinding-breadcrumbs_container ul li a").map(
      (_, el) => normalizeText2($(el).text())
    )
  ].filter(Boolean);
}
function extractBullets($) {
  return [
    ...$(
      "#feature-bullets ul.a-unordered-list li span.a-list-item"
    ).map((_, el) => normalizeText2($(el).text()))
  ].filter(Boolean);
}
function extractInlineSpecs($) {
  const specs = {};
  $("#productOverview_feature_div table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length >= 2) {
      const key = normalizeText2($(cells[0]).text());
      const value = normalizeText2($(cells[1]).text());
      if (key && value) specs[key] = value;
    }
  });
  return specs;
}
var EXPANDER_NOISE = [
  "Brief content visible, double tap to read full content.",
  "Full content visible, double tap to read brief content.",
  "Read more",
  "Read less"
];
function cleanReviewBody(text) {
  let cleaned = text;
  for (const noise of EXPANDER_NOISE) {
    cleaned = cleaned.split(noise).join("");
  }
  return normalizeText2(cleaned);
}
function extractReviews($, maxReviews = 10) {
  const reviews = [];
  $('[data-hook="review"]').each((_, el) => {
    if (reviews.length >= maxReviews) return;
    const review = $(el);
    const rating = review.find('[data-hook="review-star-rating"] span.a-icon-alt').first().text().trim() || null;
    const title = normalizeText2(
      review.find('[data-hook="reviewTitle"], h5[data-hook="reviewTitle"]').first().text()
    ) || null;
    const author = normalizeText2(review.find(".a-profile-name").first().text()) || null;
    const date = normalizeText2(
      review.find('[data-hook="review-date"]').first().text()
    ) || null;
    const rawBody = review.find('[data-hook="reviewText"]').first().text() || "";
    const body = cleanReviewBody(rawBody) || null;
    const helpful = normalizeText2(
      review.find('[data-hook="helpful-vote-statement"]').first().text()
    ) || null;
    reviews.push({ rating, title, author, date, body, helpful });
  });
  return reviews;
}
function isUnavailable($) {
  if ($("#outOfStock").length > 0) return true;
  const availabilityText = normalizeText2(
    $("#availability .primary-availability-message").first().text()
  ).toLowerCase();
  if (availabilityText.includes("currently unavailable")) return true;
  return false;
}
function parseAmazonProductHtml(html) {
  const $ = load3(html);
  if (isUnavailable($)) return "Currently unavailable.";
  const title = normalizeText2(
    $("#productTitle").first().text() || $("[data-automation-id='title']").first().text() || $("meta[property='og:title']").attr("content") || ""
  );
  if (!title) return null;
  const price = extractPrice($);
  const rating = extractRating($);
  const reviewCount = extractReviewCount($);
  const brand = extractBrand($);
  const breadcrumbs = extractBreadcrumbs($);
  const bullets = extractBullets($);
  const specs = extractInlineSpecs($);
  const reviews = extractReviews($);
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  if (brand) lines.push(`**Brand:** ${brand}`);
  if (price) lines.push(`**Price:** ${price}`);
  if (rating) lines.push(`**Rating:** ${rating}`);
  if (reviewCount) lines.push(`**Reviews:** ${reviewCount}`);
  if (breadcrumbs.length > 0) {
    lines.push(`**Category:** ${breadcrumbs.join(" > ")}`);
  }
  lines.push("");
  const specEntries = Object.entries(specs);
  if (specEntries.length > 0) {
    lines.push("## Specifications");
    lines.push("");
    for (const [key, value] of specEntries) {
      lines.push(`- **${key}** ${value}`);
    }
    lines.push("");
  }
  if (bullets.length > 0) {
    lines.push("## About This Item");
    lines.push("");
    for (const bullet of bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }
  if (reviews.length > 0) {
    lines.push("## Customer Reviews");
    lines.push("");
    for (const review of reviews) {
      const parts = [];
      if (review.body) parts.push(review.body);
      if (review.helpful) parts.push(`*${review.helpful}*`);
      if (parts.length > 0) lines.push(parts.join("\n\n"));
      lines.push("---");
      lines.push("");
    }
  }
  return lines.join("\n");
}
var AmazonExtractor = class extends PageExtractor {
  canHandle(url) {
    return isAmazonUrl(url);
  }
  async extract(input) {
    if (!input.loader.renderHtml) return null;
    const html = await input.loader.renderHtml(input.url.href, {});
    if (!html) return null;
    const content = parseAmazonProductHtml(html);
    if (!content) return null;
    return { content };
  }
};

// src/search-extract/extract/extractors/shopify.ts
import { load as load4 } from "cheerio";
function isShopifyUrl(url) {
  const host = url.hostname;
  return host === "myshopify.com" || host.endsWith(".myshopify.com");
}
function isProductPageUrl(url) {
  const path = url.pathname;
  return /\/products\/[a-z0-9][a-z0-9-]+[a-z0-9]$/i.test(path);
}
function toApiUrl(url, ext) {
  const u = new URL(url);
  u.pathname = u.pathname.endsWith(".json") || u.pathname.endsWith(".js") ? u.pathname.replace(/\.(json|js)$/, ext) : `${u.pathname}${ext}`;
  u.search = "";
  u.hash = "";
  return u.toString();
}
var CURRENCY_SYMBOLS = {
  USD: "$",
  GBP: "\xA3",
  EUR: "\u20AC",
  JPY: "\xA5",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  NZD: "NZ$",
  BRL: "R$",
  INR: "\u20B9",
  KRW: "\u20A9",
  CNY: "\xA5",
  PLN: "z\u0142",
  SGD: "S$",
  HKD: "HK$"
};
function formatCurrency(code, amount) {
  if (!code) return amount;
  const sym = CURRENCY_SYMBOLS[code];
  return sym ? `${sym}${amount}` : `${amount} ${code}`;
}
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function formatCentsPrice(cents, currency) {
  const amount = (cents / 100).toFixed(2);
  return formatCurrency(currency, amount);
}
function extractCurrency(jsonData) {
  if (!jsonData?.product) return void 0;
  const variants = jsonData.product.variants;
  return variants?.[0]?.price_currency;
}
function formatJsProduct(data, currency) {
  if (!data?.id || !data?.title) return null;
  const lines = [];
  const title = String(data.title);
  const vendor = data.vendor ? String(data.vendor) : null;
  const productType = data.type ? String(data.type) : null;
  const description = data.description ? stripHtml(String(data.description)) : null;
  const rawOptions = data.options ?? [];
  const options = Array.isArray(rawOptions) ? rawOptions.filter(
    (o) => o != null && typeof o === "object" && typeof o.name === "string" && Array.isArray(o.values) && o.values.every((v) => typeof v === "string")
  ) : [];
  const rawTags = data.tags;
  const tags = Array.isArray(rawTags) ? rawTags.filter((t) => typeof t === "string") : typeof rawTags === "string" ? rawTags.split(", ") : null;
  const rawPriceMin = data.price_min;
  const priceMin = typeof rawPriceMin === "number" && Number.isFinite(rawPriceMin) ? rawPriceMin : void 0;
  const rawPriceMax = data.price_max;
  const priceMax = typeof rawPriceMax === "number" && Number.isFinite(rawPriceMax) ? rawPriceMax : void 0;
  const rawCompareAtPriceMax = data.compare_at_price_max;
  const compareAtPriceMax = typeof rawCompareAtPriceMax === "number" && Number.isFinite(rawCompareAtPriceMax) ? rawCompareAtPriceMax : void 0;
  lines.push(`# ${title}`);
  lines.push("");
  if (vendor) lines.push(`**Vendor:** ${vendor}`);
  if (productType) lines.push(`**Type:** ${productType}`);
  if (priceMin != null) {
    const pMin = formatCentsPrice(priceMin, currency);
    const pMax = priceMax != null ? formatCentsPrice(priceMax, currency) : null;
    const priceStr = pMax && pMin !== pMax ? `${pMin} \u2013 ${pMax}` : pMin;
    lines.push(`**Price:** ${priceStr}`);
    if (compareAtPriceMax != null && compareAtPriceMax > (priceMax ?? priceMin)) {
      lines.push(`**Was:** ${formatCentsPrice(compareAtPriceMax, currency)}`);
    }
  }
  lines.push("");
  if (description) {
    lines.push(description);
    lines.push("");
  }
  if (options.length > 0) {
    lines.push("## Options");
    lines.push("");
    for (const option of options) {
      lines.push(`- **${option.name}:** ${option.values.join(", ")}`);
    }
    lines.push("");
  }
  if (tags) {
    const tagList = tags.filter(Boolean).filter((t) => !t.startsWith("category-") && !t.startsWith("pri-"));
    if (tagList.length > 0 && tagList.length <= 20) {
      lines.push(`**Tags:** ${tagList.join(", ")}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
function formatJsonProduct(data) {
  const product = data.product;
  if (!product?.id || !product?.title) return null;
  const lines = [];
  const title = String(product.title);
  const vendor = product.vendor ? String(product.vendor) : null;
  const productType = product.product_type ? String(product.product_type) : null;
  const bodyHtml = product.body_html ? String(product.body_html) : null;
  const description = bodyHtml ? stripHtml(bodyHtml) : null;
  const rawOptions = product.options ?? [];
  const options = Array.isArray(rawOptions) ? rawOptions.filter(
    (o) => o != null && typeof o === "object" && typeof o.name === "string" && Array.isArray(o.values) && o.values.every((v) => typeof v === "string")
  ) : [];
  const rawTags = product.tags ? String(product.tags) : null;
  const rawVariants = product.variants ?? [];
  const variants = Array.isArray(rawVariants) ? rawVariants.filter(
    (v) => v != null && typeof v === "object" && typeof v.price === "string"
  ) : [];
  lines.push(`# ${title}`);
  lines.push("");
  if (vendor) lines.push(`**Vendor:** ${vendor}`);
  if (productType) lines.push(`**Type:** ${productType}`);
  if (variants.length > 0) {
    const currency = variants[0].price_currency;
    const prices = [
      ...new Set(
        variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n))
      )
    ];
    if (prices.length === 0) {
      lines.push("");
    } else {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const priceStr = min === max ? formatCurrency(currency, min.toFixed(2)) : `${formatCurrency(currency, min.toFixed(2))} \u2013 ${formatCurrency(currency, max.toFixed(2))}`;
      lines.push(`**Price:** ${priceStr}`);
      const hasDiscount = variants.some(
        (v) => v.compare_at_price && Number.isFinite(Number(v.compare_at_price)) && Number.isFinite(Number(v.price)) && Number(v.compare_at_price) > Number(v.price)
      );
      if (hasDiscount) {
        const comparePrices = variants.map((v) => v.compare_at_price).filter((p) => p != null).map(Number).filter(Number.isFinite);
        if (comparePrices.length > 0) {
          const maxCompare = Math.max(...comparePrices);
          if (maxCompare > max) {
            lines.push(`**Was:** ${formatCurrency(currency, maxCompare.toFixed(2))}`);
          }
        }
      }
    }
  }
  lines.push("");
  if (description) {
    lines.push(description);
    lines.push("");
  }
  if (options.length > 0) {
    lines.push("## Options");
    lines.push("");
    for (const option of options) {
      lines.push(`- **${option.name}:** ${option.values.join(", ")}`);
    }
    lines.push("");
  }
  if (rawTags) {
    const tagList = rawTags.split(", ").filter(Boolean).filter((t) => !t.startsWith("category-") && !t.startsWith("pri-"));
    if (tagList.length > 0 && tagList.length <= 20) {
      lines.push(`**Tags:** ${tagList.join(", ")}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
function parseJsonFromHtml(html) {
  const $ = load4(html);
  let jsonText = $("pre").first().text();
  if (!jsonText) jsonText = $("body").text();
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
var ShopifyExtractor = class extends PageExtractor {
  canHandle(url) {
    return isShopifyUrl(url) && isProductPageUrl(url);
  }
  async extract(input) {
    if (!input.loader.renderHtml) return null;
    const urlStr = input.url.href;
    const [jsHtml, jsonHtml] = await Promise.all([
      input.loader.renderHtml(toApiUrl(urlStr, ".js"), {}),
      input.loader.renderHtml(toApiUrl(urlStr, ".json"), {})
    ]);
    const jsData = jsHtml ? parseJsonFromHtml(jsHtml) : null;
    const jsonData = jsonHtml ? parseJsonFromHtml(jsonHtml) : null;
    if (jsData && jsData.id && jsData.title) {
      const currency = extractCurrency(jsonData);
      const content = formatJsProduct(jsData, currency);
      if (content) return { content };
    }
    if (jsonData && jsonData.product) {
      const product = jsonData.product;
      if (product?.id && product?.title) {
        const content = formatJsonProduct(jsonData);
        if (content) return { content };
      }
    }
    return null;
  }
};

// src/search-extract/extract/extractors/trustpilot.ts
import { load as load5 } from "cheerio";
var REVIEW_CARD_SELECTORS = [
  "article[data-service-review-card-paper]",
  "section[data-service-review-card-paper]",
  "div[data-service-review-card-paper]",
  "article[data-review-id]",
  "section[data-review-id]",
  "div[data-review-id]",
  "[data-testid='review-card']",
  "article[class*='reviewCard']",
  "section[class*='reviewCard']",
  "div[class*='reviewCard']"
];
var COMPANY_NAME_SUFFIX = /\s+Reviews?(?:\s+[\d,]+)?$/i;
function isTrustpilotHost(hostname) {
  return hostname === "trustpilot.com" || hostname.endsWith(".trustpilot.com");
}
function isTrustpilotUrl(url) {
  return isTrustpilotHost(url.hostname);
}
function isTrustpilotReviewPageUrl(url) {
  if (!isTrustpilotUrl(url)) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length >= 2 && (segments[0] === "review" || segments[0] === "reviews");
}
function normalizeText3(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeMarkdown(text) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}
function firstNonEmpty(...values) {
  for (const value of values) {
    if (value && value.trim()) return normalizeText3(value);
  }
  return null;
}
function unique(values) {
  return [...new Set(values.map(normalizeText3).filter(Boolean))];
}
function metaContent($, names) {
  for (const name of names) {
    const attr = name.startsWith("og:") ? "property" : "name";
    const value = $(`meta[${attr}="${name}"]`).attr("content");
    if (value && value.trim()) return normalizeText3(value);
  }
  return null;
}
function domainFromUrl(url) {
  if (!url) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "review" || !segments[1]) return null;
  try {
    return decodeURIComponent(segments[1]);
  } catch {
    return segments[1];
  }
}
function cleanCompanyName(value) {
  if (!value) return null;
  return normalizeText3(value).replace(/\s+\|\s+Read Customer Service Reviews.*$/i, "").replace(COMPANY_NAME_SUFFIX, "").trim() || null;
}
function extractCompanyName($, url) {
  const ogTitle = cleanCompanyName(metaContent($, ["og:title", "twitter:title"]));
  if (ogTitle) return ogTitle;
  const h1 = cleanCompanyName($("h1").first().text());
  if (h1) return h1;
  return domainFromUrl(url);
}
function extractProfileStatus($) {
  const bodyText = normalizeText3($("body").text());
  const claimed = bodyText.match(
    /Claimed profile(?:\s*[\u2022\u2013-]\s*[A-Za-z][A-Za-z\s]*?\d{4})?(?=\s+(?:[0-5]\.\d|\d+\s+reviews?|TrustScore|Based\s+on)|$)/i
  )?.[0];
  if (claimed) return normalizeText3(claimed);
  if (/Unclaimed profile/i.test(bodyText)) return "Unclaimed profile";
  return null;
}
function extractTrustScore($, jsonLd) {
  const selectorValue = firstNonEmpty(
    $("[data-rating-typography]").first().text(),
    $("[data-testid='trustscore']").first().text(),
    $("[data-testid='trust-score']").first().text(),
    $("[class*='trustScore'] [class*='typography']").first().text()
  );
  const selectorScore = selectorValue?.match(/\b([0-5](?:\.\d+)?)\b/)?.[1];
  if (selectorScore) return selectorScore;
  const ldScore = jsonLd.trustScore?.match(/\b([0-5](?:\.\d+)?)\b/)?.[1];
  if (ldScore) return ldScore;
  const bodyText = normalizeText3($("body").text());
  return bodyText.match(/\bTrustScore\s+([0-5](?:\.\d+)?)\b/i)?.[1] ?? null;
}
function extractStarRating($, jsonLd) {
  const imgAlt = $("img[alt*='TrustScore' i], img[alt*='out of 5' i]").toArray().map((el) => normalizeText3($(el).attr("alt") || "")).find((text) => /TrustScore|out of 5/i.test(text));
  if (imgAlt) {
    const match = imgAlt.match(/([0-5](?:\.\d+)?)\s+out of\s+5/i);
    if (match) return `${match[1]} out of 5`;
  }
  if (jsonLd.starRating) return jsonLd.starRating;
  return null;
}
function extractRatingLabel($) {
  const candidates = $("[data-rating-label], [data-testid='trustscore-label'], [class*='trustScore'] p, [class*='trustScore'] span").toArray().map((el) => normalizeText3($(el).text())).filter((text) => /^(Excellent|Great|Average|Poor|Bad)$/i.test(text));
  if (candidates.length > 0) return candidates[0];
  const lines = normalizeText3($("body").text()).split(/\s*\n\s*|\s{2,}/);
  return lines.find((line) => /^(Excellent|Great|Average|Poor|Bad)$/i.test(line)) ?? null;
}
function extractReviewCount2($, jsonLd) {
  const COUNT = String.raw`[\d,]+(?:\.\d+)?\s?[kKmM]?`;
  const selectors = [
    "[data-business-unit-review-count]",
    "[data-testid='review-count']",
    "[data-testid='reviews-count']",
    "[class*='reviewCount']"
  ];
  for (const selector of selectors) {
    const text = normalizeText3($(selector).first().text());
    const match = text.match(new RegExp(`(${COUNT})\\s+reviews?`, "i"));
    if (match) return `${normalizeText3(match[1])} reviews`;
  }
  const h1Match = normalizeText3($("h1").first().text()).match(
    new RegExp(`Reviews?\\s+(${COUNT})`, "i")
  );
  if (h1Match) return `${normalizeText3(h1Match[1])} reviews`;
  if (jsonLd.reviewCount) return `${jsonLd.reviewCount} reviews`;
  const metaDescription = metaContent($, ["og:description", "description"]);
  const metaMatch = metaDescription?.match(new RegExp(`what\\s+(${COUNT})\\s+people`, "i"));
  if (metaMatch) return `${normalizeText3(metaMatch[1])} reviews`;
  const bodyMatch = normalizeText3($("body").text()).match(
    new RegExp(`\\b(${COUNT})\\s+reviews?\\b`, "i")
  );
  return bodyMatch ? `${normalizeText3(bodyMatch[1])} reviews` : null;
}
function extractCategories($) {
  const breadcrumbCategories = $("nav a, [aria-label*='breadcrumb' i] a").toArray().map((el) => normalizeText3($(el).text())).filter((text) => text && !/^(categories|blog|log in|for businesses)$/i.test(text));
  if (breadcrumbCategories.length > 0) return unique(breadcrumbCategories);
  const categoryLinks = $("a[href^='/categories/'], a[href*='/categories/']").toArray().map((el) => normalizeText3($(el).text()));
  return unique(categoryLinks);
}
function textAfterHeading($, headingPattern) {
  const heading = $("h2, h3").filter((_, el) => headingPattern.test(normalizeText3($(el).text()))).first();
  if (!heading.length) return null;
  const container = heading.closest("section, aside, div");
  const text = normalizeText3(container.text());
  return text.replace(headingPattern, "").replace(/\bSee more\b.*$/i, "").trim() || null;
}
function extractCompanyDescription($, jsonLd) {
  const explicit = firstNonEmpty(
    $("[data-testid='business-description']").first().text(),
    $("[data-business-unit-description]").first().text(),
    textAfterHeading($, /Written by the company/i)
  );
  if (explicit) return explicit;
  return jsonLd.description;
}
function extractContactInfo($) {
  const heading = $("h2, h3").filter((_, el) => /Contact info/i.test(normalizeText3($(el).text()))).first();
  if (!heading.length) return [];
  const container = heading.closest("section, aside, div");
  const items = container.find("li, a[href^='mailto:'], a[href^='http']").toArray().map((el) => normalizeText3($(el).text() || $(el).attr("href") || "")).filter((text) => text && !/Contact info/i.test(text));
  return unique(items).slice(0, 8);
}
function extractRatingDistribution($) {
  const entries = [];
  $("[data-testid*='rating-filter'], [class*='ratingFilter'], [class*='filter'] li").each((_, el) => {
    const text = normalizeText3($(el).text());
    const match = text.match(/\b([1-5])-star\b.*?(\d+%)/i);
    if (match) entries.push({ stars: `${match[1]}-star`, percent: match[2] });
  });
  if (entries.length > 0) return dedupeRatingDistribution(entries);
  const bodyText = normalizeText3($("body").text());
  const matches = [...bodyText.matchAll(/\b([1-5])-star\s+(\d+%)/gi)];
  return dedupeRatingDistribution(
    matches.map((match) => ({ stars: `${match[1]}-star`, percent: match[2] }))
  );
}
function dedupeRatingDistribution(entries) {
  const seen = /* @__PURE__ */ new Set();
  return entries.filter((entry) => {
    const key = entry.stars;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function extractRatingFromCard($, card) {
  const explicit = firstNonEmpty(
    card.attr("data-service-review-rating"),
    card.find("[data-service-review-rating]").first().attr("data-service-review-rating"),
    card.find("[data-rating]").first().attr("data-rating")
  );
  if (explicit) {
    const match2 = explicit.match(/\b([1-5](?:\.\d+)?)\b/);
    if (match2) return `${match2[1]} out of 5`;
  }
  const alt = card.find("img[alt*='Rated' i], img[alt*='out of 5' i]").toArray().map((el) => normalizeText3($(el).attr("alt") || "")).find(Boolean);
  if (!alt) return null;
  const match = alt.match(/Rated\s+([1-5](?:\.\d+)?)\s+out of\s+5/i) ?? alt.match(/([1-5](?:\.\d+)?)\s+out of\s+5/i);
  return match ? `${match[1]} out of 5` : alt;
}
function extractAuthor($, card) {
  const authorEl = card.find("[data-consumer-name-typography], [data-consumer-name], a[href*='/users/']").first();
  const author = normalizeText3(authorEl.text());
  const authorContainer = authorEl.closest("aside, div, section");
  const authorText = normalizeText3(authorContainer.text());
  const details = author && authorText.startsWith(author) ? normalizeText3(authorText.slice(author.length)) : null;
  return {
    author: author || null,
    authorDetails: details || null
  };
}
function extractDate($, card) {
  const explicitDate = firstNonEmpty(
    card.find("time[datetime]").first().text(),
    card.find("time[datetime]").first().attr("datetime"),
    card.find("[data-service-review-date-time-ago]").first().text()
  );
  const experienceText = firstNonEmpty(
    card.find("[data-service-review-date-of-experience-typography]").first().text(),
    card.find("[data-testid='review-date-of-experience']").first().text()
  );
  const experienceDate = experienceText?.replace(/^Date of experience:\s*/i, "").trim() || null;
  return {
    date: explicitDate,
    experienceDate
  };
}
function extractStatus(card) {
  const text = normalizeText3(card.text());
  const status = text.match(/\b(Verified|Invited|Redirected|Unprompted review)\b/i)?.[1];
  return status ?? null;
}
function extractReply($, card) {
  const replyEl = card.find("[data-service-review-business-reply], [data-company-reply], section[class*='reply'], div[class*='reply']").filter((_, el) => /Reply from/i.test(normalizeText3($(el).text()))).first();
  if (!replyEl.length) return null;
  const text = normalizeText3(replyEl.text());
  const company = text.match(/Reply from\s+(.+?)(?:\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|$)/i)?.[1] ?? null;
  const date = firstNonEmpty(
    replyEl.find("time").first().text(),
    replyEl.find("time").first().attr("datetime"),
    text.match(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/)?.[0]
  );
  const textParts = replyEl.find("p, [data-service-review-business-reply-text-typography], [data-company-reply-text]").toArray().map((el) => normalizeText3($(el).text())).filter(Boolean).filter((part) => !/^Reply from\b/i.test(part)).filter((part) => !date || part !== date).filter((part) => !company || part !== company);
  const body = firstNonEmpty(
    ...textParts,
    text.replace(/Reply from\s+.+?(?=\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b|$)/i, "").replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/, "").trim()
  );
  if (!body) return null;
  return {
    company: company ? normalizeText3(company) : null,
    date,
    body
  };
}
function extractReviewCards($) {
  const selector = REVIEW_CARD_SELECTORS.join(", ");
  const seen = /* @__PURE__ */ new Set();
  const cards = [];
  $(selector).each((_, el) => {
    if (el.type !== "tag") return;
    const element = el;
    if (seen.has(element)) return;
    seen.add(element);
    const card = $(element);
    const text = normalizeText3(card.text());
    if (!text || !/(Rated\s+[1-5]|out of 5|Date of experience|Verified|Unprompted review)/i.test(text)) {
      return;
    }
    cards.push(card);
  });
  return cards;
}
function parseReviewCard($, card) {
  const title = firstNonEmpty(
    card.find("[data-service-review-title-typography]").first().text(),
    card.find("[data-testid='review-title']").first().text(),
    card.find("h2, h3").first().text(),
    card.find("a[href*='/reviews/']").first().text()
  );
  const body = firstNonEmpty(
    card.find("[data-service-review-text-typography]").first().text(),
    card.find("[data-testid='review-text']").first().text(),
    card.find("p[data-service-review-text], p").filter((_, el) => {
      const text = normalizeText3($(el).text());
      return text.length > 20 && !/^Date of experience:/i.test(text);
    }).first().text()
  );
  const rating = extractRatingFromCard($, card);
  const { author, authorDetails } = extractAuthor($, card);
  const { date, experienceDate } = extractDate($, card);
  const status = extractStatus(card);
  const reply = extractReply($, card);
  if (!title && !body && !rating) return null;
  return {
    title,
    body,
    rating,
    author,
    authorDetails,
    date,
    experienceDate,
    status,
    reply
  };
}
function parseHtmlReviews($) {
  const reviews = [];
  for (const card of extractReviewCards($)) {
    const parsed = parseReviewCard($, card);
    if (parsed) reviews.push(parsed);
  }
  return dedupeReviews(reviews);
}
function dedupeReviews(reviews) {
  const seen = /* @__PURE__ */ new Set();
  return reviews.filter((review) => {
    const key = [review.author, review.title, review.body, review.date].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asString(value) {
  if (typeof value === "string" && value.trim()) return normalizeText3(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
function parseJsonScript(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function extractJsonLdNodes(value) {
  if (Array.isArray(value)) return value.flatMap(extractJsonLdNodes);
  if (!isRecord(value)) return [];
  const graph = value["@graph"];
  const nested = graph ? extractJsonLdNodes(graph) : [];
  return [value, ...nested];
}
function parseRatingValue(value) {
  if (isRecord(value)) {
    return asString(value.ratingValue ?? value.value ?? value.score);
  }
  return asString(value);
}
function parseReviewFromJson(value) {
  if (!isRecord(value)) return null;
  const rating = parseRatingValue(value.reviewRating ?? value.rating);
  const authorValue = value.author;
  const author = isRecord(authorValue) ? asString(authorValue.name) : asString(authorValue);
  const body = firstNonEmpty(
    asString(value.reviewBody),
    asString(value.text),
    asString(value.description)
  );
  const title = firstNonEmpty(asString(value.name), asString(value.headline), asString(value.title));
  if (!title && !body && !rating) return null;
  return {
    title,
    body,
    rating: rating ? `${rating} out of 5` : null,
    author,
    authorDetails: null,
    date: asString(value.datePublished ?? value.publishedDate ?? value.createdAt),
    experienceDate: asString(value.dateCreated ?? value.experiencedDate),
    status: null,
    reply: null
  };
}
function parseJsonLd($) {
  const parsed = {
    companyName: null,
    domain: null,
    description: null,
    trustScore: null,
    starRating: null,
    reviewCount: null,
    reviews: []
  };
  const nodes = $("script[type='application/ld+json']").toArray().flatMap((el) => {
    const json = parseJsonScript($(el).text());
    return extractJsonLdNodes(json);
  });
  for (const node of nodes) {
    const aggregateRating = node.aggregateRating;
    const reviewValues = asArray(node.review);
    const hasReviewSubjectData = Boolean(aggregateRating) || reviewValues.length > 0;
    if (aggregateRating && isRecord(aggregateRating)) {
      const ratingValue = asString(aggregateRating.ratingValue);
      parsed.trustScore ??= ratingValue;
      parsed.reviewCount ??= asString(aggregateRating.reviewCount ?? aggregateRating.ratingCount);
      const bestRating = asString(aggregateRating.bestRating);
      const starRating = ratingValue && bestRating ? `${ratingValue} out of ${bestRating}` : null;
      parsed.starRating ??= starRating;
    }
    if (hasReviewSubjectData) {
      parsed.companyName ??= cleanCompanyName(asString(node.name));
      parsed.description ??= asString(node.description);
      parsed.domain ??= asString(node.url);
    }
    for (const reviewValue of reviewValues) {
      const review = parseReviewFromJson(reviewValue);
      if (review) parsed.reviews.push(review);
    }
  }
  parsed.reviews = dedupeReviews(parsed.reviews);
  return parsed;
}
function parseNextData($) {
  const json = parseJsonScript($("#__NEXT_DATA__").first().text());
  if (!json) return {};
  const objects = collectObjects(json, 5e3);
  const business = objects.find((obj) => {
    const hasName = typeof obj.displayName === "string" || typeof obj.name === "string";
    const hasTrustpilotFields = "trustScore" in obj || "numberOfReviews" in obj || "identifyingName" in obj || "stars" in obj;
    return hasName && hasTrustpilotFields;
  });
  const reviewArrays = collectArrays(json, 300).filter((arr) => arr.some((value) => parseNextReview(value) !== null)).sort((a, b) => b.length - a.length);
  const reviews = reviewArrays[0] ? dedupeReviews(reviewArrays[0].map(parseNextReview).filter((r) => r !== null)) : [];
  return {
    companyName: firstNonEmpty(
      asString(business?.displayName),
      asString(business?.name)
    ) ?? void 0,
    domain: firstNonEmpty(
      asString(business?.identifyingName),
      asString(business?.websiteUrl),
      asString(business?.website)
    ) ?? void 0,
    trustScore: parseBusinessScore(business),
    starRating: parseBusinessStars(business),
    reviewCount: parseBusinessReviewCount(business),
    reviews
  };
}
function collectObjects(value, limit) {
  const result = [];
  const stack = [value];
  while (stack.length && result.length < limit) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
    } else if (isRecord(current)) {
      result.push(current);
      stack.push(...Object.values(current));
    }
  }
  return result;
}
function collectArrays(value, limit) {
  const result = [];
  const stack = [value];
  while (stack.length && result.length < limit) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      result.push(current);
      stack.push(...current);
    } else if (isRecord(current)) {
      stack.push(...Object.values(current));
    }
  }
  return result;
}
function parseBusinessScore(business) {
  if (!business) return void 0;
  const trustScore = business.trustScore;
  if (isRecord(trustScore)) {
    return asString(trustScore.score ?? trustScore.value) ?? void 0;
  }
  return asString(trustScore ?? business.score) ?? void 0;
}
function parseBusinessStars(business) {
  if (!business) return void 0;
  const stars = asString(business.stars ?? business.starRating);
  return stars ? `${stars} out of 5` : void 0;
}
function parseBusinessReviewCount(business) {
  if (!business) return void 0;
  const count = asString(business.numberOfReviews ?? business.reviewCount);
  return count ? `${count} reviews` : void 0;
}
function parseNextReview(value) {
  if (!isRecord(value)) return null;
  const hasReviewShape = "rating" in value && ("title" in value || "text" in value || "consumer" in value || "dates" in value);
  if (!hasReviewShape) return null;
  const consumer = isRecord(value.consumer) ? value.consumer : void 0;
  const dates = isRecord(value.dates) ? value.dates : void 0;
  const labels = isRecord(value.labels) ? value.labels : void 0;
  const replyValue = isRecord(value.reply) ? value.reply : isRecord(value.businessReply) ? value.businessReply : void 0;
  const rating = asString(value.rating);
  return {
    title: asString(value.title),
    body: firstNonEmpty(asString(value.text), asString(value.body)),
    rating: rating ? `${rating} out of 5` : null,
    author: firstNonEmpty(asString(consumer?.displayName), asString(consumer?.name)),
    authorDetails: null,
    date: asString(dates?.publishedDate ?? value.publishedDate),
    experienceDate: asString(dates?.experiencedDate ?? value.experiencedDate),
    status: parseNextStatus(value, labels),
    reply: parseNextReply(replyValue)
  };
}
function parseNextStatus(review, labels) {
  if (review.isVerified === true) return "Verified";
  const verification = labels?.verification;
  if (isRecord(verification) && verification.isVerified === true) return "Verified";
  return asString(review.source) ?? asString(review.reviewSource);
}
function parseNextReply(reply) {
  if (!reply) return null;
  const body = firstNonEmpty(asString(reply.message), asString(reply.text), asString(reply.body));
  if (!body) return null;
  return {
    company: asString(reply.companyName),
    date: asString(reply.publishedDate ?? reply.createdAt),
    body
  };
}
function isTrustpilotChallengeHtml(html) {
  const $ = load5(html);
  const hasReviewContent = $("h1").text().includes("Reviews") || extractReviewCards($).length > 0 || $("script[type='application/ld+json']").length > 0;
  if (hasReviewContent) return false;
  const bodyText = normalizeText3($("body").text()).toLowerCase();
  const hasChallengeElement = $("#challenge-form").length > 0 || $(".g-recaptcha, .h-captcha").length > 0 || $("[class*='cf-challenge']").length > 0 || $("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").length > 0;
  if (hasChallengeElement) return true;
  return [
    "verify you are human",
    "checking if the site connection is secure",
    "checking your browser",
    "security check",
    "are you a robot"
  ].some((marker) => bodyText.includes(marker));
}
function parseTrustpilotCompanyHtml(html, sourceUrl) {
  const $ = load5(html);
  if (isTrustpilotChallengeHtml(html)) return null;
  const jsonLd = parseJsonLd($);
  const nextData = parseNextData($);
  const companyName = firstNonEmpty(
    nextData.companyName,
    jsonLd.companyName,
    extractCompanyName($, null),
    domainFromUrl(sourceUrl ?? null)
  );
  if (!companyName) return null;
  const parsed = {
    companyName,
    domain: firstNonEmpty(nextData.domain, domainFromUrl(sourceUrl ?? null), jsonLd.domain),
    profileStatus: extractProfileStatus($),
    trustScore: firstNonEmpty(nextData.trustScore, extractTrustScore($, jsonLd)),
    starRating: firstNonEmpty(nextData.starRating, extractStarRating($, jsonLd)),
    ratingLabel: extractRatingLabel($),
    reviewCount: firstNonEmpty(nextData.reviewCount, extractReviewCount2($, jsonLd)),
    categories: extractCategories($),
    companyDescription: extractCompanyDescription($, jsonLd),
    contactInfo: extractContactInfo($),
    ratingDistribution: extractRatingDistribution($),
    reviews: dedupeReviews([
      ...nextData.reviews ?? [],
      ...parseHtmlReviews($),
      ...jsonLd.reviews
    ])
  };
  const hasUsefulContent = parsed.trustScore || parsed.reviewCount || parsed.companyDescription || parsed.reviews.length > 0;
  return hasUsefulContent ? parsed : null;
}
function formatParsedTrustpilotPage(page) {
  const lines = [];
  lines.push(`# ${page.companyName} Reviews`);
  lines.push("");
  if (page.domain) lines.push(`**Domain:** ${page.domain}`);
  if (page.profileStatus) lines.push(`**Profile:** ${page.profileStatus}`);
  if (page.trustScore) lines.push(`**TrustScore:** ${page.trustScore}`);
  if (page.starRating) lines.push(`**Stars:** ${page.starRating}`);
  if (page.ratingLabel) lines.push(`**Rating:** ${page.ratingLabel}`);
  if (page.reviewCount) lines.push(`**Reviews:** ${page.reviewCount}`);
  if (page.categories.length > 0) lines.push(`**Categories:** ${page.categories.join(" > ")}`);
  lines.push("");
  if (page.companyDescription) {
    lines.push("## Company Details");
    lines.push("");
    lines.push(page.companyDescription);
    lines.push("");
  }
  if (page.contactInfo.length > 0) {
    lines.push(`**Contact:** ${page.contactInfo.join(" | ")}`);
    lines.push("");
  }
  if (page.ratingDistribution.length > 0) {
    lines.push("## Rating Distribution");
    lines.push("");
    for (const entry of page.ratingDistribution) {
      lines.push(`- **${entry.stars}:** ${entry.percent}`);
    }
    lines.push("");
  }
  if (page.reviews.length > 0) {
    lines.push("## Reviews");
    lines.push("");
    for (const review of page.reviews.slice(0, 20)) {
      if (review.title) lines.push(`### ${review.title}`);
      const meta = [];
      if (review.rating) meta.push(`Rating: ${review.rating}`);
      if (review.author) meta.push(`Author: ${review.author}`);
      if (review.authorDetails) meta.push(`Author details: ${review.authorDetails}`);
      if (review.date) meta.push(`Date: ${review.date}`);
      if (review.experienceDate) meta.push(`Date of experience: ${review.experienceDate}`);
      if (review.status) meta.push(`Status: ${review.status}`);
      if (meta.length > 0) {
        lines.push(meta.join(" | "));
        lines.push("");
      }
      if (review.body) {
        lines.push(review.body);
        lines.push("");
      }
      if (review.reply) {
        const replyMeta = [
          review.reply.company ? `Reply from ${review.reply.company}` : "Company reply",
          review.reply.date
        ].filter(Boolean).join(" | ");
        lines.push(`**${replyMeta}:** ${review.reply.body}`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }
  return normalizeMarkdown(lines.join("\n"));
}
var TrustpilotExtractor = class extends PageExtractor {
  canHandle(url) {
    return isTrustpilotUrl(url);
  }
  async extract(input) {
    if (!input.loader.renderHtml) return null;
    const html = await input.loader.renderHtml(input.url.href, {
      signal: input.signal
    });
    if (!html) return null;
    const parsed = parseTrustpilotCompanyHtml(html, input.url);
    if (!parsed) return null;
    const content = formatParsedTrustpilotPage(parsed);
    if (!content.trim()) return null;
    return { content, html };
  }
};

// src/search-extract/extract/extractors/youtube.ts
function isYouTubeVideoUrl(url) {
  try {
    extractYouTubeVideoId(url.href);
    return true;
  } catch {
    return false;
  }
}
function formatYouTubeTranscript(subtitles, sourceUrl) {
  const lines = [
    "# YouTube Transcript",
    "",
    `Source: ${sourceUrl}`,
    `Video ID: ${subtitles.videoId}`,
    `Language: ${subtitles.languageName} (${subtitles.languageCode})`,
    `Caption type: ${subtitles.isAutoGenerated ? "auto-generated" : "manual"}`
  ];
  if (subtitles.availableTracks.length > 0) {
    lines.push(`Available tracks: ${formatAvailableTracks(subtitles)}`);
  }
  lines.push("", "## Transcript", "");
  for (const cue of subtitles.cues) {
    lines.push(`[${formatTimestamp(cue.startMs)}] ${cue.text}`);
  }
  return lines.join("\n");
}
var YouTubeExtractor = class extends PageExtractor {
  constructor(config = {}) {
    super();
    this.config = config;
  }
  config;
  canHandle(url) {
    return isYouTubeVideoUrl(url);
  }
  async extract(input) {
    try {
      const subtitles = await downloadYouTubeSubtitles({
        videoIdOrUrl: input.url.href,
        fetch: input.fetch ?? globalThis.fetch,
        signal: input.signal
      });
      if (!subtitles.text.trim()) {
        return youtubeTranscriptUnavailableResult(
          input.url.href,
          "YouTube returned no subtitle text."
        );
      }
      return {
        content: formatYouTubeTranscript(subtitles, input.url.href)
      };
    } catch (error) {
      if (isAbortError3(error)) throw error;
      return this.extractWithSubtitleFallback(
        input,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  async extractWithSubtitleFallback(input, reason) {
    const videoId = extractYouTubeVideoId(input.url.href);
    const downloader = this.config.subtitleDownloader;
    if (!downloader) {
      return youtubeTranscriptUnavailableResult(input.url.href, reason);
    }
    try {
      const subtitles = await downloader({
        url: input.url.href,
        videoId,
        reason,
        signal: input.signal
      });
      if (!subtitles.text.trim()) {
        return youtubeTranscriptUnavailableResult(
          input.url.href,
          `${reason}; yt-dlp subtitle fallback returned no text.`
        );
      }
      return {
        content: formatYouTubeTranscript(subtitles, input.url.href),
        warnings: [
          `Public YouTube caption extraction failed for ${input.url.href}: ${reason}`,
          "Used configured yt-dlp subtitle fallback."
        ]
      };
    } catch (error) {
      if (isAbortError3(error)) throw error;
      const subtitleError = error instanceof Error ? error.message : String(error);
      return youtubeTranscriptUnavailableResult(
        input.url.href,
        `${reason}; yt-dlp subtitle fallback failed: ${subtitleError}`
      );
    }
  }
};
function youtubeTranscriptUnavailableResult(sourceUrl, reason) {
  return {
    content: [
      "# YouTube Transcript Unavailable",
      "",
      `Source: ${sourceUrl}`,
      "",
      "No YouTube transcript could be extracted from public caption tracks.",
      "",
      `Reason: ${reason}`
    ].join("\n"),
    warnings: [`YouTube transcript unavailable for ${sourceUrl}: ${reason}`]
  };
}
function isAbortError3(error) {
  return error instanceof Error && error.name === "AbortError";
}
function formatAvailableTracks(subtitles) {
  return subtitles.availableTracks.map((track) => {
    const type = track.isAutoGenerated ? ", auto-generated" : "";
    return `${track.languageName} (${track.languageCode}${type})`;
  }).join("; ");
}
function formatTimestamp(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const minuteText = String(minutes).padStart(2, "0");
  const secondText = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minuteText}:${secondText}`;
  }
  return `${minuteText}:${secondText}`;
}

// src/search-extract/core-api.ts
init_extract_page();

// src/search-extract/adapters/scrape-do.ts
init_page_loader();
var SCRAPE_DO_API_URL = "https://api.scrape.do/";
async function fetchScrapeDoHtml(url, config, options) {
  validateUrl(url);
  throwIfAborted(options?.signal);
  const apiKey = config.apiKey.trim();
  if (!apiKey) return null;
  const endpoint = buildScrapeDoUrl(url, config);
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      signal: options?.signal
    });
    if (!response.ok) return null;
    const html = await response.text();
    return html.trim() ? html : null;
  } catch (error) {
    if (isAbortError4(error)) throw error;
    return null;
  }
}
function createScrapeDoPageLoader(config) {
  return {
    renderHtml: (url, options) => fetchScrapeDoHtml(url, config, options)
  };
}
function buildScrapeDoUrl(targetUrl, config) {
  const endpoint = new URL(config.endpoint ?? SCRAPE_DO_API_URL);
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value === void 0 || value === null) continue;
    endpoint.searchParams.set(key, String(value));
  }
  endpoint.searchParams.set("token", config.apiKey.trim());
  endpoint.searchParams.set("url", targetUrl);
  return endpoint;
}
function isAbortError4(error) {
  return error instanceof Error && error.name === "AbortError";
}
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}
export {
  AggregateSearchError,
  AmazonExtractor,
  MIN_CONTENT_LENGTH,
  PageExtractor,
  RedditExtractor,
  SCRAPE_DO_API_URL,
  SEARCH_PROVIDER_NAMES,
  SearchProviderConfigError,
  SearchProviderError,
  SearchProviderResponseError,
  ShopifyExtractor,
  TrustpilotExtractor,
  UrlValidationError,
  YouTubeExtractor,
  createBraveSearch,
  createExaSearch,
  createScrapeDoPageLoader,
  createSearXNGFetchSearch,
  createSearchExtractEngine,
  createSearchProvider,
  createSerperSearch,
  createTavilySearch,
  createYouTubeSearch,
  downloadYouTubeSubtitles,
  extractPage,
  extractVisibleTextFromHtml,
  extractYouTubeVideoId,
  extractors,
  fetchScrapeDoHtml,
  formatSearchHttpError,
  formatSearchResults,
  formatYouTubeTranscript,
  getRateLimiter,
  isAmazonChallengePage,
  isRedditChallengeHtml,
  isTrustpilotChallengeHtml,
  isTrustpilotReviewPageUrl,
  isTrustpilotUrl,
  isYouTubeVideoUrl,
  loadPageHtml,
  parseAmazonProductHtml,
  parseOldRedditHtml,
  parseRedditJson,
  parseTrustpilotCompanyHtml,
  rateLimit,
  resetRateLimiter,
  sanitizeHtml,
  searchQueryInputSchema,
  searchResultSchema,
  setRateLimiter,
  validateUrl
};
//# sourceMappingURL=core-api.js.map
