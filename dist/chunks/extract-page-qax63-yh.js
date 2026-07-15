import { Z as validateUrl, G as loadPageHtml, U as UrlValidationError } from "./hacker-news-CZDyDqkb.js";
import { load } from "cheerio";
const MIN_CONTENT_LENGTH = 200;
const STRUCTURAL_PRUNE_TAGS = [
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
const BLOCK_TAGS = /* @__PURE__ */ new Set([
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
const TABLE_CELL_TAGS = /* @__PURE__ */ new Set(["td", "th"]);
const PRUNED_ROLE_VALUES = /* @__PURE__ */ new Set([
  "alertdialog",
  "banner",
  "complementary",
  "contentinfo",
  "dialog",
  "navigation"
]);
const NOISE_ATTRIBUTE_PATTERN = /\b(cookie|cookies|consent|gdpr|ccpa|privacy[-_\s]?choices|popup|pop[-_\s]?up|popover|modal|overlay|newsletter|captcha|recaptcha|hcaptcha|interstitial|tracking|tracker|beacon|pixel|ad[-_\s]?(slot|container|banner|unit)|advertisement)\b/i;
const MAX_REPEATED_LINE_OCCURRENCES = 2;
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
async function extractPage(url, options, deps) {
  const method = options?.method ?? "auto";
  const signal = options?.signal;
  const warnings = [];
  const parsedUrl = validateUrl(url);
  if (signal?.aborted) {
    throw createAbortError();
  }
  const extractors = deps.extractors ?? [];
  const extractorInput = {
    url: parsedUrl,
    loader: deps.pageLoader ?? {},
    fetch: deps.fetch ?? globalThis.fetch,
    signal
  };
  for (const extractor of extractors) {
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
      if (isAbortError(error)) throw error;
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
    throw createAbortError();
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
    const renderOptions = { maxBytes: options?.maxBytes, signal };
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
  const loadOptions = { maxBytes: options?.maxBytes, signal };
  const html = deps.pageLoader?.fetchHtml ? await deps.pageLoader.fetchHtml(url, loadOptions) : await loadPageHtml(url, fetchImpl, loadOptions);
  const content = html ? sanitizeHtml(html) : "";
  if (method === "auto" && content.length < MIN_CONTENT_LENGTH) {
    if (deps.pageLoader?.renderHtml) {
      const renderOptions = { maxBytes: options?.maxBytes, signal };
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
    if (isAbortError(error)) throw error;
    result.warnings = result.warnings ?? [];
    result.warnings.push(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return result;
}
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
function createAbortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
const extractPage$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  UrlValidationError,
  extractPage,
  validateUrl
}, Symbol.toStringTag, { value: "Module" }));
export {
  MIN_CONTENT_LENGTH as M,
  extractVisibleTextFromHtml as a,
  extractPage$1 as b,
  extractPage as e,
  sanitizeHtml as s
};
//# sourceMappingURL=extract-page-qax63-yh.js.map
