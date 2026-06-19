import { type LanguageModel } from "ai";
import { z } from "zod";
import { sanitizeHtml, extractVisibleTextFromHtml, type PageLoader } from "../../search-extract/index.js";
export interface ExtractOptions {
    url: string;
    query?: string;
    summarize?: boolean;
    method?: "auto" | "fetch" | "render";
    model?: LanguageModel;
    fetchFn?: typeof globalThis.fetch;
    pageLoader?: PageLoader;
    abortSignal?: AbortSignal;
}
export declare function extractPageContent(options: ExtractOptions): Promise<string>;
export declare const extractPageContentInputSchema: z.ZodObject<{
    url: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    summarize: z.ZodOptional<z.ZodBoolean>;
    method: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        fetch: "fetch";
        render: "render";
    }>>;
}, z.core.$strip>;
export declare function createExtractPageContentTool(model: LanguageModel, fetchFn: typeof globalThis.fetch, pageLoader?: PageLoader): import("ai").Tool<{
    url: string;
    query?: string | undefined;
    summarize?: boolean | undefined;
    method?: "auto" | "fetch" | "render" | undefined;
}, string>;
export { sanitizeHtml, extractVisibleTextFromHtml };
//# sourceMappingURL=extract-page-content.d.ts.map