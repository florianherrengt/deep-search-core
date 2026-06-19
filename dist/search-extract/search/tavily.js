import { z } from "zod";
import { createSearchProvider, formatSearchHttpError, } from "./create-search-provider.js";
import { SearchProviderError, SearchProviderConfigError, } from "../core/errors.js";
const API_BASE_URL = "https://api.tavily.com";
const TavilyWebResponseSchema = z.object({
    results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
    })),
});
export function createTavilySearch(config) {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    const apiKey = config.apiKey?.trim() ?? "";
    return createSearchProvider({
        providerName: "Tavily",
        responseSchema: TavilyWebResponseSchema,
        throwOnParseError: true,
        mapResults: (r) => r.results.map((r) => ({
            title: r.title,
            url: r.url,
            description: r.content,
        })),
        execute: async (query, abortSignal) => {
            if (!apiKey) {
                throw new SearchProviderConfigError("Tavily", "requires a valid apiKey");
            }
            const response = await fetchImpl(`${API_BASE_URL}/search`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    query,
                    search_depth: "basic",
                    max_results: 5,
                }),
                signal: abortSignal,
            });
            if (!response.ok) {
                const errText = await formatSearchHttpError("Tavily", response);
                const match = errText.match(/HTTP (\d+)/);
                const status = match ? parseInt(match[1], 10) : 0;
                const bodyPart = errText.replace(/^.*?: /, "");
                throw new SearchProviderError("Tavily", status, bodyPart);
            }
            return await response.text();
        },
    });
}
//# sourceMappingURL=tavily.js.map