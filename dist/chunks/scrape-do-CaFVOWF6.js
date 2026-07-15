import { Z as validateUrl, N as readResponseText, D as DEFAULT_MAX_PAGE_BYTES } from "./hacker-news-CZDyDqkb.js";
const extractors = [];
const SCRAPE_DO_API_URL = "https://api.scrape.do/";
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
    const html = await readResponseText(
      response,
      options?.maxBytes ?? DEFAULT_MAX_PAGE_BYTES
    );
    if (!html) return null;
    return html.trim() ? html : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
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
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}
export {
  SCRAPE_DO_API_URL as S,
  createScrapeDoPageLoader as c,
  extractors as e,
  fetchScrapeDoHtml as f
};
//# sourceMappingURL=scrape-do-CaFVOWF6.js.map
