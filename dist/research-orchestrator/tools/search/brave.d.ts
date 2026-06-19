export declare const braveSearchInputSchema: import("zod").ZodObject<{
    query: import("zod").ZodString;
}, import("zod/v4/core").$strip>;
export declare function createBraveSearchTool(apiKey: string, fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=brave.d.ts.map