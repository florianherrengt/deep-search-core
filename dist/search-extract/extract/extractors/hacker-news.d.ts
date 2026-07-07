import { z } from "zod";
import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
declare const HackerNewsItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    deleted: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodOptional<z.ZodEnum<{
        story: "story";
        job: "job";
        comment: "comment";
        poll: "poll";
        pollopt: "pollopt";
    }>>;
    by: z.ZodOptional<z.ZodString>;
    time: z.ZodOptional<z.ZodNumber>;
    text: z.ZodOptional<z.ZodString>;
    dead: z.ZodOptional<z.ZodBoolean>;
    parent: z.ZodOptional<z.ZodNumber>;
    poll: z.ZodOptional<z.ZodNumber>;
    kids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    url: z.ZodOptional<z.ZodString>;
    score: z.ZodOptional<z.ZodNumber>;
    title: z.ZodOptional<z.ZodString>;
    descendants: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>;
export type HackerNewsItem = z.infer<typeof HackerNewsItemSchema>;
export interface ParsedHackerNewsComment {
    id: number;
    author: string;
    time?: number;
    text: string;
    replies: ParsedHackerNewsComment[];
}
export interface ParsedHackerNewsThread {
    item: HackerNewsItem;
    comments: ParsedHackerNewsComment[];
    warnings: string[];
}
export interface HackerNewsExtractorConfig {
    maxComments?: number;
    maxDepth?: number;
}
export declare function isHackerNewsItemUrl(url: URL): boolean;
export declare function extractHackerNewsItemId(url: URL): number | null;
export declare function hackerNewsHtmlToMarkdown(html: string | undefined): string;
export declare function formatHackerNewsThread(thread: ParsedHackerNewsThread): string;
export declare class HackerNewsExtractor extends PageExtractor {
    private readonly maxComments;
    private readonly maxDepth;
    constructor(config?: HackerNewsExtractorConfig);
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
export {};
//# sourceMappingURL=hacker-news.d.ts.map