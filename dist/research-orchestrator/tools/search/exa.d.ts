export declare const exaSearchInputSchema: import("zod").ZodObject<{
    query: import("zod").ZodString;
}, import("zod/v4/core").$strip>;
export declare function createExaSearchTool(apiKey: string, fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=exa.d.ts.map