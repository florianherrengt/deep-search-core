import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";
import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";

const FIREBASE_API_BASE_URL = "https://hacker-news.firebaseio.com/v0";
const DEFAULT_MAX_COMMENTS = 80;
const MAX_COMMENTS = 500;
const DEFAULT_MAX_DEPTH = 4;
const MAX_DEPTH = 12;

const HackerNewsItemSchema = z
  .object({
    id: z.number(),
    deleted: z.boolean().optional(),
    type: z
      .enum(["job", "story", "comment", "poll", "pollopt"])
      .optional(),
    by: z.string().optional(),
    time: z.number().optional(),
    text: z.string().optional(),
    dead: z.boolean().optional(),
    parent: z.number().optional(),
    poll: z.number().optional(),
    kids: z.array(z.number()).optional(),
    url: z.string().optional(),
    score: z.number().optional(),
    title: z.string().optional(),
    descendants: z.number().optional(),
  })
  .passthrough();

export type HackerNewsItem = z.infer<typeof HackerNewsItemSchema>;

export interface ParsedHackerNewsComment {
  id: number;
  author: string;
  time?: number;
  text: string;
  replies: ParsedHackerNewsComment[];
}

export interface ParsedHackerNewsThread {
  item: HackerNewsItem;
  comments: ParsedHackerNewsComment[];
  warnings: string[];
}

export interface HackerNewsExtractorConfig {
  maxComments?: number;
  maxDepth?: number;
}

interface CommentLoadState {
  count: number;
  maxComments: number;
  maxDepth: number;
  limitWarningAdded: boolean;
  depthWarningAdded: boolean;
  warnings: string[];
}

export function isHackerNewsItemUrl(url: URL): boolean {
  return (
    url.hostname === "news.ycombinator.com" &&
    url.pathname === "/item" &&
    extractHackerNewsItemId(url) != null
  );
}

export function extractHackerNewsItemId(url: URL): number | null {
  const idParam = url.searchParams.get("id");
  if (!idParam || !/^\d+$/.test(idParam)) return null;
  const id = Number.parseInt(idParam, 10);
  return Number.isSafeInteger(id) ? id : null;
}

export function hackerNewsHtmlToMarkdown(html: string | undefined): string {
  if (!html?.trim()) return "";

  const $ = load(html);
  const markdown = $.root()
    .contents()
    .toArray()
    .map((node) => nodeToMarkdown($, node))
    .join("");

  return normalizeMarkdown(markdown);
}

export function formatHackerNewsThread(thread: ParsedHackerNewsThread): string {
  const { item, comments, warnings } = thread;
  const lines: string[] = [];
  const title = item.title || `Hacker News ${item.type ?? "item"} ${item.id}`;

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Source: ${formatHackerNewsItemUrl(item.id)}`);
  lines.push(`Item ID: ${item.id}`);
  if (item.type) lines.push(`Type: ${item.type}`);
  if (item.by) lines.push(`Author: ${item.by}`);
  if (typeof item.score === "number") lines.push(`Score: ${item.score}`);
  if (typeof item.descendants === "number") {
    lines.push(`Comments: ${item.descendants}`);
  }
  const postedAt = formatUnixTime(item.time);
  if (postedAt) lines.push(`Posted: ${postedAt}`);
  if (item.url) lines.push(`External URL: ${item.url}`);
  if (typeof item.parent === "number") lines.push(`Parent: ${item.parent}`);

  const text = hackerNewsHtmlToMarkdown(item.text);
  if (text) {
    lines.push("");
    lines.push("## Text");
    lines.push("");
    lines.push(text);
  }

  if (comments.length > 0) {
    lines.push("");
    lines.push("## Comments");
    lines.push("");
    for (const comment of comments) {
      appendComment(lines, comment, 0);
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("## Extraction Notes");
    lines.push("");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return normalizeMarkdown(lines.join("\n"));
}

export class HackerNewsExtractor extends PageExtractor {
  private readonly maxComments: number;
  private readonly maxDepth: number;

  constructor(config: HackerNewsExtractorConfig = {}) {
    super();
    this.maxComments = normalizeMaxComments(config.maxComments);
    this.maxDepth = normalizeMaxDepth(config.maxDepth);
  }

  canHandle(url: URL): boolean {
    return isHackerNewsItemUrl(url);
  }

  async extract(input: ExtractorInput): Promise<ExtractorResult | null> {
    const id = extractHackerNewsItemId(input.url);
    if (id == null) return null;

    const fetchImpl = input.fetch ?? globalThis.fetch;
    const item = await fetchHackerNewsItem(fetchImpl, id, input.signal);
    if (!item || item.deleted || item.dead) return null;

    const state: CommentLoadState = {
      count: 0,
      maxComments: this.maxComments,
      maxDepth: this.maxDepth,
      limitWarningAdded: false,
      depthWarningAdded: false,
      warnings: [],
    };
    const comments = await fetchHackerNewsComments(
      fetchImpl,
      item.kids ?? [],
      1,
      state,
      input.signal,
    );

    const content = formatHackerNewsThread({
      item,
      comments,
      warnings: state.warnings,
    });
    return {
      content,
      warnings: state.warnings,
    };
  }
}

async function fetchHackerNewsComments(
  fetchImpl: typeof globalThis.fetch,
  ids: readonly number[],
  depth: number,
  state: CommentLoadState,
  signal?: AbortSignal,
): Promise<ParsedHackerNewsComment[]> {
  if (depth > state.maxDepth) {
    addDepthWarning(state);
    return [];
  }

  const comments: ParsedHackerNewsComment[] = [];
  for (const id of ids) {
    if (state.count >= state.maxComments) {
      addLimitWarning(state);
      break;
    }

    const item = await fetchHackerNewsItem(fetchImpl, id, signal);
    if (!item || item.deleted || item.dead || item.type !== "comment") {
      continue;
    }

    state.count += 1;
    const replies = await fetchHackerNewsComments(
      fetchImpl,
      item.kids ?? [],
      depth + 1,
      state,
      signal,
    );

    comments.push({
      id: item.id,
      author: item.by ?? "[unknown]",
      time: item.time,
      text: hackerNewsHtmlToMarkdown(item.text) || "[deleted]",
      replies,
    });
  }

  return comments;
}

async function fetchHackerNewsItem(
  fetchImpl: typeof globalThis.fetch,
  id: number,
  signal?: AbortSignal,
): Promise<HackerNewsItem | null> {
  const response = await fetchImpl(`${FIREBASE_API_BASE_URL}/item/${id}.json`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Hacker News item ${id} fetch failed with HTTP ${response.status}`,
    );
  }

  const raw = await response.text();
  const parsed = JSON.parse(raw) as unknown;
  if (parsed == null) return null;

  const result = HackerNewsItemSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function nodeToMarkdown($: CheerioAPI, node: AnyNode): string {
  if (node.type === "text") {
    const raw = (node as { data?: string }).data ?? "";
    return raw.replace(/\s+/g, " ");
  }
  if (node.type !== "tag") return "";

  const $node = $(node);
  const tag = node.tagName.toLowerCase();
  const inner = () =>
    $node
      .contents()
      .toArray()
      .map((child) => nodeToMarkdown($, child))
      .join("");

  switch (tag) {
    case "p":
      return `\n\n${inner().trim()}\n\n`;
    case "br":
      return "\n";
    case "a": {
      const href = $node.attr("href") ?? "";
      const text = inner().trim() || href;
      if (!text) return "";
      return href && href !== text ? `${text} (${href})` : text;
    }
    case "pre": {
      const code = $node.text().trim();
      return code ? `\n\n\`\`\`\n${code}\n\`\`\`\n\n` : "";
    }
    case "code": {
      const code = $node.text().trim();
      return code ? `\`${code}\`` : "";
    }
    case "i":
    case "em": {
      const text = inner().trim();
      return text ? `*${text}*` : "";
    }
    case "b":
    case "strong": {
      const text = inner().trim();
      return text ? `**${text}**` : "";
    }
    default:
      return inner();
  }
}

function appendComment(
  lines: string[],
  comment: ParsedHackerNewsComment,
  depth: number,
) {
  const indent = "  ".repeat(depth);
  const meta = [`**${comment.author}**`];
  const postedAt = formatUnixTime(comment.time);
  if (postedAt) meta.push(postedAt);
  lines.push(`${indent}- ${meta.join(" · ")}`);
  lines.push(indentBlock(comment.text, `${indent}  `));
  for (const reply of comment.replies) {
    appendComment(lines, reply, depth + 1);
  }
}

function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `${indent}${line}` : ""))
    .join("\n");
}

function addLimitWarning(state: CommentLoadState) {
  if (state.limitWarningAdded) return;
  state.limitWarningAdded = true;
  state.warnings.push(
    `Comment extraction stopped after ${state.maxComments} comments.`,
  );
}

function addDepthWarning(state: CommentLoadState) {
  if (state.depthWarningAdded) return;
  state.depthWarningAdded = true;
  state.warnings.push(
    `Comment extraction stopped at depth ${state.maxDepth}.`,
  );
}

function formatHackerNewsItemUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

function formatUnixTime(time: number | undefined): string | null {
  if (typeof time !== "number" || !Number.isFinite(time)) return null;
  return new Date(time * 1000).toISOString();
}

function normalizeMarkdown(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}

function normalizeMaxComments(maxComments: number | undefined): number {
  if (!Number.isFinite(maxComments)) return DEFAULT_MAX_COMMENTS;
  return Math.min(
    MAX_COMMENTS,
    Math.max(0, Math.trunc(maxComments ?? DEFAULT_MAX_COMMENTS)),
  );
}

function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (!Number.isFinite(maxDepth)) return DEFAULT_MAX_DEPTH;
  return Math.min(
    MAX_DEPTH,
    Math.max(0, Math.trunc(maxDepth ?? DEFAULT_MAX_DEPTH)),
  );
}
