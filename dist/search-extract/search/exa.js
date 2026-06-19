import { z } from "zod";
import { createSearchProvider, formatSearchHttpError, } from "./create-search-provider.js";
import { SearchProviderError, SearchProviderConfigError, } from "../core/errors.js";
const API_BASE_URL = "https://api.exa.ai";
const ExaWebResponseSchema = z.object({
    results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        text: z.string(),
    })),
});
export function createExaSearch(config) {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    const apiKey = config.apiKey?.trim() ?? "";
    return createSearchProvider({
        providerName: "Exa",
        responseSchema: ExaWebResponseSchema,
        throwOnParseError: true,
        mapResults: (r) => r.results.map((r) => ({
            title: r.title,
            url: r.url,
            description: r.text,
        })),
        execute: async (query, abortSignal) => {
            if (!apiKey) {
                throw new SearchProviderConfigError("Exa", "requires a valid apiKey");
            }
            const response = await fetchImpl(`${API_BASE_URL}/search`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                },
                body: JSON.stringify({
                    query,
                    type: "auto",
                    numResults: 5,
                    contents: { text: true },
                }),
                signal: abortSignal,
            });
            if (!response.ok) {
                const errText = await formatSearchHttpError("Exa", response);
                const match = errText.match(/HTTP (\d+)/);
                const status = match ? parseInt(match[1], 10) : 0;
                const bodyPart = errText.replace(/^.*?: /, "");
                throw new SearchProviderError("Exa", status, bodyPart);
            }
            return await response.text();
        },
    });
}
//# sourceMappingURL=exa.js.map