import { Z as validateUrl, N as readResponseText, D as DEFAULT_MAX_PAGE_BYTES } from "./hacker-news-CZDyDqkb.js";
const extractors = [];
const SCRAPE_DO_API_URL = "https://api.scrape.do/";
async function fetchScrapeDoHtml(url, config, options) {
  validateUrl(url);
  throwIfAborted$1(options?.signal);
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
    if (isAbortError$1(error)) throw error;
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
function isAbortError$1(error) {
  return error instanceof Error && error.name === "AbortError";
}
function throwIfAborted$1(signal) {
  if (!signal?.aborted) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}
const SCRAPING_ANT_API_URL = "https://api.scrapingant.com/v2/general";
function transportErrorCode(error, depth = 0) {
  if (!error || typeof error !== "object" || depth >= 4) return void 0;
  const candidate = error;
  if (typeof candidate.code === "string") return candidate.code;
  return transportErrorCode(candidate.cause, depth + 1);
}
function transportFailureMessage(error) {
  const code = transportErrorCode(error);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "ScrapingAnt request failed during DNS lookup";
  }
  if (code?.startsWith("ERR_TLS") || code?.startsWith("CERT_")) {
    return "ScrapingAnt request failed during TLS negotiation";
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT") {
    return "ScrapingAnt request failed while connecting to the provider";
  }
  return "ScrapingAnt request failed because of a transport error";
}
async function fetchScrapingAntHtml(url, config, options) {
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
      signal: options?.signal
    });
    if (!response.ok) {
      throw new Error(`ScrapingAnt request failed with HTTP ${response.status}`);
    }
    const html = await readResponseText(
      response,
      options?.maxBytes ?? DEFAULT_MAX_PAGE_BYTES
    );
    if (!html) return null;
    return html.trim() ? html : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof Error && error.message.startsWith("ScrapingAnt request failed with HTTP ")) {
      throw error;
    }
    throw new Error(transportFailureMessage(error), { cause: error });
  }
}
function createScrapingAntPageLoader(config) {
  return {
    renderHtml: (url, options) => fetchScrapingAntHtml(url, config, options)
  };
}
function buildScrapingAntUrl(targetUrl, config) {
  const endpoint = new URL(config.endpoint ?? SCRAPING_ANT_API_URL);
  endpoint.searchParams.set("browser", "true");
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value === void 0 || value === null) continue;
    endpoint.searchParams.set(key, String(value));
  }
  endpoint.searchParams.set("x-api-key", config.apiKey.trim());
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
  SCRAPING_ANT_API_URL as a,
  createScrapingAntPageLoader as b,
  createScrapeDoPageLoader as c,
  fetchScrapingAntHtml as d,
  extractors as e,
  fetchScrapeDoHtml as f
};
//# sourceMappingURL=scraping-ant-M1Rs5Tqe.js.map
