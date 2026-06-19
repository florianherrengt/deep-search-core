import type {
  ExtractOptions,
  ExtractResult,
  PageLoader,
  PageLoadOptions,
  PageRenderOptions,
  Summarizer,
} from "../core/types.js";
import { UrlValidationError } from "../core/errors.js";
import { sanitizeHtml, MIN_CONTENT_LENGTH } from "./sanitize-html.js";
import { loadPageHtml, validateUrl } from "./page-loader.js";
import { PageExtractor, type ExtractorInput } from "./extractors/base.js";

export interface ExtractPageDeps {
  fetch?: typeof globalThis.fetch;
  pageLoader?: PageLoader;
  summarizer?: Summarizer;
  extractors?: PageExtractor[];
}

export async function extractPage(
  url: string,
  options: ExtractOptions | undefined,
  deps: ExtractPageDeps,
): Promise<ExtractResult> {
  const method = options?.method ?? "auto";
  const signal = options?.signal;
  const warnings: string[] = [];

  const parsedUrl = validateUrl(url);

  // Abort early if already aborted
  if (signal?.aborted) {
    throw createAbortError();
  }

  // Try custom extractors first
  const extractors = deps.extractors ?? [];
  const extractorInput: ExtractorInput = {
    url: parsedUrl,
    loader: deps.pageLoader ?? {},
    signal,
  };

  for (const extractor of extractors) {
    if (!extractor.canHandle(parsedUrl)) continue;

    try {
      const result = await extractor.extract(extractorInput);
      if (result != null && result.content !== "") {
        const extractResult: ExtractResult = {
          url,
          content: result.content,
          html: result.html ?? null,
          usedCustomExtractor: true,
          extractorName: extractor.constructor.name,
          method: "custom",
          warnings: [...warnings, ...(result.warnings ?? [])],
        };
        return applySummarization(extractResult, options, deps.summarizer);
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      warnings.push(
        `Custom extractor ${extractor.constructor.name} failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // If extractor returned null/empty, fall through to generic extraction
    break;
  }

  // Generic extraction
  return genericExtract(url, method, signal, deps, warnings, options);
}

async function genericExtract(
  url: string,
  method: "auto" | "fetch" | "render",
  signal: AbortSignal | undefined,
  deps: ExtractPageDeps,
  warnings: string[],
  options: ExtractOptions | undefined,
): Promise<ExtractResult> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (method === "render") {
    if (!deps.pageLoader?.renderHtml) {
      warnings.push("Renderer not available");
      const result: ExtractResult = {
        url,
        content: "",
        usedCustomExtractor: false,
        method: "render",
        warnings,
      };
      return result;
    }

    const renderOptions: PageRenderOptions = { signal };
    const html = await deps.pageLoader.renderHtml(url, renderOptions);
    const content = html ? sanitizeHtml(html) : "";

    const result: ExtractResult = {
      url,
      content,
      html,
      usedCustomExtractor: false,
      method: "render",
      warnings,
    };
    return applySummarization(result, options, deps.summarizer);
  }

  // fetch or auto: fetch first
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const loadOptions: PageLoadOptions = { signal };
  const html = deps.pageLoader?.fetchHtml
    ? await deps.pageLoader.fetchHtml(url, loadOptions)
    : await loadPageHtml(url, fetchImpl, loadOptions);

  const content = html ? sanitizeHtml(html) : "";

  // auto: fall back to render if content is too short
  if (method === "auto" && content.length < MIN_CONTENT_LENGTH) {
    if (deps.pageLoader?.renderHtml) {
      const renderOptions: PageRenderOptions = { signal };
      const renderHtmlResult = await deps.pageLoader.renderHtml(url, renderOptions);
      const renderContent = renderHtmlResult ? sanitizeHtml(renderHtmlResult) : "";

      if (renderContent.length >= content.length || content.length === 0) {
        const result: ExtractResult = {
          url,
          content: renderContent || content,
          html: renderHtmlResult ?? html,
          usedCustomExtractor: false,
          method: "render",
          warnings,
        };
        return applySummarization(result, options, deps.summarizer);
      }
    } else {
      warnings.push("Content is short and renderer is not available");
    }
  }

  const result: ExtractResult = {
    url,
    content,
    html,
    usedCustomExtractor: false,
    method: "fetch",
    warnings,
  };
  return applySummarization(result, options, deps.summarizer);
}

async function applySummarization(
  result: ExtractResult,
  options: ExtractOptions | undefined,
  summarizer: Summarizer | undefined,
): Promise<ExtractResult> {
  const shouldSummarize = !!(options?.query || options?.summarize);

  if (!shouldSummarize || !summarizer || !result.content.trim()) {
    return result;
  }

  try {
    result.summary = await summarizer({
      content: result.content,
      query: options?.query,
      signal: options?.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    result.warnings = result.warnings ?? [];
    result.warnings.push(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

export { validateUrl, UrlValidationError };
