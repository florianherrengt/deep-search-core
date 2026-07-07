export declare const hackerNewsSearchInputSchema: import("zod").ZodObject<{
    query: import("zod").ZodString;
}, import("zod/v4/core").$strip>;
export declare function createHackerNewsSearchTool(fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=hacker-news.d.ts.map