import { z } from "zod";
import PQueue from "p-queue";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
const SEARCH_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng",
  "youtube",
  "aggregate"
];
const AGGREGATABLE_PROVIDER_NAMES = [
  "brave",
  "exa",
  "serper",
  "tavily",
  "searxng"
];
const searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
  snippet: z.string().optional()
});
const searchQueryInputSchema = z.object({
  query: z.string().min(1).describe("Search query")
});
class SearchProviderConfigError extends Error {
  provider;
  constructor(provider, message) {
    super(`${provider} ${message}`);
    this.name = "SearchProviderConfigError";
    this.provider = provider;
  }
}
class SearchProviderError extends Error {
  provider;
  status;
  constructor(provider, status, body) {
    const bodySuffix = body ? `: ${body}` : "";
    super(`${provider} search failed with HTTP ${status}${bodySuffix}`);
    this.name = "SearchProviderError";
    this.provider = provider;
    this.status = status;
  }
}
class SearchProviderResponseError extends Error {
  provider;
  constructor(provider, detail) {
    const detailSuffix = detail ? `: ${detail}` : "";
    super(
      `${provider} search response did not match the expected format${detailSuffix}`
    );
    this.name = "SearchProviderResponseError";
    this.provider = provider;
  }
}
class AggregateSearchError extends Error {
  errors;
  constructor(errors, message) {
    super(message);
    this.name = "AggregateSearchError";
    this.errors = [...errors];
  }
}
class UrlValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UrlValidationError";
  }
}
function createRateLimiter(requestsPerSecond = 1, concurrency = 1) {
  const queue = new PQueue({
    concurrency,
    intervalCap: requestsPerSecond,
    interval: 1e3
  });
  return {
    schedule(fn, signal) {
      return queue.add(fn, { signal });
    }
  };
}
let defaultInstance = null;
function getRateLimiter() {
  if (!defaultInstance) {
    defaultInstance = createRateLimiter();
  }
  return defaultInstance;
}
function rateLimit(fn, signal) {
  return getRateLimiter().schedule(fn, signal);
}
function setRateLimiter(limiter) {
  defaultInstance = limiter;
}
function resetRateLimiter() {
  defaultInstance = null;
}
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
const API_BASE_URL$4 = "https://api.search.brave.com/res/v1";
const BraveWebResponseSchema = z.object({
  web: z.object({
    results: z.array(searchResultSchema).optional()
  }).optional()
});
function createBraveSearch(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const apiKey = config.apiKey?.trim() ?? "";
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
      const url = new URL(`${API_BASE_URL$4}/web/search`);
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
const API_BASE_URL$3 = "https://api.exa.ai";
const ExaWebResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      text: z.string()
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
      const response = await fetchImpl(`${API_BASE_URL$3}/search`, {
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
const API_BASE_URL$2 = "https://google.serper.dev";
const SerperWebResponseSchema = z.object({
  organic: z.array(
    z.object({
      title: z.string(),
      link: z.string(),
      snippet: z.string().optional()
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
      const response = await fetchImpl(`${API_BASE_URL$2}/search`, {
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
const API_BASE_URL$1 = "https://api.tavily.com";
const TavilyWebResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string()
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
      const response = await fetchImpl(`${API_BASE_URL$1}/search`, {
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
const DEFAULT_BASE_URL = "http://localhost:8080";
const SearXNGResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string()
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
const API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 50;
const YouTubeSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.object({
        videoId: z.string().optional()
      }).optional(),
      snippet: z.object({
        title: z.string(),
        description: z.string().optional(),
        channelTitle: z.string().optional(),
        publishedAt: z.string().optional()
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
      const url = new URL(`${API_BASE_URL}/search`);
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
const TRACKING_PARAMS = /* @__PURE__ */ new Set([
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
const DEFAULT_AGGREGATE_NUM_RESULTS = 20;
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
        (fn) => rateLimit(() => fn(query, signal), signal)
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
      return rateLimit(() => searchFn(query, options?.signal), options?.signal);
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
          ({ name, fn }) => rateLimit(() => fn(query, options?.signal), options?.signal).then(
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
      const { extractPage } = await import("./extract-page-CQXEvqNy.js").then((n) => n.b);
      return extractPage(url, options, getExtractDeps(config));
    }
  };
}
function formatSearchResults(results) {
  if (results.length === 0) return "No results found.";
  return results.map((r) => `${r.title}: ${r.url}
${r.description}`).join("\n-\n");
}
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const CaptionNameSchema = z.object({
  simpleText: z.string().optional(),
  runs: z.array(
    z.object({
      text: z.string()
    })
  ).optional()
}).optional();
const CaptionTrackSchema = z.object({
  baseUrl: z.string(),
  languageCode: z.string(),
  name: CaptionNameSchema,
  kind: z.string().optional(),
  vssId: z.string().optional(),
  isTranslatable: z.boolean().optional()
});
const PlayerResponseSchema = z.object({
  captions: z.object({
    playerCaptionsTracklistRenderer: z.object({
      captionTracks: z.array(CaptionTrackSchema).optional()
    }).optional()
  }).optional()
});
const Json3TranscriptSchema = z.object({
  events: z.array(
    z.object({
      tStartMs: z.number().optional(),
      dDurationMs: z.number().optional(),
      segs: z.array(
        z.object({
          utf8: z.string().optional()
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
const BLOCKED_SCHEMES = [
  "file:",
  "data:",
  "javascript:",
  "vbscript:",
  "tauri:",
  "about:",
  "blob:"
];
const PRIVATE_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1"
]);
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
    if (isAbortError$1(error)) {
      throw error;
    }
    return null;
  }
}
function isAbortError$1(error) {
  return error instanceof Error && error.name === "AbortError";
}
function createAbortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
class PageExtractor {
}
const MAX_BODY_LENGTH = 500;
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
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    const body = truncate(comment.body.replace(/\n/g, " "));
    const lines = [
      `${prefix}${connector}**${comment.author}** · ${scoreStr(comment.score)}: ${body}`
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
  parts.push(`> **${post.author}** · ${scoreStr(post.score)} · ${commentCount}`);
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
function isRedditUrl(url) {
  const host = url.hostname;
  return host === "reddit.com" || host.endsWith(".reddit.com");
}
function toOldRedditUrl(url) {
  const u = new URL(url);
  u.hostname = "old.reddit.com";
  return u.toString();
}
function normalizeText$2(text) {
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
  return normalizeText$2(
    postEl.find("p.title a.title, a.title").first().text() || $("p.title a.title, a.title").first().text() || $("meta[property='og:title']").attr("content") || $("title").first().text().replace(/\s*:\s*.+$/, "")
  );
}
function hasOldRedditPostContent(html) {
  const $ = load(html);
  return findPostTitle($).length > 0 && $(".commentarea, .thing.comment").length > 0;
}
function isRedditChallengeHtml(html) {
  if (hasOldRedditPostContent(html)) return false;
  const $ = load(html);
  const bodyText = normalizeText$2($("body").text()).toLowerCase();
  const hasChallengeElement = $("#challenge-form").length > 0 || $(".g-recaptcha, .h-captcha").length > 0 || $("[class*='cf-challenge']").length > 0 || $("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").length > 0;
  if (hasChallengeElement) return true;
  return [
    "captcha challenge",
    "captcha required",
    "verify you are human",
    "checking if the site connection is secure",
    "checking your browser",
    "are you a robot",
    "security check"
  ].some((marker) => bodyText.includes(marker));
}
function parseOldRedditHtml(html) {
  const $ = load(html);
  const postEl = findPostElement($);
  const title = findPostTitle($, postEl);
  if (!title) return null;
  const author = postEl.attr("data-author") || normalizeText$2(postEl.find(".tagline .author").first().text());
  const score = parseScore(
    postEl.attr("data-score") || normalizeText$2(postEl.find(".score.unvoted").first().text())
  );
  const selftext = normalizeText$2(
    postEl.find(".expando .usertext-body, .entry .usertext-body, .usertext-body").first().text()
  );
  function parseComment(el) {
    const commentEl = $(el);
    const entry = commentEl.children(".entry").first();
    const cAuthor = commentEl.attr("data-author") || normalizeText$2(entry.find(".tagline .author").first().text());
    const cBody = normalizeText$2(
      entry.find(".usertext-body .md, .usertext-body").first().text()
    );
    const cScore = parseScore(
      commentEl.attr("data-score") || normalizeText$2(entry.find(".score.unvoted").first().text())
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
    num_comments: comments.length
  };
  return parseRedditJson(post, comments);
}
class RedditExtractor extends PageExtractor {
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
}
const AMAZON_TLDS = [
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
function normalizeText$1(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function isAmazonChallengePage(html) {
  const $ = load(html);
  const bodyText = normalizeText$1($("body").text()).toLowerCase();
  if ($("#productTitle").length > 0) return false;
  return [
    "enter the characters you see below",
    "sorry, we just need to make sure you're not a robot",
    "type the characters you see in this image",
    "captcha",
    "are you a robot",
    "sorry, something went wrong"
  ].some((marker) => bodyText.includes(marker));
}
function extractPrice($) {
  const priceEl = $(
    "#priceblock_ourprice, #priceblock_dealprice, #priceblock_saleprice, .apexPriceToPay .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen, .a-price .a-offscreen"
  ).first();
  if (priceEl.length) return normalizeText$1(priceEl.text());
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
function extractReviewCount$1($) {
  const el = $("#acrCustomerReviewText").first();
  return el.length ? normalizeText$1(el.text()) : null;
}
function extractBrand($) {
  const byline = $("a#bylineInfo").first().text().trim();
  if (!byline) return null;
  return byline.replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "").trim();
}
function extractBreadcrumbs($) {
  return [
    ...$("#wayfinding-breadcrumbs_container ul li a").map(
      (_, el) => normalizeText$1($(el).text())
    )
  ].filter(Boolean);
}
function extractBullets($) {
  return [
    ...$(
      "#feature-bullets ul.a-unordered-list li span.a-list-item"
    ).map((_, el) => normalizeText$1($(el).text()))
  ].filter(Boolean);
}
function extractInlineSpecs($) {
  const specs = {};
  $("#productOverview_feature_div table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length >= 2) {
      const key = normalizeText$1($(cells[0]).text());
      const value = normalizeText$1($(cells[1]).text());
      if (key && value) specs[key] = value;
    }
  });
  return specs;
}
const EXPANDER_NOISE = [
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
  return normalizeText$1(cleaned);
}
function extractReviews($, maxReviews = 10) {
  const reviews = [];
  $('[data-hook="review"]').each((_, el) => {
    if (reviews.length >= maxReviews) return;
    const review = $(el);
    const rating = review.find('[data-hook="review-star-rating"] span.a-icon-alt').first().text().trim() || null;
    const title = normalizeText$1(
      review.find('[data-hook="reviewTitle"], h5[data-hook="reviewTitle"]').first().text()
    ) || null;
    const author = normalizeText$1(review.find(".a-profile-name").first().text()) || null;
    const date = normalizeText$1(
      review.find('[data-hook="review-date"]').first().text()
    ) || null;
    const rawBody = review.find('[data-hook="reviewText"]').first().text() || "";
    const body = cleanReviewBody(rawBody) || null;
    const helpful = normalizeText$1(
      review.find('[data-hook="helpful-vote-statement"]').first().text()
    ) || null;
    reviews.push({ rating, title, author, date, body, helpful });
  });
  return reviews;
}
function isUnavailable($) {
  if ($("#outOfStock").length > 0) return true;
  const availabilityText = normalizeText$1(
    $("#availability .primary-availability-message").first().text()
  ).toLowerCase();
  if (availabilityText.includes("currently unavailable")) return true;
  return false;
}
function parseAmazonProductHtml(html) {
  const $ = load(html);
  if (isUnavailable($)) return "Currently unavailable.";
  const title = normalizeText$1(
    $("#productTitle").first().text() || $("[data-automation-id='title']").first().text() || $("meta[property='og:title']").attr("content") || ""
  );
  if (!title) return null;
  const price = extractPrice($);
  const rating = extractRating($);
  const reviewCount = extractReviewCount$1($);
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
class AmazonExtractor extends PageExtractor {
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
}
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
const CURRENCY_SYMBOLS = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  NZD: "NZ$",
  BRL: "R$",
  INR: "₹",
  KRW: "₩",
  CNY: "¥",
  PLN: "zł",
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
    const priceStr = pMax && pMin !== pMax ? `${pMin} – ${pMax}` : pMin;
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
      const priceStr = min === max ? formatCurrency(currency, min.toFixed(2)) : `${formatCurrency(currency, min.toFixed(2))} – ${formatCurrency(currency, max.toFixed(2))}`;
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
  const $ = load(html);
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
class ShopifyExtractor extends PageExtractor {
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
}
const REVIEW_CARD_SELECTORS = [
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
const COMPANY_NAME_SUFFIX = /\s+Reviews?(?:\s+[\d,]+)?$/i;
function isTrustpilotHost(hostname) {
  return hostname === "trustpilot.com" || hostname.endsWith(".trustpilot.com");
}
function isTrustpilotUrl(url) {
  return isTrustpilotHost(url.hostname);
}
function isTrustpilotReviewPageUrl(url) {
  if (!isTrustpilotUrl(url)) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length >= 2 && (segments[0] === "review" || segments[0] === "reviews");
}
function normalizeText(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeMarkdown(text) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}
function firstNonEmpty(...values) {
  for (const value of values) {
    if (value && value.trim()) return normalizeText(value);
  }
  return null;
}
function unique(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}
function metaContent($, names) {
  for (const name of names) {
    const attr = name.startsWith("og:") ? "property" : "name";
    const value = $(`meta[${attr}="${name}"]`).attr("content");
    if (value && value.trim()) return normalizeText(value);
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
  return normalizeText(value).replace(/\s+\|\s+Read Customer Service Reviews.*$/i, "").replace(COMPANY_NAME_SUFFIX, "").trim() || null;
}
function extractCompanyName($, url) {
  const ogTitle = cleanCompanyName(metaContent($, ["og:title", "twitter:title"]));
  if (ogTitle) return ogTitle;
  const h1 = cleanCompanyName($("h1").first().text());
  if (h1) return h1;
  return domainFromUrl(url);
}
function extractProfileStatus($) {
  const bodyText = normalizeText($("body").text());
  const claimed = bodyText.match(
    /Claimed profile(?:\s*[\u2022\u2013-]\s*[A-Za-z][A-Za-z\s]*?\d{4})?(?=\s+(?:[0-5]\.\d|\d+\s+reviews?|TrustScore|Based\s+on)|$)/i
  )?.[0];
  if (claimed) return normalizeText(claimed);
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
  const bodyText = normalizeText($("body").text());
  return bodyText.match(/\bTrustScore\s+([0-5](?:\.\d+)?)\b/i)?.[1] ?? null;
}
function extractStarRating($, jsonLd) {
  const imgAlt = $("img[alt*='TrustScore' i], img[alt*='out of 5' i]").toArray().map((el) => normalizeText($(el).attr("alt") || "")).find((text) => /TrustScore|out of 5/i.test(text));
  if (imgAlt) {
    const match = imgAlt.match(/([0-5](?:\.\d+)?)\s+out of\s+5/i);
    if (match) return `${match[1]} out of 5`;
  }
  if (jsonLd.starRating) return jsonLd.starRating;
  return null;
}
function extractRatingLabel($) {
  const candidates = $("[data-rating-label], [data-testid='trustscore-label'], [class*='trustScore'] p, [class*='trustScore'] span").toArray().map((el) => normalizeText($(el).text())).filter((text) => /^(Excellent|Great|Average|Poor|Bad)$/i.test(text));
  if (candidates.length > 0) return candidates[0];
  const lines = normalizeText($("body").text()).split(/\s*\n\s*|\s{2,}/);
  return lines.find((line) => /^(Excellent|Great|Average|Poor|Bad)$/i.test(line)) ?? null;
}
function extractReviewCount($, jsonLd) {
  const COUNT = String.raw`[\d,]+(?:\.\d+)?\s?[kKmM]?`;
  const selectors = [
    "[data-business-unit-review-count]",
    "[data-testid='review-count']",
    "[data-testid='reviews-count']",
    "[class*='reviewCount']"
  ];
  for (const selector of selectors) {
    const text = normalizeText($(selector).first().text());
    const match = text.match(new RegExp(`(${COUNT})\\s+reviews?`, "i"));
    if (match) return `${normalizeText(match[1])} reviews`;
  }
  const h1Match = normalizeText($("h1").first().text()).match(
    new RegExp(`Reviews?\\s+(${COUNT})`, "i")
  );
  if (h1Match) return `${normalizeText(h1Match[1])} reviews`;
  if (jsonLd.reviewCount) return `${jsonLd.reviewCount} reviews`;
  const metaDescription = metaContent($, ["og:description", "description"]);
  const metaMatch = metaDescription?.match(new RegExp(`what\\s+(${COUNT})\\s+people`, "i"));
  if (metaMatch) return `${normalizeText(metaMatch[1])} reviews`;
  const bodyMatch = normalizeText($("body").text()).match(
    new RegExp(`\\b(${COUNT})\\s+reviews?\\b`, "i")
  );
  return bodyMatch ? `${normalizeText(bodyMatch[1])} reviews` : null;
}
function extractCategories($) {
  const breadcrumbCategories = $("nav a, [aria-label*='breadcrumb' i] a").toArray().map((el) => normalizeText($(el).text())).filter((text) => text && !/^(categories|blog|log in|for businesses)$/i.test(text));
  if (breadcrumbCategories.length > 0) return unique(breadcrumbCategories);
  const categoryLinks = $("a[href^='/categories/'], a[href*='/categories/']").toArray().map((el) => normalizeText($(el).text()));
  return unique(categoryLinks);
}
function textAfterHeading($, headingPattern) {
  const heading = $("h2, h3").filter((_, el) => headingPattern.test(normalizeText($(el).text()))).first();
  if (!heading.length) return null;
  const container = heading.closest("section, aside, div");
  const text = normalizeText(container.text());
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
  const heading = $("h2, h3").filter((_, el) => /Contact info/i.test(normalizeText($(el).text()))).first();
  if (!heading.length) return [];
  const container = heading.closest("section, aside, div");
  const items = container.find("li, a[href^='mailto:'], a[href^='http']").toArray().map((el) => normalizeText($(el).text() || $(el).attr("href") || "")).filter((text) => text && !/Contact info/i.test(text));
  return unique(items).slice(0, 8);
}
function extractRatingDistribution($) {
  const entries = [];
  $("[data-testid*='rating-filter'], [class*='ratingFilter'], [class*='filter'] li").each((_, el) => {
    const text = normalizeText($(el).text());
    const match = text.match(/\b([1-5])-star\b.*?(\d+%)/i);
    if (match) entries.push({ stars: `${match[1]}-star`, percent: match[2] });
  });
  if (entries.length > 0) return dedupeRatingDistribution(entries);
  const bodyText = normalizeText($("body").text());
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
  const alt = card.find("img[alt*='Rated' i], img[alt*='out of 5' i]").toArray().map((el) => normalizeText($(el).attr("alt") || "")).find(Boolean);
  if (!alt) return null;
  const match = alt.match(/Rated\s+([1-5](?:\.\d+)?)\s+out of\s+5/i) ?? alt.match(/([1-5](?:\.\d+)?)\s+out of\s+5/i);
  return match ? `${match[1]} out of 5` : alt;
}
function extractAuthor($, card) {
  const authorEl = card.find("[data-consumer-name-typography], [data-consumer-name], a[href*='/users/']").first();
  const author = normalizeText(authorEl.text());
  const authorContainer = authorEl.closest("aside, div, section");
  const authorText = normalizeText(authorContainer.text());
  const details = author && authorText.startsWith(author) ? normalizeText(authorText.slice(author.length)) : null;
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
  const text = normalizeText(card.text());
  const status = text.match(/\b(Verified|Invited|Redirected|Unprompted review)\b/i)?.[1];
  return status ?? null;
}
function extractReply($, card) {
  const replyEl = card.find("[data-service-review-business-reply], [data-company-reply], section[class*='reply'], div[class*='reply']").filter((_, el) => /Reply from/i.test(normalizeText($(el).text()))).first();
  if (!replyEl.length) return null;
  const text = normalizeText(replyEl.text());
  const company = text.match(/Reply from\s+(.+?)(?:\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|$)/i)?.[1] ?? null;
  const date = firstNonEmpty(
    replyEl.find("time").first().text(),
    replyEl.find("time").first().attr("datetime"),
    text.match(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/)?.[0]
  );
  const textParts = replyEl.find("p, [data-service-review-business-reply-text-typography], [data-company-reply-text]").toArray().map((el) => normalizeText($(el).text())).filter(Boolean).filter((part) => !/^Reply from\b/i.test(part)).filter((part) => !date || part !== date).filter((part) => !company || part !== company);
  const body = firstNonEmpty(
    ...textParts,
    text.replace(/Reply from\s+.+?(?=\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b|$)/i, "").replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/, "").trim()
  );
  if (!body) return null;
  return {
    company: company ? normalizeText(company) : null,
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
    const text = normalizeText(card.text());
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
      const text = normalizeText($(el).text());
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
  if (typeof value === "string" && value.trim()) return normalizeText(value);
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
  const $ = load(html);
  const hasReviewContent = $("h1").text().includes("Reviews") || extractReviewCards($).length > 0 || $("script[type='application/ld+json']").length > 0;
  if (hasReviewContent) return false;
  const bodyText = normalizeText($("body").text()).toLowerCase();
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
  const $ = load(html);
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
    reviewCount: firstNonEmpty(nextData.reviewCount, extractReviewCount($, jsonLd)),
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
class TrustpilotExtractor extends PageExtractor {
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
}
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
class YouTubeExtractor extends PageExtractor {
  constructor(config = {}) {
    super();
    this.config = config;
  }
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
      if (isAbortError(error)) throw error;
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
      if (isAbortError(error)) throw error;
      const subtitleError = error instanceof Error ? error.message : String(error);
      return youtubeTranscriptUnavailableResult(
        input.url.href,
        `${reason}; yt-dlp subtitle fallback failed: ${subtitleError}`
      );
    }
  }
}
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
function isAbortError(error) {
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
export {
  AggregateSearchError as A,
  parseAmazonProductHtml as B,
  parseOldRedditHtml as C,
  parseRedditJson as D,
  parseTrustpilotCompanyHtml as E,
  rateLimit as F,
  resetRateLimiter as G,
  searchQueryInputSchema as H,
  searchResultSchema as I,
  setRateLimiter as J,
  validateUrl as K,
  AGGREGATABLE_PROVIDER_NAMES as L,
  DEFAULT_AGGREGATE_NUM_RESULTS as M,
  mergeResults as N,
  normalizeUrl as O,
  PageExtractor as P,
  RedditExtractor as R,
  SEARCH_PROVIDER_NAMES as S,
  TrustpilotExtractor as T,
  UrlValidationError as U,
  YouTubeExtractor as Y,
  AmazonExtractor as a,
  SearchProviderConfigError as b,
  SearchProviderError as c,
  SearchProviderResponseError as d,
  ShopifyExtractor as e,
  createBraveSearch as f,
  createExaSearch as g,
  createSearXNGFetchSearch as h,
  createSearchExtractEngine as i,
  createSearchProvider as j,
  createSerperSearch as k,
  createTavilySearch as l,
  createYouTubeSearch as m,
  downloadYouTubeSubtitles as n,
  extractYouTubeVideoId as o,
  formatSearchHttpError as p,
  formatSearchResults as q,
  formatYouTubeTranscript as r,
  getRateLimiter as s,
  isAmazonChallengePage as t,
  isRedditChallengeHtml as u,
  isTrustpilotChallengeHtml as v,
  isTrustpilotReviewPageUrl as w,
  isTrustpilotUrl as x,
  isYouTubeVideoUrl as y,
  loadPageHtml as z
};
//# sourceMappingURL=youtube-B2M5GRew.js.map
