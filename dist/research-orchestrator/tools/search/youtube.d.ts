export declare const youtubeSearchInputSchema: import("zod").ZodObject<{
    query: import("zod").ZodString;
}, import("zod/v4/core").$strip>;
export declare function createYouTubeSearchTool(apiKey: string, fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=youtube.d.ts.map