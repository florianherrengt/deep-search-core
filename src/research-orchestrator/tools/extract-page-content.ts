import { tool, zodSchema, streamText, type LanguageModel } from "ai";
import { z } from "zod";
import { isAbortError } from "../utils/abort";
import { validateUrl, UrlValidationError } from "../utils/url-validation";
import {
  sanitizeHtml,
  extractVisibleTextFromHtml,
  createSearchExtractEngine,
  RedditExtractor,
  AmazonExtractor,
  ShopifyExtractor,
  type SearchExtractEngine,
  type PageLoader,
} from "../../search-extract/index.js";

export interface ExtractOptions {
  url: string;
  query?: string;
  summarize?: boolean;
  method?: "auto" | "fetch" | "render";
  model?: LanguageModel;
  fetchFn?: typeof globalThis.fetch;
  pageLoader?: PageLoader;
  abortSignal?: AbortSignal;
}

let _engine: SearchExtractEngine | null = null;
let _engineFetch: typeof globalThis.fetch | null = null;
let _enginePageLoader: PageLoader | undefined;

function getEngine(
  fetchFn: typeof globalThis.fetch,
  pageLoader?: PageLoader,
): SearchExtractEngine {
  if (
    !_engine ||
    _engineFetch !== fetchFn ||
    _enginePageLoader !== pageLoader
  ) {
    _engine = createSearchExtractEngine({
      fetch: fetchFn,
      pageLoader,
      extractors: [new RedditExtractor(), new AmazonExtractor(), new ShopifyExtractor()],
    });
    _engineFetch = fetchFn;
    _enginePageLoader = pageLoader;
  }
  return _engine;
}

function shouldSummarizeContent(
  summarize: boolean | undefined,
  query: string | undefined,
  usedCustomExtractor: boolean,
): boolean {
  if (query) return true;
  return (
    summarize === true ||
    (!usedCustomExtractor && summarize !== false)
  );
}

async function summarizeContent(
  model: LanguageModel,
  markdown: string,
  query?: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (!markdown.trim()) return "";
  const result = streamText({
    model,
    system:
      "You are a research assistant. Extract and summarize the key information from this page content. Be concise but thorough. Preserve factual details, names, dates, and numbers.",
    prompt: `${markdown}${query ? `\n\nFocus on information related to: ${query}` : ""}`,
    abortSignal,
  });
  return result.text;
}

export async function extractPageContent(options: ExtractOptions): Promise<string> {
  const {
    url,
    query,
    summarize: doSummarize,
    method = "auto",
    model,
    fetchFn = globalThis.fetch,
    pageLoader,
    abortSignal,
  } = options;

  const engine = getEngine(fetchFn, pageLoader);

  const extractResult = await engine.extract(url, {
    method,
    summarize: false,
    signal: abortSignal,
  });

  const { content, html: rawHtml, usedCustomExtractor } = extractResult;

  if (!rawHtml && !content) {
    return `No content could be extracted from ${url}. The page may be empty, require JavaScript rendering, or be blocked by a paywall or captcha.`;
  }

  const shouldSummarize = shouldSummarizeContent(doSummarize, query, usedCustomExtractor);

  if (!shouldSummarize) return content;

  if (!model || !content.trim()) return content;

  try {
    return (await summarizeContent(model, content, query, abortSignal)) || content;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return content;
  }
}

export const extractPageContentInputSchema = z.object({
  url: z.string().describe("URL to extract content from"),
  query: z
    .string()
    .optional()
    .describe(
      'What you want from the page — focuses the summary on specific information (e.g. "price", "ingredients list", "author biography").',
    ),
  summarize: z
    .boolean()
    .optional()
    .describe(
      "Set to false to get the full page content. By default the page is summarized.",
    ),
  method: z
    .enum(["auto", "fetch", "render"])
    .optional()
    .describe(
      "Extraction method. 'auto' tries fetch then falls back to render. 'fetch' forces HTTP-only. 'render' forces browser rendering.",
    ),
});

export function createExtractPageContentTool(
  model: LanguageModel,
  fetchFn: typeof globalThis.fetch,
  pageLoader?: PageLoader,
) {
  return tool({
    description:
      "Extract the plain-text content of a web page with scripts, styles, hidden UI, and obvious boilerplate stripped. Use this to read the content of a URL found during research.\n\nBy default the page is summarized. Provide a `query` to focus the summary on specific information — for example `query: \"price and availability\"` returns a summary centered on those details. Set `summarize: false` when you need the full page content.",
    strict: true,
    inputSchema: zodSchema(extractPageContentInputSchema),
    outputSchema: zodSchema(z.string().describe("Extracted page content")),
    execute: async ({ url, query, summarize: doSummarize, method }, options) => {
      try {
        validateUrl(url);
      } catch (e) {
        if (e instanceof UrlValidationError) return `Error: ${e.message}`;
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
        abortSignal: options?.abortSignal,
      });
    },
  });
}

export { sanitizeHtml, extractVisibleTextFromHtml };
