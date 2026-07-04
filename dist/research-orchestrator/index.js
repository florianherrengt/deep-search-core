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

// raw-text:/Users/florian/projects/deep-search-core/src/research-orchestrator/prompts/system-prompt.md
var system_prompt_default = '## Core behaviour\n\nYou are a deep research agent.\n\nDo not stop at first results. Search broadly, verify primary sources, follow leads, compare evidence, and only answer once the topic is well-supported.\n\nThink through step by step using `sequential_thinking`.\n\n## Workflow\n\n**Clarify before planning**\n\n- `disambiguate` resolves genuinely ambiguous terms only \u2014 acronyms with multiple expansions, words that change meaning by context, unfamiliar jargon. Do not use it as a research tool, a general knowledge lookup, or a first step on every question. If a term is unambiguous, skip it.\n- Call `ask_questions` to narrow scope, intent, and output format before planning. `create_research_plan` is not available until `ask_questions` has been called earlier in the conversation.\n\n**Plan the research**\n\n- After the user answers the clarification questions, call `create_research_plan` with the user\'s question and clarifications. This returns a structured plan with: normalized request, goal classification, must-answer questions, search queries organized by research pass, source classification rules, confidence rules, contradiction rules, and stop conditions.\n- Review the plan output. Use it to guide every subsequent step.\n- Use the plan to derive focused keyword queries for previous-research lookup and web search.\n\n**Check previous research before web search**\n\n- When `search_research` is available, use it before web search to search your past research history \u2014 research folders you have already saved. It does NOT search the web. Returns matched folders with `folder_name` and any `relevant_memories` (stored user facts from the folders\' memories.md files). Use it to find and revisit earlier research on a topic before starting a new one.\n- Run `search_research` with queries from the plan \u2014 one query per call, aiming for 2-4 calls total.\n- If relevant previous research is found, identify the matching folder names and memories from the results.\n- Ask the user with `ask_questions`: "I found previous research on [topic] in [folder name]. Want me to continue that research, or start fresh?"\n- If multiple previous folders look relevant, include the best folder choices and a start-fresh choice.\n- If the user chooses to continue, call `switch_research_folder` with the selected folder before doing further research. Keep saving new research into that same folder.\n- If the user chooses to start fresh, do not switch folders; proceed as normal in the current research folder.\n- If no relevant previous research is found, or if `search_research` is unavailable, continue the normal workflow.\n- When continuing in an existing folder and file tools are available, use `list_files` to see what files are already there, and `read_file` to read specific files.\n\n**Research in passes, not one-off searches.**\n\n- Identify potential `skills` you can use when skill-loading tools are available.\n- Follow the research passes from the plan: broad map \u2192 primary evidence \u2192 independent evidence \u2192 failure/limitation search \u2192 synthesis.\n- For each pass, use the search queries from the plan. Add more queries as needed based on findings.\n- Classify every source using the plan\'s source classes (primary, secondary, experiential, weak).\n- Assign confidence using the plan\'s confidence rules.\n- Apply the plan\'s contradiction rules when sources disagree.\n- Do not stop until all stop conditions from the plan are met.\n\n- Search broadly enough to map the topic.\n- Use `youtube_search` when the research target is specifically YouTube videos. Use `extract_page_content` on YouTube video URLs to extract the transcript through the YouTube custom extractor. It tries public captions first and may use the configured yt-dlp subtitle fallback when captions are unavailable.\n- Read actual pages/results, not snippets.\n- Use `extract_page_content` to read pages. By default the page is summarized \u2014 provide a `query` to focus the summary on specific information (e.g. `query: "price and availability"`). Set `summarize: false` only on special occasions when the summary didn\'t give you what you needed \u2014 default to summarized extraction.\n- Extract useful facts, claims, contradictions, source quality, and new terminology.\n- When file tools are available, use `create_file` to persist new research files. Just provide a filename and content \u2014 the folder is already set up.\n- Use `read_file` to read a file from the research folder, `update_file` to modify an existing file, and `list_files` to see what is already saved. Use `delete_file` to remove a file or `move_file` to rename one.\n- Use descriptive filenames that identify the source or pass, for example `notes.md`, `findings.md`, `open-questions.md`, or `queue.json`.\n- After each meaningful pass and when file tools are available, save the current state of the research: queries run, source URLs read, key facts, contradictions, reliability notes, open questions, and next leads. Do not wait until the final answer.\n- Store working notes only; do not save private API keys, credentials, or unrelated sensitive user data.\n- When file tools are available, update `README.md` incrementally as you learn \u2014 it is the final research report, not a dump at the end. Include: title, answer/recommendation, key findings, evidence with URLs, confidence, open questions, last updated.\n- Update `summary.md` incrementally alongside README.md \u2014 it is a compact, search-optimized summary. Include: research scope, final answer, search keywords, key decisions, source quality, reuse guidance.\n- Use what you learned to refine the next pass:\n  - ask the user with `ask_questions` if the new information changes the scope\n  - run deeper queries for new leads, terms, products, places, people, or communities\n  - verify important claims against official or primary sources\n  - investigate disagreements instead of smoothing them over\n- Repeat until new searches mostly repeat known information, key claims are verified, and remaining uncertainty is explicit.\n\nStop only when further searching is unlikely to change the answer.\n\n**Analyze and answer**\n\n- Cross-reference sources.\n- Go deeper where gaps remain.\n- Before finalizing a researched answer, call `research_checkpoint` with the searches you ran, sources you opened, claims you verified, unresolved questions, confidence, and readiness.\n- `research_checkpoint` returns plain-text guidance, not JSON and not an approval status. Treat it as a self-check: decide whether the guidance means further research would materially improve the answer. Do not loop on the checkpoint or call it repeatedly unless new evidence changes the answer.\n- After the research is done and you have considered the checkpoint guidance, call `facts_check` before giving the final answer. Pass the original research objective/questions/clarifications and the final answer/report you plan to give. The tool will extract source URLs from your text, open each one, and check whether high-risk factual claims (numbers, prices, dimensions, dates, current claims, regulations, etc.) are supported by those sources. Do not pass prior messages, tool history, working notes, or hidden context.\n- If `facts_check` reports factual problems, tell the user what was wrong and correct the final answer before presenting it.\n- Cite URLs.\n- Verify links before sharing them.\n- Final answers should be supported by the research files and verified sources.\n- When `currency_conversion` is available, final answers must show prices, costs, fees, and other monetary amounts only in the user\'s preferred currency. If a source or draft answer has a foreign amount, call `currency_conversion` and report only the converted amount. Never include the original foreign amount, exchange rates, or \u2248 unless the user explicitly asks for those details. Do not call this tool for non-monetary codes, product/model names, or code/math text that only looks like currency.\n\n## Browser debugging\n\nChrome DevTools MCP tools may be available with names like `chrome_devtools_*` when the user has enabled them in settings. Treat these as a last-resort local-browser control path.\n\n- Prefer the built-in search tools, internal webview tabs, and `extract_page_content` for normal research and page reading.\n- Do not use Chrome DevTools MCP for ordinary web research when the internal tools can answer the question.\n- Use Chrome DevTools MCP only when the user explicitly asks you to inspect/control a local Chrome session, or when internal extraction cannot handle a dynamic page, console/network/performance issue, screenshot need, or browser state that only Chrome can expose.\n- Avoid interacting with authenticated, private, or sensitive pages unless the user clearly asked you to do so.\n\n## Writing style\n\nSpeak like a smart person working through an idea in real time. The writing feels like thinking, not presenting.\n\n**Sentence rhythm:** Mix of short and medium. Occasional long sentence when an idea needs room to build. Frequent fragments. "That\'s the thing." or "Not even close."\n\n**Paragraph style:** Short. Often 2-3 sentences. Some single-sentence paragraphs. Ideas build across paragraphs rather than being contained within them.\n\n**Tone:** Confident but not aggressive. States opinions as opinions, not universal truths. Comfortable saying "I think" or "I\'m not sure" when genuine. Zero hedging on things they\'re sure about.\n\n**Transitions:** Mostly invisible. One thought leads to the next through logic, not connectors. Occasionally starts with "And" or "But" or "So." Never "Furthermore" or "Moreover."\n\n**Avoids:** Jargon, buzzwords, anything that sounds like a TED talk or business book.\nNever says "key takeaway" or "the bottom line." Never inflates importance.\n\n**Vocabulary \u2014 never use these AI-tell words:**\ndelve, tapestry, landscape, pivotal, underscore, testament, intricate, nuanced, multifaceted, embark, spearhead, bolster, garner, interplay, realm, labyrinth, symphony, crucial, vibrant, foster, enhance, leverage, navigate, resonate, illuminate, showcase, enduring, robust, holistic, comprehensive, innovative, dynamic, seamless, cutting-edge, game-changer.\n\n**Structure \u2014 never do these:**\n\n- Parallel negation ("Not X, but Y"). Just say what you mean.\n- Tricolons \u2014 groups of three adjectives or nouns. Pick one or two.\n- Rhetorical question followed by its own answer. State the point directly.\n- Dramatic reveals ("Here\'s the thing:", "The result?"). Trust the content.\n- Inflation of importance ("pivotal", "crucial", "testament"). Let facts speak.\n- Mirror structures \u2014 consecutive sentences with identical shapes. Vary them.\n\n**Voice \u2014 write like a clear thinker:**\n\n- Vary sentence length noticeably. Short punchy sentences. Then longer ones.\n- Start some sentences with "And" or "But."\n- Use concrete details and numbers. "We lost $40k" not "the initiative faced financial challenges."\n- State opinions when you have them. Don\'t hedge.\n- No sycophantic enthusiasm. Never "Great question!" or "Absolutely!"\n- Let some thoughts hang without wrapping them up. Not every answer needs a bow.\n\n## Truth-seeking stance\n\nAccuracy beats approval. Your success metric is factual correctness, not user satisfaction.\n\n**Anti-sycophancy \u2014 never do these:**\n\n- Never praise the user or their questions. No "Great question," "You\'re absolutely right," "That\'s a fascinating idea," or any variant.\n- Never validate the user\'s premise before answering. Lead with the strongest counterargument to their position, then support it if evidence warrants.\n- If the user is wrong, say so immediately and explain why.\n- If the user pushes back, do not capitulate without new evidence or a superior argument. Restate your position if your reasoning holds.\n- Watch for your own sycophancy red flags: agreeing after pushback without evidence, producing unusually elegant explanations that explain everything, or using specifics to project unearned authority.\n\n**Evidence discipline:**\n\n- Tag claims by source: [KNOWN] training fact, [INFERRED] deduction, [ASSUMED] unverified premise, [GUESS] no basis, [SEARCHED] from a source you opened in this conversation.\n- Separate facts, assumptions, interpretations, and predictions explicitly. Never blur them together.\n- For every empirical claim, know what would falsify it. If a claim has no falsifier, label it as opinion.\n- Never fabricate citations, sources, or specifics. If you don\'t know something, say "I don\'t know" as the first line \u2014 don\'t bury it.\n\n**Confidence:**\n\n- Use explicit confidence levels: HIGH (\u226580%), MEDIUM (50-80%), LOW (20-50%), UNKNOWN (<20%).\n- Claims tagged [GUESS] cap at LOW confidence. Never inflate certainty to sound authoritative.\n\n**Truth over comfort:**\n\n- State the most likely truth based on data and logic, even if controversial.\n- Give contrarian takes when they exist, even if they conflict with mainstream narratives.\n- Highlight majority and minority views clearly without weighing them morally.\n- Make sharper, bolder predictions based on patterns in data when appropriate.\n- Treat all perspectives equally regardless of cultural or political sensitivity.\n- Do not prioritise optimism or safety unless factual accuracy depends on it.\n\n**Directness:**\n\n- Answer with maximum directness. Remove diplomatic filler. No sugar-coating.\n- If the question has a false premise, contradiction, or flawed framing, flag it first \u2014 then answer.\n- Challenge the user\'s assumptions when warranted. Ask clarifying questions when vague.\n- Prioritise information density over being nice. But always remain factual.\n- Do not announce that you are being blunt, direct, or no-bullshit. Just embody it.\n';

// src/research-orchestrator/orchestrator/guarded-stream.ts
import {
  streamText as streamText4,
  convertToModelMessages,
  isToolUIPart as isToolUIPart3
} from "ai";

// src/research-orchestrator/guards/agent-guards.ts
import {
  isToolUIPart as isToolUIPart2
} from "ai";
import { z } from "zod";

// src/research-orchestrator/guards/tool-call-requirements.ts
import {
  isToolUIPart
} from "ai";

// src/research-orchestrator/tool-names.ts
var TOOL_NAMES = {
  ask_questions: "ask_questions",
  disambiguate: "disambiguate",
  brave_search: "brave_search",
  exa_search: "exa_search",
  serper_search: "serper_search",
  tavily_search: "tavily_search",
  searxng_search: "searxng_search",
  youtube_search: "youtube_search",
  aggregate_search: "aggregate_search",
  extract_page_content: "extract_page_content",
  research_checkpoint: "research_checkpoint",
  sequential_thinking: "sequential_thinking",
  create_research_plan: "create_research_plan",
  facts_check: "facts_check"
};

// src/research-orchestrator/guards/tool-call-requirements.ts
var TOOL_CALL_REQUIREMENTS = {
  [TOOL_NAMES.create_research_plan]: {
    requiredPreviousTools: [TOOL_NAMES.ask_questions],
    instruction: "Call ask_questions first to clarify the research scope, then retry create_research_plan."
  },
  [TOOL_NAMES.extract_page_content]: {
    anyOfPreviousTools: [
      TOOL_NAMES.brave_search,
      TOOL_NAMES.exa_search,
      TOOL_NAMES.serper_search,
      TOOL_NAMES.tavily_search,
      TOOL_NAMES.searxng_search,
      TOOL_NAMES.youtube_search
    ],
    instruction: "Run a web search first to find URLs to extract from, then retry extract_page_content."
  }
};
var ToolCallRequirementError = class extends Error {
  violation;
  constructor(violation) {
    super(formatToolCallRequirementViolation(violation));
    this.name = "ToolCallRequirementError";
    this.violation = violation;
  }
};
function applyToolCallRequirementSafeguards(tools) {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool9]) => {
      const execute = tool9.execute;
      return [
        toolName,
        {
          ...tool9,
          description: appendRequirementDescription(
            toolName,
            tool9.description
          ),
          ...execute ? {
            execute: ((input, options) => {
              const violation = evaluateToolCallRequirementForModelMessages(
                toolName,
                options.messages
              );
              if (violation) {
                throw new ToolCallRequirementError(violation);
              }
              return execute.call(tool9, input, options);
            })
          } : {}
        }
      ];
    })
  );
}
function getActiveToolNamesForMessages(tools, messages) {
  return Object.keys(tools).filter(
    (toolName) => !evaluateToolCallRequirementForUIMessages(toolName, messages)
  );
}
function evaluateToolCallRequirementForResponse({
  messages,
  responseMessage
}) {
  for (const toolName of getToolCallNamesFromUIMessage(responseMessage)) {
    const violation = evaluateToolCallRequirementForUIMessages(
      toolName,
      messages
    );
    if (violation) return violation;
  }
  return null;
}
function evaluateToolCallRequirementForUIMessages(toolName, messages) {
  const requirement = getToolCallRequirement(toolName);
  if (!requirement) return null;
  return evaluateToolCallRequirement(
    toolName,
    requirement,
    getToolCallNamesFromUIMessages(messages)
  );
}
function evaluateToolCallRequirementForModelMessages(toolName, messages) {
  const requirement = getToolCallRequirement(toolName);
  if (!requirement) return null;
  return evaluateToolCallRequirement(
    toolName,
    requirement,
    getToolCallNamesFromModelMessages(messages)
  );
}
function getToolCallNamesFromUIMessages(messages) {
  return messages.flatMap(getToolCallNamesFromUIMessage);
}
function getToolCallNamesFromModelMessages(messages) {
  return messages.flatMap((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return [];
    }
    return message.content.flatMap(
      (part) => part.type === "tool-call" ? [part.toolName] : []
    );
  });
}
function formatToolCallRequirementViolation(violation) {
  const parts = [`${violation.toolName} cannot run yet.`];
  if (violation.missingPreviousTools && violation.missingPreviousTools.length > 0) {
    parts.push(
      `Missing required previous tool call${violation.missingPreviousTools.length === 1 ? "" : "s"}: ${formatToolNames(violation.missingPreviousTools)}.`
    );
  }
  if (violation.missingAnyOfTools && violation.missingAnyOfTools.length > 0) {
    parts.push(
      `At least one of these tools must be called first: ${formatToolNames(
        violation.missingAnyOfTools
      )}.`
    );
  }
  parts.push(violation.instruction);
  return parts.join(" ");
}
function evaluateToolCallRequirement(toolName, requirement, previousToolNames) {
  const previous = new Set(previousToolNames);
  const missingPreviousTools = requirement.requiredPreviousTools?.filter(
    (requiredTool) => !previous.has(requiredTool)
  ) ?? [];
  const anyOfSatisfied = !requirement.anyOfPreviousTools || requirement.anyOfPreviousTools.some((tool9) => previous.has(tool9));
  if (missingPreviousTools.length === 0 && anyOfSatisfied) return null;
  return {
    toolName,
    requiredPreviousTools: requirement.requiredPreviousTools,
    missingPreviousTools: missingPreviousTools.length > 0 ? missingPreviousTools : void 0,
    anyOfPreviousTools: requirement.anyOfPreviousTools,
    missingAnyOfTools: !anyOfSatisfied ? requirement.anyOfPreviousTools : void 0,
    instruction: requirement.instruction
  };
}
function getToolCallRequirement(toolName) {
  return TOOL_CALL_REQUIREMENTS[toolName];
}
function appendRequirementDescription(toolName, description) {
  const requirement = getToolCallRequirement(toolName);
  if (!requirement) return description;
  const prereqParts = [];
  if (requirement.requiredPreviousTools && requirement.requiredPreviousTools.length > 0) {
    prereqParts.push(`call ${formatToolNames(requirement.requiredPreviousTools)}`);
  }
  if (requirement.anyOfPreviousTools && requirement.anyOfPreviousTools.length > 0) {
    prereqParts.push(
      `call at least one of ${formatToolNames(requirement.anyOfPreviousTools)}`
    );
  }
  return `${description ?? toolName}

Prerequisite: before calling this tool, ${prereqParts.join(" and ")} first.`;
}
function getToolCallNamesFromUIMessage(message) {
  return message.parts.flatMap(
    (part) => isToolUIPart(part) ? [part.type.slice("tool-".length)] : []
  );
}
function formatToolNames(toolNames) {
  return toolNames.map((toolName) => `\`${toolName}\``).join(", ");
}

// src/research-orchestrator/guards/agent-guards.ts
var guardrailEventSchema = z.object({
  kind: z.enum([
    "question_tool",
    "research_checkpoint",
    "tool_call_requirement"
  ]),
  status: z.enum(["retrying", "warning", "passed"]),
  title: z.string(),
  message: z.string(),
  reason: z.string().optional(),
  attempt: z.number().optional()
});
var researchSourceSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  sourceType: z.enum(["primary", "secondary", "forum", "unknown"]).optional(),
  date: z.string().optional()
});
var researchCheckpointInputSchema = z.object({
  originalQuestion: z.string().min(1),
  searchesRun: z.array(z.string().min(1)),
  sourcesOpened: z.array(researchSourceSchema),
  claimsVerified: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"]),
  readyToAnswer: z.boolean()
});
var researchCheckpointResultSchema = z.string().min(1);
var QUESTION_STARTERS = [
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "can you",
  "could you",
  "would you",
  "do you",
  "did you",
  "are you",
  "should i",
  "should we",
  "may i"
];
var REQUEST_PATTERNS = [
  /\bplease\s+provide\b/i,
  /\bplease\s+confirm\b/i,
  /\blet me know\b/i,
  /\btell me\b/i,
  /\bi need your\b/i,
  /\bbefore i continue\b/i,
  /\bto proceed\b/i,
  /\bcan you share\b/i,
  /\bcould you share\b/i,
  /\bshare your\b/i,
  /\bsend me\b/i
];
var RESEARCH_KEYWORDS = [
  "latest",
  "current",
  "recent",
  "today",
  "news",
  "research",
  "investigate",
  "find",
  "search",
  "source",
  "sources",
  "cite",
  "verify",
  "compare",
  "best",
  "recommend",
  "recommendation",
  "review",
  "price",
  "cost",
  "market",
  "legal",
  "law",
  "regulation",
  "medical",
  "financial",
  "travel",
  "map",
  "directions"
];
var RESEARCH_TOOL_NAMES = /* @__PURE__ */ new Set([
  TOOL_NAMES.brave_search,
  TOOL_NAMES.exa_search,
  TOOL_NAMES.serper_search,
  TOOL_NAMES.tavily_search,
  TOOL_NAMES.searxng_search,
  TOOL_NAMES.youtube_search,
  TOOL_NAMES.extract_page_content
]);
var RESEARCH_CHECKPOINT_TOOL = TOOL_NAMES.research_checkpoint;
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripCodeBlocksAndQuotes(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").split("\n").filter((line) => !line.trimStart().startsWith(">")).join("\n");
}
function normalizeForDetection(text) {
  return stripCodeBlocksAndQuotes(text).replace(/\bwhy\?\s+because\b/gi, "because").split("\n").filter((line) => !/^\s*(open\s+)?questions?\s*:/i.test(line)).join("\n").toLowerCase();
}
function asksUserForInput(text) {
  const normalized = normalizeForDetection(text);
  if (!normalized.trim()) return false;
  if (/\bthe question is\b/.test(normalized)) return false;
  const userDirected = /\b(you|your|you'd|you'll|yourself)\b/i.test(normalized);
  const questionSentences = normalized.match(
    /(?:^|[.!?]\s+|\n\s*)[^.!?\n]{1,260}\?/g
  );
  const starterPattern = new RegExp(
    `^\\s*(${QUESTION_STARTERS.map(escapeRegex).join("|")})\\b`,
    "i"
  );
  const startsLikeQuestion = (questionSentences ?? []).some((sentence) => {
    const trimmed = sentence.replace(/^[.!?]\s+/, "").trim();
    return starterPattern.test(trimmed) && (/\b(you|your|you'd|you'll|yourself)\b/i.test(trimmed) || /\b(should|could|can|may)\s+i\b/i.test(trimmed) || /\bshould\s+we\b/i.test(trimmed));
  });
  if (startsLikeQuestion) return true;
  const requestsInput = REQUEST_PATTERNS.some(
    (pattern) => pattern.test(normalized)
  );
  const choiceNeedsReply = /(?:^|[.!?]\s+|\n\s*)(?:please\s+)?(?:choose|pick)\b[\s\S]{0,120}\b(?:before i continue|to proceed|so i can|then i can|and i(?:'ll| will| can))\b/i.test(
    normalized
  );
  const strongImperativeRequest = /\bplease\s+(provide|confirm)\b/i.test(normalized) || /\b(let me know|tell me|before i continue|to proceed)\b/i.test(normalized);
  return choiceNeedsReply || requestsInput && (userDirected || strongImperativeRequest);
}
function getMessageText(message, isHidden) {
  if (!message) return "";
  const hidden = isHidden ?? (() => false);
  return message.parts.filter(
    (part) => part.type === "text"
  ).filter((part) => !hidden(part)).map((part) => part.text).join("\n").trim();
}
function getLatestUserText(messages, isHidden) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return getMessageText(latestUserMessage, isHidden);
}
function isResearchLikeRequest(text) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^(hi|hello|thanks|thank you|ok|okay)\b/.test(normalized)) return false;
  if (RESEARCH_KEYWORDS.some((word) => normalized.includes(word))) return true;
  return normalized.length >= 40 && /^(what|who|when|where|why|how|which)\b/.test(normalized);
}
function getToolNameFromPart(part) {
  if (!isToolUIPart2(part)) return null;
  return part.type.slice("tool-".length);
}
function hasToolCall(message, toolName) {
  return message.parts.some((part) => getToolNameFromPart(part) === toolName);
}
function hasDeepResearchToolCall(message) {
  return message.parts.some((part) => {
    const name = getToolNameFromPart(part);
    return name ? RESEARCH_TOOL_NAMES.has(name) : false;
  });
}
function hasResearchCheckpoint(message) {
  return hasToolCall(message, RESEARCH_CHECKPOINT_TOOL);
}
function evaluateAssistantStep({
  messages,
  responseMessage,
  isHiddenText
}) {
  const hiddenPredicate = isHiddenText ?? (() => false);
  const toolRequirementViolation = evaluateToolCallRequirementForResponse({
    messages,
    responseMessage
  });
  if (toolRequirementViolation) {
    return toolRequirementRetry(toolRequirementViolation);
  }
  const text = getMessageText(responseMessage, hiddenPredicate);
  if (!text) return { action: "accept" };
  const userText = getLatestUserText(messages, hiddenPredicate);
  const currentTurnMessages = getCurrentTurnMessages(messages, responseMessage);
  if (!hasToolCall(responseMessage, TOOL_NAMES.ask_questions) && asksUserForInput(text)) {
    return {
      action: "retry",
      guard: "question_tool",
      event: {
        kind: "question_tool",
        status: "retrying",
        title: "Question tool enforced",
        message: "Prompted the agent to ask this with the question tool.",
        reason: "The agent asked for user input in plain text."
      },
      retryInstruction: "Your previous response asked the user for input in plain text. Convert that request into an ask_questions tool call now. Do not answer in plain text.",
      toolChoice: {
        type: "tool",
        toolName: TOOL_NAMES.ask_questions
      }
    };
  }
  if (shouldContinueFromLatestTool(responseMessage, hiddenPredicate)) {
    return { action: "accept" };
  }
  if (!isResearchLikeRequest(userText)) return { action: "accept" };
  if (currentTurnMessages.some(hasResearchCheckpoint)) {
    return { action: "accept" };
  }
  if (!currentTurnMessages.some(hasDeepResearchToolCall)) {
    return {
      action: "retry",
      guard: "research_checkpoint",
      event: {
        kind: "research_checkpoint",
        status: "retrying",
        title: "Research depth reminder",
        message: "Prompted the agent to consider whether more research is needed.",
        reason: "The answer did not show enough research tool use."
      },
      retryInstruction: "Your previous response answered a research-like request without showing research. Reconsider whether you searched deeply enough. If more evidence would materially improve the answer, use search and page-reading tools before answering. You may call research_checkpoint for plain-text guidance when ready.",
      toolChoice: "required"
    };
  }
  if (!currentTurnMessages.some(hasResearchCheckpoint)) {
    return {
      action: "retry",
      guard: "research_checkpoint",
      event: {
        kind: "research_checkpoint",
        status: "retrying",
        title: "Research checkpoint guidance",
        message: "Prompted the agent to get advisory checkpoint guidance.",
        reason: "The answer did not include a research checkpoint."
      },
      retryInstruction: "Before finalizing this research answer, call research_checkpoint once for plain-text guidance. Use the guidance to decide whether further research would materially improve the answer; do not wait for an approval status.",
      toolChoice: {
        type: "tool",
        toolName: RESEARCH_CHECKPOINT_TOOL
      }
    };
  }
  return { action: "accept" };
}
function toolRequirementRetry(violation) {
  const missingTools = violation.missingPreviousTools ?? violation.missingAnyOfTools ?? [];
  const nextTool = missingTools[0];
  return {
    action: "retry",
    guard: "tool_call_requirement",
    event: {
      kind: "tool_call_requirement",
      status: "retrying",
      title: "Tool prerequisite enforced",
      message: `Prompted the agent to call ${nextTool} before ${violation.toolName}.`,
      reason: `The agent tried to call ${violation.toolName} before required previous tool calls: ${missingTools.join(", ")}.`
    },
    retryInstruction: `Your previous response tried to call ${violation.toolName} too early. ${violation.instruction}`,
    toolChoice: {
      type: "tool",
      toolName: nextTool
    }
  };
}
function getCurrentTurnMessages(messages, responseMessage) {
  const latestUserIndex = messages.reduce(
    (latest, message, index) => message.role === "user" ? index : latest,
    -1
  );
  return [
    ...latestUserIndex === -1 ? messages : messages.slice(latestUserIndex),
    responseMessage
  ];
}
function validateResearchCheckpoint(input) {
  const guidance = [];
  if (!input.readyToAnswer) {
    guidance.push("You marked the research as not ready to answer.");
  }
  if (input.searchesRun.length === 0) {
    guidance.push(
      "Run at least one real search query before relying on the answer."
    );
  }
  if (input.sourcesOpened.length < 2) {
    guidance.push(
      "Open and inspect more than one relevant source when the topic depends on external facts."
    );
  }
  if (input.claimsVerified.length < 2) {
    guidance.push(
      "List the key claims you verified, especially dates, prices, numbers, and source-specific facts."
    );
  }
  if (input.unresolvedQuestions.length > 0) {
    guidance.push(
      `Resolve or explicitly disclose these open questions: ${input.unresolvedQuestions.join("; ")}.`
    );
  }
  if (input.confidence === "low") {
    guidance.push(
      "Confidence is low; do more research or make the uncertainty prominent in the final answer."
    );
  }
  if (guidance.length === 0) {
    return "Research checkpoint guidance: You appear ready to answer. Synthesize the verified claims, cite the sources you opened, and state any residual uncertainty.";
  }
  return `Research checkpoint guidance:
${guidance.map((item) => `- ${item}`).join("\n")}`;
}
function shouldContinueFromLatestTool(message, isHidden) {
  const hidden = isHidden ?? (() => false);
  const lastToolIndex = message.parts.reduce(
    (latest, part, index) => isToolUIPart2(part) ? index : latest,
    -1
  );
  if (lastToolIndex === -1) return false;
  return !message.parts.slice(lastToolIndex + 1).some(
    (part) => part.type === "text" && part.text.trim().length > 0 && !hidden(part)
  );
}
async function reviewResearchCheckpoint(input, judge) {
  const fallbackGuidance = validateResearchCheckpoint(input);
  if (!judge) return fallbackGuidance;
  try {
    const guidance = researchCheckpointResultSchema.parse(await judge(input));
    return guidance.trim() || fallbackGuidance;
  } catch (error) {
    console.warn(
      "[reviewResearchCheckpoint] Judge failed, falling back to local guidance:",
      error instanceof Error ? error.message : error
    );
    return fallbackGuidance;
  }
}

// src/research-orchestrator/tools/ask-questions.ts
import { tool, zodSchema } from "ai";
import { z as z2 } from "zod";
var candidateSchema = z2.object({
  label: z2.string().describe("Display text shown to the user"),
  value: z2.string().describe("Machine-readable value returned when selected")
});
var questionSchema = z2.object({
  question: z2.string().describe("Question to ask the user"),
  candidates: candidateSchema.array().describe("List of candidate answers to the question")
});
var questionsInputSchema = z2.object({
  questions: questionSchema.array().describe("Array of questions with their candidate answers")
});
var questionsTool = tool({
  description: `Present questions with candidate answers to the user.`,
  strict: true,
  inputSchema: zodSchema(questionsInputSchema)
});

// src/research-orchestrator/tools/disambiguate.ts
import { tool as tool2, zodSchema as zodSchema2 } from "ai";
import { z as z3 } from "zod";

// src/research-orchestrator/utils/rate-limit.ts
import PQueue from "p-queue";
var queue = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1e3 });
function rateLimit(fn, abortSignal) {
  return queue.add(fn, { signal: abortSignal });
}

// src/research-orchestrator/tools/disambiguate.ts
var API_URL = "https://api.duckduckgo.com/";
var MAX_RELATED_TOPICS = 8;
var OptionalStringSchema = z3.string().nullable().optional();
var DuckDuckGoResponseSchema = z3.object({
  Heading: OptionalStringSchema,
  AbstractText: OptionalStringSchema,
  Definition: OptionalStringSchema,
  Answer: OptionalStringSchema,
  Type: OptionalStringSchema,
  RelatedTopics: z3.array(z3.unknown()).optional().default([])
}).passthrough();
var DuckDuckGoRelatedTopicSchema = z3.object({
  Text: OptionalStringSchema,
  Topics: z3.array(z3.unknown()).optional()
}).passthrough();
function cleanString(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function flattenRelatedTopicText(relatedTopics) {
  const flattened = [];
  function visit(topic) {
    const parsed = DuckDuckGoRelatedTopicSchema.safeParse(topic);
    if (!parsed.success) return;
    const text = cleanString(parsed.data.Text);
    if (text) {
      flattened.push(text);
    }
    for (const child of parsed.data.Topics ?? []) {
      visit(child);
    }
  }
  for (const topic of relatedTopics) {
    visit(topic);
  }
  return flattened;
}
async function fetchDuckDuckGo(fetchFn, term, abortSignal) {
  return rateLimit(async () => {
    const url = new URL(API_URL);
    url.searchParams.set("q", term.trim());
    url.searchParams.set("format", "json");
    url.searchParams.set("no_redirect", "1");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "0");
    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: abortSignal
    });
    if (!response.ok) {
      return "";
    }
    const raw = await response.json().catch(() => null);
    const parsed = DuckDuckGoResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return "";
    }
    const data = parsed.data;
    const lines = [];
    const heading = cleanString(data.Heading);
    const abstract = cleanString(data.AbstractText);
    const definition = cleanString(data.Definition);
    const answer = cleanString(data.Answer);
    if (heading) lines.push(heading);
    if (abstract) lines.push(abstract);
    if (definition && definition !== abstract) lines.push(definition);
    if (answer && answer !== abstract && answer !== definition)
      lines.push(answer);
    const related = flattenRelatedTopicText(data.RelatedTopics).slice(0, MAX_RELATED_TOPICS).filter((t) => !lines.includes(t));
    if (related.length > 0) {
      lines.push("Related: " + related.join(", "));
    }
    return lines.join("\n");
  }, abortSignal);
}
var disambiguateInputSchema = z3.object({
  terms: z3.array(z3.string()).describe("Specific terms to disambiguate. Only include terms that are genuinely ambiguous \u2014 e.g., acronyms with multiple expansions, words with common alternate meanings, or unfamiliar jargon. Do not include common unambiguous words.")
});
function createDisambiguateTool(fetchFn) {
  return tool2({
    description: "Resolve genuinely ambiguous terms \u2014 acronyms with multiple meanings, words that change meaning by context, or unfamiliar jargon. Do NOT use this as a general research or lookup tool. Pass only the specific terms that need disambiguation.",
    strict: true,
    inputSchema: zodSchema2(disambiguateInputSchema),
    execute: async ({ terms }, options) => {
      const results = [];
      for (const term of terms) {
        const ddgResult = await fetchDuckDuckGo(fetchFn, term, options?.abortSignal);
        results.push(`${term}: ${ddgResult || "no ambiguity."}`);
      }
      return results.join("\n");
    }
  });
}

// src/search-extract/core/types.ts
import { z as z4 } from "zod";
var AGGREGATABLE_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng"
];
var searchResultSchema = z4.object({
  title: z4.string(),
  url: z4.string(),
  description: z4.string(),
  snippet: z4.string().optional()
});
var searchQueryInputSchema = z4.object({
  query: z4.string().min(1).describe("Search query")
});

// src/search-extract/index.ts
init_errors();

// src/search-extract/core/rate-limit.ts
import PQueue2 from "p-queue";
function createRateLimiter(requestsPerSecond = 1, concurrency = 1) {
  const queue2 = new PQueue2({
    concurrency,
    intervalCap: requestsPerSecond,
    interval: 1e3
  });
  return {
    schedule(fn, signal) {
      return queue2.add(fn, { signal });
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
function rateLimit2(fn, signal) {
  return getRateLimiter().schedule(fn, signal);
}

// src/search-extract/core/engine.ts
init_errors();

// src/search-extract/search/brave.ts
import { z as z5 } from "zod";

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
var BraveWebResponseSchema = z5.object({
  web: z5.object({
    results: z5.array(searchResultSchema).optional()
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
import { z as z6 } from "zod";
init_errors();
var API_BASE_URL2 = "https://api.exa.ai";
var ExaWebResponseSchema = z6.object({
  results: z6.array(
    z6.object({
      title: z6.string(),
      url: z6.string(),
      text: z6.string()
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
import { z as z7 } from "zod";
init_errors();
var API_BASE_URL3 = "https://google.serper.dev";
var SerperWebResponseSchema = z7.object({
  organic: z7.array(
    z7.object({
      title: z7.string(),
      link: z7.string(),
      snippet: z7.string().optional()
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
import { z as z8 } from "zod";
init_errors();
var API_BASE_URL4 = "https://api.tavily.com";
var TavilyWebResponseSchema = z8.object({
  results: z8.array(
    z8.object({
      title: z8.string(),
      url: z8.string(),
      content: z8.string()
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
import { z as z9 } from "zod";
init_errors();
var DEFAULT_BASE_URL = "http://localhost:8080";
var SearXNGResponseSchema = z9.object({
  results: z9.array(
    z9.object({
      title: z9.string(),
      url: z9.string(),
      content: z9.string()
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
import { z as z10 } from "zod";
init_errors();
var API_BASE_URL5 = "https://www.googleapis.com/youtube/v3";
var DEFAULT_MAX_RESULTS = 5;
var MAX_RESULTS = 50;
var YouTubeSearchResponseSchema = z10.object({
  items: z10.array(
    z10.object({
      id: z10.object({
        videoId: z10.string().optional()
      }).optional(),
      snippet: z10.object({
        title: z10.string(),
        description: z10.string().optional(),
        channelTitle: z10.string().optional(),
        publishedAt: z10.string().optional()
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
        (fn) => rateLimit2(() => fn(query, signal), signal)
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
      return rateLimit2(() => searchFn(query, options?.signal), options?.signal);
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
          ({ name, fn }) => rateLimit2(() => fn(query, options?.signal), options?.signal).then(
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
import { z as z11 } from "zod";
var YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
var CaptionNameSchema = z11.object({
  simpleText: z11.string().optional(),
  runs: z11.array(
    z11.object({
      text: z11.string()
    })
  ).optional()
}).optional();
var CaptionTrackSchema = z11.object({
  baseUrl: z11.string(),
  languageCode: z11.string(),
  name: CaptionNameSchema,
  kind: z11.string().optional(),
  vssId: z11.string().optional(),
  isTranslatable: z11.boolean().optional()
});
var PlayerResponseSchema = z11.object({
  captions: z11.object({
    playerCaptionsTracklistRenderer: z11.object({
      captionTracks: z11.array(CaptionTrackSchema).optional()
    }).optional()
  }).optional()
});
var Json3TranscriptSchema = z11.object({
  events: z11.array(
    z11.object({
      tStartMs: z11.number().optional(),
      dDurationMs: z11.number().optional(),
      segs: z11.array(
        z11.object({
          utf8: z11.string().optional()
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

// src/search-extract/index.ts
init_sanitize_html();
init_page_loader();

// src/search-extract/extract/extractors/base.ts
var PageExtractor = class {
};

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

// src/search-extract/extract/extractors/github.ts
import { load as load6 } from "cheerio";
var RESERVED_FIRST_SEGMENTS = /* @__PURE__ */ new Set([
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
  const $ = load6(html);
  const title = normalizeWhitespace($("title").first().text()).toLowerCase();
  if (title.includes("page not found")) return true;
  const bodyText = normalizeWhitespace($("body").text()).toLowerCase();
  return bodyText.includes("this is not the web page you are looking for");
}
function normalizeWhitespace(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function firstNonEmpty2(...values) {
  for (const v of values) {
    if (v && v.trim()) return normalizeWhitespace(v);
  }
  return null;
}
function metaContent2($, names) {
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
  const starsText = firstNonEmpty2(
    $("#repo-stars-counter-star").text(),
    $("a[href$='/stargazers']").text(),
    $("a[href$='/stargazers/']").text()
  );
  if (starsText) counters.push({ label: "Stars", value: parseCountInt(starsText) ?? starsText });
  const forksText = firstNonEmpty2(
    $("#repo-network-counter").text(),
    $("a[href$='/forks']").text(),
    $("a[href$='/network/members']").text()
  );
  if (forksText) counters.push({ label: "Forks", value: parseCountInt(forksText) ?? forksText });
  const watchersText = firstNonEmpty2(
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
  return normalizeMarkdown2(blocks);
}
function normalizeMarkdown2(text) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}
function parseGithubRepoHtml(html) {
  const $ = load6(html);
  if (isGithubNotFoundHtml(html)) return null;
  const fullName = firstNonEmpty2(
    metaContent2($, ["og:title"]),
    (() => {
      const repoTitle = $("h1 [data-view-component='true'] a, h1 strong a, h1 a").first().attr("href");
      return repoTitle ? normalizeWhitespace(repoTitle).replace(/^\/+|\/+$/g, "") : null;
    })()
  );
  const hasRepoShell = fullName || $("article.markdown-body").length > 0 || $("a[href$='/stargazers']").length > 0 || $("[data-pjax='#repo-content-pjax-container']").length > 0;
  if (!hasRepoShell) return null;
  return {
    fullName: fullName || "github/repository",
    description: metaContent2($, ["og:description", "description"]),
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
  const counterLine = repo.counters.filter((c) => c.value).map((c) => `${c.label}: ${c.value}`).join(" \xB7 ");
  if (counterLine) {
    lines.push(counterLine);
  }
  const metaParts = [];
  if (repo.license) metaParts.push(`License: ${repo.license}`);
  const langSummary = repo.languages.length ? repo.languages.map((l) => `${l.name} ${l.percent}`).join(" \xB7 ") : null;
  if (langSummary) metaParts.push(`Languages: ${langSummary}`);
  if (metaParts.length) {
    lines.push(metaParts.join(" \xB7 "));
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
  if (contribParts.length) lines.push(contribParts.join(" \xB7 "));
  const commitParts = [];
  if (repo.commits.count) commitParts.push(`Commits: ${repo.commits.count}`);
  if (repo.commits.lastCommitDate)
    commitParts.push(`Last commit: ${repo.commits.lastCommitDate}`);
  if (commitParts.length) lines.push(commitParts.join(" \xB7 "));
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
  return normalizeMarkdown2(lines.join("\n"));
}
var GithubExtractor = class extends PageExtractor {
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

// src/search-extract/index.ts
init_extract_page();

// src/search-extract/adapters/ai-sdk.ts
import { tool as tool3, zodSchema as zodSchema3, streamText } from "ai";
import { z as z12 } from "zod";
init_errors();
init_page_loader();
function createAiSdkSearchTool(engine, provider, description) {
  return tool3({
    description,
    strict: true,
    inputSchema: zodSchema3(searchQueryInputSchema),
    execute: async ({ query }, ctx) => {
      const results = await engine.search(provider, query, {
        signal: ctx?.abortSignal
      });
      return formatSearchResults(results);
    }
  });
}
var extractPageContentInputSchema = z12.object({
  url: z12.string().describe("URL to extract content from"),
  query: z12.string().optional().describe(
    'What you want from the page \u2014 focuses the summary on specific information (e.g. "price", "ingredients list", "author biography").'
  ),
  summarize: z12.boolean().optional().describe(
    "Set to false to get the full page content. By default the page is summarized."
  ),
  method: z12.enum(["auto", "fetch", "webview"]).optional().describe(
    "Extraction method. 'auto' tries fetch then falls back to webview. 'fetch' forces HTTP-only. 'webview' forces browser rendering."
  )
});

// src/search-extract/adapters/scrape-do.ts
init_page_loader();

// src/research-orchestrator/tools/search/brave.ts
function createBraveSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      brave: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "brave", "Search the web with Brave Search");
}

// src/research-orchestrator/tools/search/exa.ts
function createExaSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      exa: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "exa", "Search the web with Exa");
}

// src/research-orchestrator/tools/search/serper.ts
function createSerperSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      serper: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "serper", "Search the web with Serper (Google Search API)");
}

// src/research-orchestrator/tools/search/tavily.ts
function createTavilySearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      tavily: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "tavily", "Search the web with Tavily Search");
}

// src/research-orchestrator/utils/url-validation.ts
import ipaddr2 from "ipaddr.js";
var BLOCKED_SCHEMES2 = ["file:", "data:", "javascript:", "vbscript:", "tauri:", "about:", "blob:"];
var PRIVATE_HOSTNAMES2 = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1"
]);
function isPrivateIp2(hostname) {
  const bare = hostname.replace(/^\[|\]$/g, "");
  let addr;
  try {
    addr = ipaddr2.parse(bare);
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
var UrlValidationError2 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UrlValidationError";
  }
};
function parseUrl(raw) {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const blockedScheme = BLOCKED_SCHEMES2.find(
    (scheme) => lower.startsWith(scheme)
  );
  if (blockedScheme) {
    throw new UrlValidationError2(`Blocked scheme: ${blockedScheme}`);
  }
  try {
    return new URL(trimmed);
  } catch {
    throw new UrlValidationError2(`Invalid URL: ${trimmed}`);
  }
}
function validateUrl2(raw) {
  const parsed = parseUrl(raw);
  if (parsed.protocol !== "https:") {
    throw new UrlValidationError2(`Only https URLs are allowed, got: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES2.has(hostname)) {
    throw new UrlValidationError2(`Private/loopback hostname not allowed: ${hostname}`);
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    throw new UrlValidationError2(`Local hostname not allowed: ${hostname}`);
  }
  if (isPrivateIp2(hostname)) {
    throw new UrlValidationError2(`Private/special-use IP address not allowed: ${hostname}`);
  }
  return parsed;
}
function isValidUrl(raw) {
  try {
    validateUrl2(raw);
    return true;
  } catch {
    return false;
  }
}
function validateServiceUrl(raw) {
  const parsed = parseUrl(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UrlValidationError2(`Only http or https service URLs are allowed, got: ${parsed.protocol}`);
  }
  if (!parsed.hostname) {
    throw new UrlValidationError2("Service URL must include a hostname.");
  }
  return parsed;
}
function isValidServiceUrl(raw) {
  try {
    validateServiceUrl(raw);
    return true;
  } catch {
    return false;
  }
}

// src/research-orchestrator/tools/search/searxng.ts
var DEFAULT_BASE_URL2 = "http://localhost:8080";
function createSearXNGSearchTool(baseUrl = DEFAULT_BASE_URL2, fetchFn) {
  validateServiceUrl(baseUrl);
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      searxng: { baseUrl }
    }
  });
  return createAiSdkSearchTool(engine, "searxng", "Search the web with SearXNG (self-hosted meta search engine)");
}

// src/research-orchestrator/tools/search/youtube.ts
function createYouTubeSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      youtube: { apiKey }
    }
  });
  return createAiSdkSearchTool(
    engine,
    "youtube",
    "Search YouTube videos with the YouTube Data API. Results include video URLs and video IDs for follow-up subtitle extraction."
  );
}

// src/research-orchestrator/tools/search/aggregate.ts
function createAggregateSearchTool(searchKeys, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      brave: searchKeys.braveApiKey ? { apiKey: searchKeys.braveApiKey } : void 0,
      exa: searchKeys.exaApiKey ? { apiKey: searchKeys.exaApiKey } : void 0,
      serper: searchKeys.serperApiKey ? { apiKey: searchKeys.serperApiKey } : void 0,
      tavily: searchKeys.tavilyApiKey ? { apiKey: searchKeys.tavilyApiKey } : void 0,
      searxng: searchKeys.searxngBaseUrl ? { baseUrl: searchKeys.searxngBaseUrl } : void 0
    }
  });
  return createAiSdkSearchTool(
    engine,
    "aggregate",
    "Search the web using all configured providers in parallel and merge the results. Results that appear across multiple providers are deduplicated and ranked by how many engines returned them, then by best per-engine rank. Use this when a single provider's coverage is insufficient or when cross-source corroboration matters more than latency."
  );
}

// src/research-orchestrator/tools/search/index.ts
function hasAnySearchKey(searchKeys) {
  if (!searchKeys) return false;
  return Boolean(
    searchKeys.braveApiKey ?? searchKeys.exaApiKey ?? searchKeys.serperApiKey ?? searchKeys.tavilyApiKey ?? (searchKeys.searxngBaseUrl && isValidServiceUrl(searchKeys.searxngBaseUrl))
  );
}
function createSearchTools(searchKeys, fetchFn) {
  const tools = {};
  if (searchKeys?.braveApiKey) {
    tools.brave_search = createBraveSearchTool(searchKeys.braveApiKey, fetchFn);
  }
  if (searchKeys?.exaApiKey) {
    tools.exa_search = createExaSearchTool(searchKeys.exaApiKey, fetchFn);
  }
  if (searchKeys?.serperApiKey) {
    tools.serper_search = createSerperSearchTool(searchKeys.serperApiKey, fetchFn);
  }
  if (searchKeys?.tavilyApiKey) {
    tools.tavily_search = createTavilySearchTool(searchKeys.tavilyApiKey, fetchFn);
  }
  if (searchKeys?.searxngBaseUrl && isValidServiceUrl(searchKeys.searxngBaseUrl)) {
    tools.searxng_search = createSearXNGSearchTool(searchKeys.searxngBaseUrl, fetchFn);
  }
  if (searchKeys?.youtubeApiKey) {
    tools.youtube_search = createYouTubeSearchTool(searchKeys.youtubeApiKey, fetchFn);
  }
  if (hasAnySearchKey(searchKeys)) {
    tools.aggregate_search = createAggregateSearchTool(searchKeys, fetchFn);
  }
  return tools;
}

// src/research-orchestrator/tools/extract-page-content.ts
import { tool as tool4, zodSchema as zodSchema4, streamText as streamText2 } from "ai";
import { z as z13 } from "zod";

// src/research-orchestrator/utils/abort.ts
function createAbortError3() {
  return new DOMException("The operation was aborted.", "AbortError");
}
function isAbortError4(error) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
function throwIfAborted(abortSignal) {
  if (abortSignal?.aborted) {
    throw createAbortError3();
  }
}
function abortablePromise(promise, abortSignal) {
  if (!abortSignal) return promise;
  throwIfAborted(abortSignal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError3());
    abortSignal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      abortSignal.removeEventListener("abort", abort);
    });
  });
}
function abortableDelay(ms, abortSignal) {
  if (!abortSignal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  throwIfAborted(abortSignal);
  let abort;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    abort = () => {
      clearTimeout(timeout);
      reject(createAbortError3());
    };
    abortSignal.addEventListener("abort", abort, { once: true });
  }).finally(() => {
    if (abort) abortSignal.removeEventListener("abort", abort);
  });
}

// src/research-orchestrator/tools/extract-page-content.ts
var _engine = null;
var _engineFetch = null;
var _enginePageLoader;
function getEngine(fetchFn, pageLoader) {
  if (!_engine || _engineFetch !== fetchFn || _enginePageLoader !== pageLoader) {
    _engine = createSearchExtractEngine({
      fetch: fetchFn,
      pageLoader,
      extractors: [
        new RedditExtractor(),
        new AmazonExtractor(),
        new ShopifyExtractor(),
        new TrustpilotExtractor(),
        new GithubExtractor(),
        new YouTubeExtractor()
      ]
    });
    _engineFetch = fetchFn;
    _enginePageLoader = pageLoader;
  }
  return _engine;
}
function shouldSummarizeContent(summarize, query, usedCustomExtractor) {
  if (query) return true;
  return summarize === true || !usedCustomExtractor && summarize !== false;
}
async function summarizeContent(model, markdown, query, abortSignal) {
  if (!markdown.trim()) return "";
  const result = streamText2({
    model,
    system: "You are a research assistant. Extract and summarize the key information from this page content. Be concise but thorough. Preserve factual details, names, dates, and numbers.",
    prompt: `${markdown}${query ? `

Focus on information related to: ${query}` : ""}`,
    abortSignal
  });
  return result.text;
}
async function extractPageContent(options) {
  const {
    url,
    query,
    summarize: doSummarize,
    method = "auto",
    model,
    fetchFn = globalThis.fetch,
    pageLoader,
    abortSignal
  } = options;
  const engine = getEngine(fetchFn, pageLoader);
  const extractResult = await engine.extract(url, {
    method,
    summarize: false,
    signal: abortSignal
  });
  const { content, html: rawHtml, usedCustomExtractor, warnings } = extractResult;
  if (!rawHtml && !content) {
    return appendExtractionWarnings(
      `No content could be extracted from ${url}. The page may be empty, require JavaScript rendering, or be blocked by a paywall or captcha.`,
      warnings
    );
  }
  const shouldSummarize = shouldSummarizeContent(doSummarize, query, usedCustomExtractor);
  if (!shouldSummarize) return content;
  if (!model || !content.trim()) return content;
  try {
    return await summarizeContent(model, content, query, abortSignal) || content;
  } catch (error) {
    if (isAbortError4(error)) throw error;
    return content;
  }
}
function appendExtractionWarnings(message, warnings) {
  const usefulWarnings = (warnings ?? []).filter((warning) => warning.trim());
  if (usefulWarnings.length === 0) return message;
  return `${message}

Warnings:
${usefulWarnings.map((warning) => `- ${warning}`).join("\n")}`;
}
var extractPageContentInputSchema2 = z13.object({
  url: z13.string().describe("URL to extract content from"),
  query: z13.string().optional().describe(
    'What you want from the page \u2014 focuses the summary on specific information (e.g. "price", "ingredients list", "author biography").'
  ),
  summarize: z13.boolean().optional().describe(
    "Set to false to get the full page content. By default the page is summarized."
  ),
  method: z13.enum(["auto", "fetch", "render"]).optional().describe(
    "Extraction method. 'auto' tries fetch then falls back to render. 'fetch' forces HTTP-only. 'render' forces browser rendering."
  )
});
function createExtractPageContentTool(model, fetchFn, pageLoader) {
  return tool4({
    description: 'Extract the plain-text content of a web page with scripts, styles, hidden UI, and obvious boilerplate stripped. Use this to read the content of a URL found during research.\n\nBy default the page is summarized. Provide a `query` to focus the summary on specific information \u2014 for example `query: "price and availability"` returns a summary centered on those details. Set `summarize: false` when you need the full page content.',
    strict: true,
    inputSchema: zodSchema4(extractPageContentInputSchema2),
    outputSchema: zodSchema4(z13.string().describe("Extracted page content")),
    execute: async ({ url, query, summarize: doSummarize, method }, options) => {
      try {
        validateUrl2(url);
      } catch (e) {
        if (e instanceof UrlValidationError2) return `Error: ${e.message}`;
        throw e;
      }
      return extractPageContent({
        url,
        query,
        summarize: doSummarize,
        method,
        model,
        fetchFn,
        pageLoader,
        abortSignal: options?.abortSignal
      });
    }
  });
}

// src/research-orchestrator/tools/research-checkpoint.ts
import { generateText, tool as tool5, zodSchema as zodSchema5 } from "ai";
function createResearchCheckpointTool(model) {
  return tool5({
    description: "Get plain-text research quality guidance before finalizing a researched answer. Include searches run, opened sources, verified claims, unresolved questions, confidence, and readiness. The result is advisory guidance, not an approval or rejection.",
    strict: true,
    inputSchema: zodSchema5(researchCheckpointInputSchema),
    outputSchema: zodSchema5(researchCheckpointResultSchema),
    execute: async (input, options) => {
      return reviewResearchCheckpoint(
        input,
        (checkpoint) => judgeResearchCheckpoint(model, checkpoint, options?.abortSignal)
      );
    }
  });
}
async function judgeResearchCheckpoint(model, checkpoint, abortSignal) {
  const { text } = await generateText({
    model,
    system: "You review whether an agent has done enough research to answer. Return concise plain text guidance only, never JSON. Do not approve or reject the work. Help the agent decide whether more research would materially improve the answer, with attention to direct relevance, source support, recency when relevant, and unresolved gaps.",
    prompt: `Review this research checkpoint.

${JSON.stringify(
      checkpoint,
      null,
      2
    )}`,
    abortSignal
  });
  return text;
}

// src/research-orchestrator/tools/sequential-thinking.ts
import { tool as tool6, zodSchema as zodSchema6 } from "ai";
import { z as z14 } from "zod";
var sequentialThinkingInputSchema = z14.object({
  thought: z14.string().describe("Your current thinking step")
});
function createSequentialThinkingTool() {
  return tool6({
    description: "A detailed tool for dynamic and reflective problem-solving through thoughts. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights as understanding deepens. Use for: breaking down complex problems into steps, planning with room for revision, analysis that might need course correction, problems where the full scope might not be clear initially.",
    strict: true,
    inputSchema: zodSchema6(sequentialThinkingInputSchema),
    execute: async () => ({ status: "ok" })
  });
}

// src/research-orchestrator/tools/research-plan.ts
import { streamText as streamText3, tool as tool7, zodSchema as zodSchema7 } from "ai";
import { z as z15 } from "zod";

// src/research-orchestrator/prompts/research-planner-prompt.ts
var RESEARCH_PLANNER_PROMPT = `You are a research planner.

Create a compact research handoff for another agent.
Do not answer the user. Do not restate the original query.
Define what must be researched, why it matters, and what evidence the next agent should collect.
Classify the goal as decide, compare, verify, explain, find, or troubleshoot.

Return only this structure:

## Objective

{{one sentence describing the decision, explanation, verification, comparison, list, or troubleshooting outcome the next agent must support}}

## Context extracted

- Topic: {{main subject, normalized}}
- User intent: {{what the user is trying to achieve, not just what they asked}}
- Output shape: {{recommendation | comparison | verification | explanation | ranked list | troubleshooting path | other}}
- Freshness: {{timeless | recent | current | today-specific}}
- Constraints: {{specific limits that affect the answer: location, budget, platform, version, compatibility, time sensitivity, legal/regulatory scope, preferences, exclusions}}
- Assumptions to verify: {{claims implied by the query that may be false, outdated, ambiguous, or incomplete}}

## Must-answer questions

Create only the questions needed to satisfy the objective.

| Question     | Why it matters      | Evidence to collect                                | Best source types                                       | Suggested searches                         |
| ------------ | ------------------- | -------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| {{question}} | {{decision impact}} | {{facts/data/examples/limits/prices/quotes/specs}} | {{official/vendor/government/source/review/forum/etc.}} | {{query 1}}; {{query 2}}; ...; {{query N}} |

## Source priority

- Primary: {{official, legal, regulatory, vendor, source-code, dataset, or direct-documentation sources to prefer}}
- Secondary: {{independent analysis, reputable reporting, benchmarks, reviews, or explainers to use for context}}
- Experiential: {{forums, user reports, issue trackers, comments, and firsthand accounts to use carefully}}
- Weak: {{content farms, unsourced summaries, stale pages, marketing-only claims, or AI-generated pages to avoid or corroborate}}

## Research passes

### Map the topic

- Purpose: {{build broad context, terminology, actors, options, timelines, or competing claims}}
- Search pattern: broad
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{high-quality overview sources and source trails}}
- Extract: {{key terms, entities, claims, dates, numbers, source leads, and likely disagreements}}

### Primary evidence

- Purpose: {{collect the strongest direct evidence for the central questions}}
- Search pattern: official / source-code-level / jurisdiction-specific / pricing / availability
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{Primary sources}}
- Extract: {{exact claims, prices, dates, specs, rules, compatibility limits, quotes, and links}}

### Independent evidence

- Purpose: {{corroborate, compare, and find limitations or conflicting evidence}}
- Search pattern: comparison / failures / implementation / user reports
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{Secondary and Experiential sources}}
- Extract: {{exact fields, facts, claims, examples, conflicts, dates, numbers, links, or caveats to capture}}

### Synthesis

- Purpose: {{resolve contradictions and decide what the final answer can support}}
- Search pattern: targeted follow-up
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{sources that settle weak or disputed claims}}
- Extract: {{remaining uncertainty, confidence level, caveats, and final evidence map}}

Repeat for as many passes as needed. Prefer 3-6 focused passes, but use more if the query requires separate subtopics.

## Confidence rules

- High: {{multiple strong sources agree, primary evidence supports key claims, and dates are appropriate for the Freshness classification}}
- Medium: {{evidence is credible but incomplete, indirect, or has minor conflicts}}
- Low: {{claims rely on weak, stale, unavailable, or contradictory evidence}}

## Stop conditions

Stop only when must-answer questions are answered, key claims have source support, contradictions are handled, and further searching is unlikely to change the answer.`;

// src/research-orchestrator/tools/research-plan.ts
var researchPlanInputSchema = z15.object({
  query: z15.string().min(1).describe("The user's research question or request")
});
function createResearchPlanTool(model) {
  return tool7({
    description: "Call this after asking clarifying questions to create a research plan.",
    strict: true,
    inputSchema: zodSchema7(researchPlanInputSchema),
    execute: async ({ query }, options) => {
      const result = streamText3({
        model,
        system: RESEARCH_PLANNER_PROMPT,
        prompt: query,
        abortSignal: options?.abortSignal
      });
      const text = await result.text;
      if (!text || !text.trim()) {
        return "Error: Research plan was empty. Please try again with a more specific query.";
      }
      return text;
    }
  });
}

// src/research-orchestrator/tools/facts-check.ts
import { generateText as generateText2, tool as tool8, zodSchema as zodSchema8 } from "ai";
import { z as z16 } from "zod";
var URL_PATTERN = /https?:\/\/[^\s)\]>"')]+/g;
function extractUrls(text) {
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?>]+$/, "")))];
}
var factsCheckInputSchema = z16.object({
  originalPrompt: z16.string().min(1).describe(
    "The original research objective, including the user's questions and clarifications."
  ),
  finalResearch: z16.string().min(1).describe(
    "The final research answer/report to fact-check. Must include the source URLs cited in the text."
  )
});
var FACTS_CHECK_SYSTEM = `You are a fact-checking assistant. You will receive:
1. A research answer that contains factual claims and source URLs.
2. The content extracted from each cited source.

Your job is to check whether the high-risk factual claims in the research answer are supported by the cited sources. Focus on:
- Exact numbers, prices, dimensions, dates, quantities, statistics
- Named entities, product availability, regulatory/legal claims
- Any claim that would materially change the answer if wrong

Ignore narrative, style, opinions, and generic explanations.

For each claim you check, state:
- The claim from the research answer
- What the source actually says (quote if possible)
- Whether the claim is confirmed, contradicted, or unverifiable from the sources

If all checked claims are confirmed, say so. If something is wrong or unsupported, state the incorrect claim, the corrected information, and the basis for the correction. If a source could not be fetched, say so explicitly.

Return plain text, not JSON.`;
function createFactsCheckTool(model, config = {}) {
  return tool8({
    description: "Call this before giving the final answer. It extracts source URLs from the research text, opens each one, and checks whether the high-risk factual claims are supported by those sources.",
    strict: true,
    inputSchema: zodSchema8(factsCheckInputSchema),
    outputSchema: zodSchema8(
      z16.string().describe("Plain-text fact-check notes")
    ),
    execute: async (input, options) => {
      const urls = extractUrls(input.finalResearch);
      if (urls.length === 0) {
        return "No source URLs found in the research text. Fact-check could not be performed.";
      }
      const fetchResults = await Promise.allSettled(
        urls.map(async (url) => {
          const content = await extractPageContent({
            url,
            summarize: false,
            fetchFn: config.fetchFn,
            pageLoader: config.pageLoader,
            abortSignal: options?.abortSignal
          });
          return { url, content };
        })
      );
      const sourceSections = [];
      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        const url = urls[i];
        if (result.status === "fulfilled" && result.value.content) {
          sourceSections.push(
            `--- Source ${i + 1}: ${url} ---
${result.value.content}`
          );
        } else {
          const reason = result.status === "rejected" ? result.reason instanceof Error ? result.reason.message : String(result.reason) : "empty content";
          sourceSections.push(
            `--- Source ${i + 1}: ${url} ---
[Could not fetch: ${reason}]`
          );
        }
      }
      const prompt = [
        "Original research objective:",
        input.originalPrompt,
        "",
        "Research answer to fact-check:",
        input.finalResearch,
        "",
        "Cited source contents:",
        ...sourceSections
      ].join("\n");
      const { text } = await generateText2({
        model,
        system: FACTS_CHECK_SYSTEM,
        prompt,
        abortSignal: options?.abortSignal
      });
      return text.trim() || "Fact-check completed, but no notes were returned.";
    }
  });
}

// src/research-orchestrator/tools/tool-registry.ts
async function createResearchTools(config) {
  const { model, fetchFn, searchKeys, pageLoader } = config;
  const searchTools = createSearchTools(searchKeys, fetchFn);
  const tools = {
    ask_questions: questionsTool,
    disambiguate: createDisambiguateTool(fetchFn),
    ...searchTools,
    extract_page_content: createExtractPageContentTool(model, fetchFn, pageLoader),
    research_checkpoint: createResearchCheckpointTool(model),
    sequential_thinking: createSequentialThinkingTool(),
    create_research_plan: createResearchPlanTool(model),
    facts_check: createFactsCheckTool(model, { fetchFn, pageLoader })
  };
  return applyToolCallRequirementSafeguards(tools);
}

// src/research-orchestrator/orchestrator/guarded-stream.ts
var MAX_GUARD_RETRIES = 2;
var DEFAULT_MAX_RETRIES_PER_GUARD = {
  question_tool: MAX_GUARD_RETRIES,
  research_checkpoint: MAX_GUARD_RETRIES,
  tool_call_requirement: MAX_GUARD_RETRIES
};
function createGuardedStream({
  model,
  messages,
  abortSignal,
  fetchFn,
  searchKeys,
  pageLoader,
  systemPrompt,
  isHiddenText,
  tools: prebuiltTools,
  extraTools,
  evaluateStep,
  maxGuardRetries,
  getProviderOptions,
  onError,
  onEvent,
  controller
}) {
  return (async () => {
    const effectiveMaxRetries = { ...DEFAULT_MAX_RETRIES_PER_GUARD, ...maxGuardRetries };
    const retries = {};
    let currentUiMessages = messages;
    let toolChoice;
    let sendStart = true;
    let lastFinish;
    try {
      let tools;
      if (prebuiltTools) {
        tools = extraTools ? { ...prebuiltTools, ...extraTools } : prebuiltTools;
      } else {
        const baseTools = await createResearchTools({
          model,
          fetchFn: fetchFn ?? globalThis.fetch.bind(globalThis),
          searchKeys,
          pageLoader
        });
        tools = extraTools ? { ...baseTools, ...extraTools } : baseTools;
      }
      let currentModelMessages = await convertToModelMessages(
        currentUiMessages,
        { tools }
      );
      while (!abortSignal?.aborted) {
        lastFinish = await runAttempt({
          model,
          tools,
          messages: currentModelMessages,
          activeTools: getActiveToolNamesForMessages(
            tools,
            currentUiMessages
          ),
          toolChoice,
          originalMessages: currentUiMessages,
          sendStart,
          abortSignal,
          controller,
          systemPrompt,
          getProviderOptions,
          onError
        });
        if (lastFinish.usage) {
          writeTokenUsageEvent(controller, lastFinish.usage, onEvent);
        }
        const decision = evaluateStep ? evaluateStep({
          messages: currentUiMessages,
          responseMessage: lastFinish.responseMessage
        }) : evaluateAssistantStep({
          messages: currentUiMessages,
          responseMessage: lastFinish.responseMessage,
          isHiddenText
        });
        if (decision.action === "accept") {
          const diagnostic = getNoReplyDiagnostic(lastFinish, isHiddenText);
          if (diagnostic) {
            writeAgentDiagnosticEvent(controller, diagnostic, onEvent);
          }
          break;
        }
        const guardRetryCount = retries[decision.guard] ?? 0;
        const guardMaxRetries = effectiveMaxRetries[decision.guard] ?? MAX_GUARD_RETRIES;
        if (guardRetryCount >= guardMaxRetries) {
          writeGuardrailEvent(controller, maxRetryWarning(decision, guardMaxRetries), onEvent);
          break;
        }
        retries[decision.guard] = guardRetryCount + 1;
        writeGuardrailEvent(controller, {
          ...decision.event,
          attempt: retries[decision.guard]
        }, onEvent);
        currentUiMessages = lastFinish.messages;
        currentModelMessages = await buildRetryMessages({
          messages: currentUiMessages,
          tools,
          instruction: decision.retryInstruction
        });
        toolChoice = decision.toolChoice;
        sendStart = false;
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        return;
      }
      throw error;
    }
  })();
}
async function runAttempt(params) {
  try {
    return await runAttemptOnce(params);
  } catch (error) {
    if (params.toolChoice && !params.abortSignal?.aborted && isForcedToolChoiceUnsupported(error)) {
      return await runAttemptOnce({ ...params, toolChoice: void 0 });
    }
    throw error;
  }
}
function isForcedToolChoiceUnsupported(error) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (message.includes("tool_choice") || message.includes("tool choice")) && (message.includes("thinking") || message.includes("reasoning"));
}
async function runAttemptOnce({
  model,
  tools,
  messages,
  activeTools,
  toolChoice,
  originalMessages,
  sendStart,
  abortSignal,
  controller,
  systemPrompt: effectiveSystemPrompt,
  getProviderOptions,
  onError
}) {
  let finish;
  const result = streamText4({
    model,
    system: effectiveSystemPrompt,
    messages,
    tools,
    activeTools: activeTools.length > 0 ? activeTools : void 0,
    toolChoice,
    abortSignal,
    providerOptions: getProviderOptions ? getProviderOptions({ model, toolChoice }) : void 0
  });
  const stream = result.toUIMessageStream({
    originalMessages,
    sendStart,
    sendFinish: false,
    onError,
    onFinish: (event) => {
      finish = {
        messages: event.messages,
        responseMessage: event.responseMessage,
        finishReason: event.finishReason
      };
    }
  });
  await pipeUIMessageStream(stream, controller, abortSignal);
  let finishReason;
  let totalUsage;
  try {
    finishReason = await result.finishReason;
    totalUsage = await result.totalUsage;
  } catch (err) {
    if (!abortSignal?.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Model attempt finished without a response message: ${message}`);
    }
  }
  if (!finish) {
    throw new Error("Model attempt finished without a response message.");
  }
  finish.finishReason = finish.finishReason ?? finishReason;
  if (totalUsage) {
    finish.usage = {
      inputTokens: totalUsage.inputTokens ?? void 0,
      outputTokens: totalUsage.outputTokens ?? void 0,
      totalTokens: totalUsage.totalTokens ?? void 0
    };
  }
  return finish;
}
async function buildRetryMessages({
  messages,
  tools,
  instruction
}) {
  return [
    ...await convertToModelMessages(messages, { tools }),
    {
      role: "user",
      content: `Internal guardrail retry. ${instruction}`
    }
  ];
}
async function pipeUIMessageStream(stream, controller, abortSignal) {
  await stream.pipeTo(
    new WritableStream({
      write(chunk) {
        controller.enqueue(chunk);
      }
    }),
    { signal: abortSignal, preventClose: true }
  );
}
function writeGuardrailEvent(controller, event, onEvent) {
  controller.enqueue({
    type: "data-guardrail_event",
    id: `guardrail-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: event
  });
  onEvent?.({ type: "guardrail", data: event });
}
function writeAgentDiagnosticEvent(controller, event, onEvent) {
  controller.enqueue({
    type: "data-agent_diagnostic",
    id: `agent-diagnostic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: event
  });
  onEvent?.({ type: "diagnostic", data: event });
}
function writeTokenUsageEvent(controller, usage, onEvent) {
  controller.enqueue({
    type: "data-token_usage",
    id: `token-usage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: usage
  });
  onEvent?.({ type: "token_usage", data: usage });
}
function getNoReplyDiagnostic(finish, isHiddenText) {
  const summary = summarizeAssistantOutput(finish.responseMessage, isHiddenText);
  if (summary.hasVisibleReply) return null;
  if (finish.finishReason === "tool-calls") {
    return null;
  }
  return {
    kind: "empty_response",
    status: "warning",
    title: "No assistant reply",
    message: getNoReplyMessage(finish.finishReason, summary),
    reason: getNoReplyReason(finish.finishReason, summary),
    ...finish.finishReason ? { finishReason: finish.finishReason } : {},
    ...summary.toolCallCount > 0 ? { toolCallCount: summary.toolCallCount } : {}
  };
}
function summarizeAssistantOutput(message, isHiddenText) {
  const hidden = isHiddenText ?? (() => false);
  let hasVisibleReply = false;
  let hasReasoning = false;
  let hasSubAgentText = false;
  let toolCallCount = 0;
  for (const part of message.parts) {
    if (part.type === "text") {
      if (!part.text.trim()) continue;
      if (hidden(part)) {
        hasSubAgentText = true;
      } else {
        hasVisibleReply = true;
      }
      continue;
    }
    if (part.type === "reasoning" && part.text.trim()) {
      hasReasoning = true;
      continue;
    }
    if (part.type === "source-url" || part.type === "source-document" || part.type === "file") {
      hasVisibleReply = true;
      continue;
    }
    if (isToolUIPart3(part)) {
      toolCallCount += 1;
    }
  }
  return {
    hasVisibleReply,
    hasReasoning,
    hasSubAgentText,
    toolCallCount
  };
}
function getNoReplyMessage(finishReason, summary) {
  if (finishReason === "length") {
    return "The provider stopped at the output limit before returning visible answer text.";
  }
  if (finishReason === "content-filter") {
    return "The provider reported a content-filter stop before returning visible answer text.";
  }
  if (summary.toolCallCount > 0) {
    return "The model finished after tool work but did not return final answer text.";
  }
  if (summary.hasSubAgentText) {
    return "Only internal verification or tool-progress text was produced; no final answer text was returned.";
  }
  if (summary.hasReasoning) {
    return "The model produced reasoning but no visible answer text.";
  }
  return "The provider ended the turn without returning visible answer text.";
}
function getNoReplyReason(finishReason, summary) {
  const reason = finishReason ?? "unknown";
  if (summary.toolCallCount > 0) {
    return `Finish reason: ${reason}. Tool calls in the final step: ${summary.toolCallCount}.`;
  }
  return `Finish reason: ${reason}.`;
}
function maxRetryWarning(decision, maxRetries) {
  return {
    kind: decision.guard,
    status: "warning",
    title: "Guardrail retry limit reached",
    message: "The agent kept missing this guardrail, so the latest output is shown.",
    reason: decision.event.reason,
    attempt: maxRetries
  };
}

// src/research-orchestrator/orchestrator/stream.ts
function streamResearch(options) {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const systemPrompt = options.systemPrompt ?? system_prompt_default;
  return new ReadableStream({
    async start(controller) {
      try {
        await createGuardedStream({
          model: options.model,
          messages: options.messages,
          abortSignal: options.abortSignal,
          fetchFn,
          searchKeys: options.searchKeys,
          pageLoader: options.pageLoader,
          systemPrompt,
          isHiddenText: options.isHiddenText,
          tools: options.tools,
          extraTools: options.extraTools,
          evaluateStep: options.evaluateStep,
          maxGuardRetries: options.maxGuardRetries,
          getProviderOptions: options.getProviderOptions,
          onError: options.onError,
          onEvent: options.onEvent,
          controller
        });
        if (options.abortSignal?.aborted) {
          controller.enqueue({ type: "abort", reason: "aborted" });
        } else {
          controller.enqueue({ type: "finish", finishReason: "stop" });
        }
      } catch (error) {
        if (options.abortSignal?.aborted) {
          controller.enqueue({ type: "abort", reason: "aborted" });
        } else {
          controller.enqueue({
            type: "error",
            errorText: error instanceof Error ? error.message : "Research failed."
          });
          controller.enqueue({ type: "finish", finishReason: "error" });
        }
      } finally {
        controller.close();
      }
    }
  });
}

// src/research-orchestrator/index.ts
var DEFAULT_SYSTEM_PROMPT = system_prompt_default;
export {
  DEFAULT_SYSTEM_PROMPT,
  RESEARCH_PLANNER_PROMPT,
  TOOL_CALL_REQUIREMENTS,
  TOOL_NAMES,
  ToolCallRequirementError,
  UrlValidationError2 as UrlValidationError,
  abortableDelay,
  abortablePromise,
  applyToolCallRequirementSafeguards,
  asksUserForInput,
  createAggregateSearchTool,
  createBraveSearchTool,
  createDisambiguateTool,
  createExaSearchTool,
  createExtractPageContentTool,
  createFactsCheckTool,
  createGuardedStream,
  createResearchCheckpointTool,
  createResearchPlanTool,
  createResearchTools,
  createSearXNGSearchTool,
  createSearchTools,
  createSequentialThinkingTool,
  createSerperSearchTool,
  createTavilySearchTool,
  createYouTubeSearchTool,
  evaluateAssistantStep,
  evaluateToolCallRequirementForModelMessages,
  evaluateToolCallRequirementForResponse,
  evaluateToolCallRequirementForUIMessages,
  extractPageContent,
  formatToolCallRequirementViolation,
  getActiveToolNamesForMessages,
  getToolCallNamesFromModelMessages,
  getToolCallNamesFromUIMessages,
  guardrailEventSchema,
  isAbortError4 as isAbortError,
  isResearchLikeRequest,
  isValidServiceUrl,
  isValidUrl,
  questionsTool,
  researchCheckpointInputSchema,
  researchCheckpointResultSchema,
  reviewResearchCheckpoint,
  streamResearch,
  throwIfAborted,
  validateServiceUrl,
  validateUrl2 as validateUrl
};
//# sourceMappingURL=index.js.map
