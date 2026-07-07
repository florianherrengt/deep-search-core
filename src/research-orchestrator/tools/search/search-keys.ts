import type { SearchKeys } from "../../types";
import { isValidServiceUrl } from "../../utils/url-validation";

export type ConfiguredSearchProviderId =
  | "brave"
  | "exa"
  | "serper"
  | "tavily"
  | "searxng"
  | "youtube"
  | "hackernews"
  | "aggregate";

export function normalizeSearchKeys(keys: SearchKeys | undefined): SearchKeys {
  return {
    braveApiKey: trimOptional(keys?.braveApiKey),
    exaApiKey: trimOptional(keys?.exaApiKey),
    serperApiKey: trimOptional(keys?.serperApiKey),
    tavilyApiKey: trimOptional(keys?.tavilyApiKey),
    searxngBaseUrl: trimOptional(keys?.searxngBaseUrl),
    youtubeApiKey: trimOptional(keys?.youtubeApiKey),
    hackerNews: keys?.hackerNews === true,
  };
}

export function hasSearchProviders(keys: SearchKeys | undefined): boolean {
  return getConfiguredSearchProviderIds(keys).some((id) => id !== "aggregate");
}

export function hasAggregatableSearchProviders(keys: SearchKeys | undefined): boolean {
  const normalized = normalizeSearchKeys(keys);
  return Boolean(
    normalized.braveApiKey ||
      normalized.exaApiKey ||
      normalized.serperApiKey ||
      normalized.tavilyApiKey ||
      (normalized.searxngBaseUrl && isValidServiceUrl(normalized.searxngBaseUrl)),
  );
}

export function getConfiguredSearchProviderIds(
  keys: SearchKeys | undefined,
  options: { includeAggregate?: boolean } = {},
): ConfiguredSearchProviderId[] {
  const normalized = normalizeSearchKeys(keys);
  const providers: ConfiguredSearchProviderId[] = [];
  if (normalized.braveApiKey) providers.push("brave");
  if (normalized.exaApiKey) providers.push("exa");
  if (normalized.serperApiKey) providers.push("serper");
  if (normalized.tavilyApiKey) providers.push("tavily");
  if (normalized.searxngBaseUrl && isValidServiceUrl(normalized.searxngBaseUrl)) {
    providers.push("searxng");
  }
  if (normalized.youtubeApiKey) providers.push("youtube");
  if (normalized.hackerNews) providers.push("hackernews");
  if (options.includeAggregate !== false && hasAggregatableSearchProviders(normalized)) {
    providers.push("aggregate");
  }
  return providers;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
