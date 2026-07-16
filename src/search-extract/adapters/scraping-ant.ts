import type { PageLoader, PageRenderOptions } from "../core/types.js";
import {
  DEFAULT_MAX_PAGE_BYTES,
  readResponseText,
  validateUrl,
} from "../extract/page-loader.js";

export const SCRAPING_ANT_API_URL =
  "https://api.scrapingant.com/v2/general";

type ScrapingAntParamValue = string | number | boolean | null | undefined;

export interface ScrapingAntPageLoaderConfig {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  endpoint?: string | URL;
  params?: Record<string, ScrapingAntParamValue>;
}

function transportErrorCode(
  error: unknown,
  depth: number = 0,
): string | undefined {
  if (!error || typeof error !== "object" || depth >= 4) return undefined;

  const candidate = error as { cause?: unknown; code?: unknown };
  if (typeof candidate.code === "string") return candidate.code;
  return transportErrorCode(candidate.cause, depth + 1);
}

function transportFailureMessage(error: unknown): string {
  const code = transportErrorCode(error);

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "ScrapingAnt request failed during DNS lookup";
  }

  if (code?.startsWith("ERR_TLS") || code?.startsWith("CERT_")) {
    return "ScrapingAnt request failed during TLS negotiation";
  }

  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  ) {
    return "ScrapingAnt request failed while connecting to the provider";
  }

  return "ScrapingAnt request failed because of a transport error";
}

export async function fetchScrapingAntHtml(
  url: string,
  config: ScrapingAntPageLoaderConfig,
  options?: PageRenderOptions,
): Promise<string | null> {
  const targetUrl = validateUrl(url).href;
  throwIfAborted(options?.signal);

  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("ScrapingAnt API key is required");

  const endpoint = buildScrapingAntUrl(targetUrl, config);
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`ScrapingAnt request failed with HTTP ${response.status}`);
    }

    const html = await readResponseText(
      response,
      options?.maxBytes ?? DEFAULT_MAX_PAGE_BYTES,
    );
    if (!html) return null;
    return html.trim() ? html : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (
      error instanceof Error &&
      error.message.startsWith("ScrapingAnt request failed with HTTP ")
    ) {
      throw error;
    }
    throw new Error(transportFailureMessage(error), { cause: error });
  }
}

export function createScrapingAntPageLoader(
  config: ScrapingAntPageLoaderConfig,
): PageLoader {
  return {
    renderHtml: (url, options) => fetchScrapingAntHtml(url, config, options),
  };
}

function buildScrapingAntUrl(
  targetUrl: string,
  config: ScrapingAntPageLoaderConfig,
): URL {
  const endpoint = new URL(config.endpoint ?? SCRAPING_ANT_API_URL);
  endpoint.searchParams.set("browser", "true");

  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value === undefined || value === null) continue;
    endpoint.searchParams.set(key, String(value));
  }

  endpoint.searchParams.set("x-api-key", config.apiKey.trim());
  endpoint.searchParams.set("url", targetUrl);
  return endpoint;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}
