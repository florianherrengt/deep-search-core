import { z } from "zod";
import { createSearchProvider, formatSearchHttpError, } from "./create-search-provider.js";
import { SearchProviderConfigError, SearchProviderError, } from "../core/errors.js";
const API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 50;
const YouTubeSearchResponseSchema = z.object({
    items: z
        .array(z.object({
        id: z
            .object({
            videoId: z.string().optional(),
        })
            .optional(),
        snippet: z.object({
            title: z.string(),
            description: z.string().optional(),
            channelTitle: z.string().optional(),
            publishedAt: z.string().optional(),
        }),
    }))
        .optional(),
});
export function createYouTubeSearch(config) {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    const apiKey = config.apiKey?.trim() ?? "";
    const maxResults = normalizeMaxResults(config.maxResults);
    return createSearchProvider({
        providerName: "YouTube",
        responseSchema: YouTubeSearchResponseSchema,
        throwOnParseError: true,
        mapResults: (response) => (response.items ?? []).flatMap((item) => {
            const videoId = item.id?.videoId;
            if (!videoId)
                return [];
            return [
                {
                    title: item.snippet.title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    description: formatYouTubeDescription(item, videoId),
                },
            ];
        }),
        execute: async (query, abortSignal) => {
            if (!apiKey) {
                throw new SearchProviderConfigError("YouTube", "requires a valid apiKey");
            }
            const url = new URL(`${API_BASE_URL}/search`);
            url.searchParams.set("part", "snippet");
            url.searchParams.set("type", "video");
            url.searchParams.set("q", query);
            url.searchParams.set("maxResults", String(maxResults));
            url.searchParams.set("key", apiKey);
            const response = await fetchImpl(url.toString(), {
                headers: {
                    accept: "application/json",
                },
                signal: abortSignal,
            });
            if (!response.ok) {
                const errText = await formatSearchHttpError("YouTube", response);
                const match = errText.match(/HTTP (\d+)/);
                const status = match ? parseInt(match[1], 10) : 0;
                const bodyPart = errText.replace(/^.*?: /, "");
                throw new SearchProviderError("YouTube", status, bodyPart);
            }
            return await response.text();
        },
    });
}
function normalizeMaxResults(maxResults) {
    if (!Number.isFinite(maxResults))
        return DEFAULT_MAX_RESULTS;
    return Math.min(MAX_RESULTS, Math.max(1, Math.trunc(maxResults ?? DEFAULT_MAX_RESULTS)));
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
//# sourceMappingURL=youtube.js.map