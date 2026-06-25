import type { SearchKeys } from "../../types";
export declare const aggregateSearchInputSchema: import("zod").ZodObject<{
    query: import("zod").ZodString;
}, import("zod/v4/core").$strip>;
/**
 * Build an AI SDK search tool that queries every configured provider in
 * parallel and returns results merged by frequency. Only providers whose
 * credentials are present in `searchKeys` contribute to the merge.
 */
export declare function createAggregateSearchTool(searchKeys: SearchKeys, fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=aggregate.d.ts.map