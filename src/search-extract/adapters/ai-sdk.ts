import { tool, zodSchema, streamText, type LanguageModel, type Tool } from "ai";
import { z } from "zod";
import type { Summarizer } from "../core/types.js";
import { searchQueryInputSchema } from "../core/types.js";
import { UrlValidationError } from "../core/errors.js";
import { formatSearchResults } from "../search/format.js";
import { validateUrl } from "../extract/page-loader.js";
import type { SearchExtractEngine } from "../core/engine.js";
import type { SearchProviderName } from "../core/types.js";

const SUMMARY_SYSTEM_PROMPT =
  "You are a research assistant. Extract and summarize the key information from this page content. Be concise but thorough. Preserve factual details, names, dates, and numbers.";

export function createAiSdkSummarizer(model: LanguageModel): Summarizer {
  return async ({ content, query, signal }) => {
    if (!content.trim()) return "";
    const result = streamText({
      model,
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: `${content}${query ? `\n\nFocus on information related to: ${query}` : ""}`,
      abortSignal: signal,
    });
    return result.text;
  };
}

export function createAiSdkSearchTool(
  engine: SearchExtractEngine,
  provider: SearchProviderName,
  description: string,
): Tool<{ query: string }, string> {
  return tool({
    description,
    strict: true,
    inputSchema: zodSchema(searchQueryInputSchema),
    execute: async ({ query }, ctx) => {
      const results = await engine.search(provider, query, {
        signal: ctx?.abortSignal,
      });
      return formatSearchResults(results);
    },
  });
}

const extractPageContentInputSchema = z.object({
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
    .enum(["auto", "fetch", "webview"])
    .optional()
    .describe(
      "Extraction method. 'auto' tries fetch then falls back to webview. 'fetch' forces HTTP-only. 'webview' forces browser rendering.",
    ),
});

function mapExtractionMethod(method?: string): "auto" | "fetch" | "render" | undefined {
  if (!method) return undefined;
  if (method === "webview") return "render";
  return method as "auto" | "fetch";
}

export function createAiSdkExtractPageContentTool(
  engine: SearchExtractEngine,
  options?: { model?: LanguageModel; summarizer?: Summarizer },
): Tool<z.infer<typeof extractPageContentInputSchema>, string> {
  const summarizer =
    options?.summarizer ??
    (options?.model ? createAiSdkSummarizer(options.model) : undefined);

  return tool({
    description:
      "Extract the plain-text content of a web page with scripts, styles, hidden UI, and obvious boilerplate stripped. Use this to read the content of a URL found during research.\n\nBy default the page is summarized. Provide a `query` to focus the summary on specific information — for example `query: \"price and availability\"` returns a summary centered on those details. Set `summarize: false` when you need the full page content.",
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
        signal: ctx?.abortSignal,
      });

      if (!result.content && !result.html) {
        return `No content could be extracted from ${url}. The page may be empty, require JavaScript rendering, or be blocked by a paywall or captcha.`;
      }

      const shouldSummarize =
        !!query ||
        doSummarize === true ||
        (doSummarize !== false && !result.usedCustomExtractor);

      if (shouldSummarize && summarizer && result.content?.trim()) {
        try {
          const summary = await summarizer({
            content: result.content,
            query,
            signal: ctx?.abortSignal,
          });
          return summary || result.content;
        } catch {
          // summarization failed, fall through to return content
        }
      }

      return result.content;
    },
  });
}
