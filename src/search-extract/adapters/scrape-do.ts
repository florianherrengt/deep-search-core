import type { PageLoader, PageRenderOptions } from "../core/types.js";
import { validateUrl } from "../extract/page-loader.js";

export const SCRAPE_DO_API_URL = "https://api.scrape.do/";

type ScrapeDoParamValue = string | number | boolean | null | undefined;

export interface ScrapeDoPageLoaderConfig {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  endpoint?: string | URL;
  params?: Record<string, ScrapeDoParamValue>;
}

export async function fetchScrapeDoHtml(
  url: string,
  config: ScrapeDoPageLoaderConfig,
  options?: PageRenderOptions,
): Promise<string | null> {
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
      signal: options?.signal,
    });

    if (!response.ok) return null;

    const html = await response.text();
    return html.trim() ? html : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export function createScrapeDoPageLoader(
  config: ScrapeDoPageLoaderConfig,
): PageLoader {
  return {
    renderHtml: (url, options) => fetchScrapeDoHtml(url, config, options),
  };
}

function buildScrapeDoUrl(
  targetUrl: string,
  config: ScrapeDoPageLoaderConfig,
): URL {
  const endpoint = new URL(config.endpoint ?? SCRAPE_DO_API_URL);

  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value === undefined || value === null) continue;
    endpoint.searchParams.set(key, String(value));
  }

  endpoint.searchParams.set("token", config.apiKey.trim());
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
