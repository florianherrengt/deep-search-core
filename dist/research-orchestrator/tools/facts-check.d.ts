import { type LanguageModel } from "ai";
import { z } from "zod";
import type { FetchFn, PageLoader } from "../types";
export declare const factsCheckInputSchema: z.ZodObject<{
    originalPrompt: z.ZodString;
    finalResearch: z.ZodString;
}, z.core.$strip>;
export interface CreateFactsCheckToolConfig {
    fetchFn?: FetchFn;
    pageLoader?: PageLoader;
}
export declare function createFactsCheckTool(model: LanguageModel, config?: CreateFactsCheckToolConfig): import("ai").Tool<{
    originalPrompt: string;
    finalResearch: string;
}, string>;
//# sourceMappingURL=facts-check.d.ts.map