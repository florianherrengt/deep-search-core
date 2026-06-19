export declare const searxngSearchInputSchema: import("zod").ZodObject<{
    query: import("zod").ZodString;
}, import("zod/v4/core").$strip>;
export declare function createSearXNGSearchTool(baseUrl: string | undefined, fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=searxng.d.ts.map