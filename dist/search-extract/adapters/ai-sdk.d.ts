import { type LanguageModel, type Tool } from "ai";
import { z } from "zod";
import type { Summarizer } from "../core/types.js";
import type { SearchExtractEngine } from "../core/engine.js";
import type { SearchProviderName } from "../core/types.js";
export declare function createAiSdkSummarizer(model: LanguageModel): Summarizer;
export declare function createAiSdkSearchTool(engine: SearchExtractEngine, provider: SearchProviderName, description: string): Tool<{
    query: string;
}, string>;
declare const extractPageContentInputSchema: z.ZodObject<{
    url: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    summarize: z.ZodOptional<z.ZodBoolean>;
    method: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        fetch: "fetch";
        webview: "webview";
    }>>;
}, z.core.$strip>;
export declare function createAiSdkExtractPageContentTool(engine: SearchExtractEngine, options?: {
    model?: LanguageModel;
    summarizer?: Summarizer;
}): Tool<z.infer<typeof extractPageContentInputSchema>, string>;
export {};
//# sourceMappingURL=ai-sdk.d.ts.map