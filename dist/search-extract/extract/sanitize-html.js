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
    "aside",
];
const BLOCK_TAGS = new Set([
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
    "ul",
]);
const TABLE_CELL_TAGS = new Set(["td", "th"]);
const PRUNED_ROLE_VALUES = new Set([
    "alertdialog",
    "banner",
    "complementary",
    "contentinfo",
    "dialog",
    "navigation",
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
    if (!previous || previous === "\n")
        return false;
    if (/\s$/.test(previous))
        return false;
    if (/^[,.;:!?%)\]}]/.test(next))
        return false;
    if (/[([{]$/.test(previous))
        return false;
    return true;
}
function appendText(parts, text) {
    const normalized = normalizeInlineWhitespace(text);
    if (!normalized)
        return;
    const previous = parts[parts.length - 1];
    if (shouldAddSpace(previous, normalized)) {
        parts.push(" ");
    }
    parts.push(normalized);
}
function appendBreak(parts) {
    if (parts.length === 0 || parts[parts.length - 1] === "\n")
        return;
    parts.push("\n");
}
function appendLine(parts, line) {
    const normalized = normalizeInlineWhitespace(line);
    if (!normalized)
        return;
    appendBreak(parts);
    parts.push(normalized);
    appendBreak(parts);
}
function isHiddenByStyle(style) {
    if (!style)
        return false;
    const compact = style.replace(/\s+/g, "").toLowerCase();
    return (compact.includes("display:none") ||
        compact.includes("visibility:hidden") ||
        compact.includes("visibility:collapse") ||
        compact.includes("opacity:0") ||
        compact.includes("width:0") ||
        compact.includes("height:0"));
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
        el.attr("name"),
    ]
        .filter((value) => Boolean(value))
        .join(" ");
}
function shouldPruneElement($, element) {
    const el = $(element);
    const role = el.attr("role")?.toLowerCase().trim();
    return (el.attr("hidden") !== undefined ||
        el.attr("aria-hidden")?.toLowerCase() === "true" ||
        el.attr("type")?.toLowerCase() === "hidden" ||
        isHiddenByStyle(el.attr("style")) ||
        (role !== undefined && PRUNED_ROLE_VALUES.has(role)) ||
        NOISE_ATTRIBUTE_PATTERN.test(attributeText($, element)));
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
    if (!isElementNode(node))
        return "";
    const name = tagName(node);
    if (name === "br")
        return " ";
    if (name === "tr") {
        const cells = node.children
            .filter((child) => isElementNode(child) && TABLE_CELL_TAGS.has(tagName(child)))
            .map((cell) => collectInlineText($, cell))
            .filter(Boolean);
        return cells.join(" | ");
    }
    return node.children
        .map((child) => collectInlineText($, child))
        .filter(Boolean)
        .join(" ");
}
function walkTextNode($, node, parts) {
    if (isTextNode(node)) {
        appendText(parts, node.data);
        return;
    }
    if (!isElementNode(node))
        return;
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
        const cells = node.children
            .filter((child) => isElementNode(child) && TABLE_CELL_TAGS.has(tagName(child)))
            .map((cell) => collectInlineText($, cell))
            .filter(Boolean);
        if (cells.length > 0) {
            appendLine(parts, cells.join(" | "));
            return;
        }
    }
    const isBlock = BLOCK_TAGS.has(name);
    if (isBlock)
        appendBreak(parts);
    for (const child of node.children) {
        walkTextNode($, child, parts);
    }
    if (isBlock)
        appendBreak(parts);
}
function normalizeExtractedText(text) {
    const lines = text
        .replace(/\u00a0/g, " ")
        .replace(/[^\S\n]+/g, " ")
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const occurrences = new Map();
    const cappedLines = [];
    for (const line of lines) {
        const key = line.toLowerCase().replace(/\s+/g, " ");
        const count = occurrences.get(key) ?? 0;
        occurrences.set(key, count + 1);
        if (count >= MAX_REPEATED_LINE_OCCURRENCES)
            continue;
        cappedLines.push(line);
    }
    return cappedLines.join("\n").trim();
}
export function extractVisibleTextFromHtml(html) {
    const $ = load(html);
    pruneDom($);
    const roots = $("body").length > 0
        ? $("body").contents().toArray()
        : $.root().contents().toArray();
    const parts = [];
    for (const node of roots) {
        walkTextNode($, node, parts);
    }
    return normalizeExtractedText(parts.join(""));
}
export function sanitizeHtml(html) {
    return extractVisibleTextFromHtml(html);
}
export { MIN_CONTENT_LENGTH };
//# sourceMappingURL=sanitize-html.js.map