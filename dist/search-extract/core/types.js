import { z } from "zod";
export const SEARCH_PROVIDER_NAMES = [
    "brave",
    "exa",
    "serper",
    "tavily",
    "searxng",
    "youtube",
    "aggregate",
];
/**
 * Providers that can be queried individually and aggregated by the
 * "aggregate" provider. Excludes "aggregate" itself to avoid recursion.
 */
export const AGGREGATABLE_PROVIDER_NAMES = [
    "brave",
    "exa",
    "serper",
    "tavily",
    "searxng",
];
export const searchResultSchema = z.object({
    title: z.string(),
    url: z.string(),
    description: z.string(),
    snippet: z.string().optional(),
});
export const searchQueryInputSchema = z.object({
    query: z.string().min(1).describe("Search query"),
});
//# sourceMappingURL=types.js.map