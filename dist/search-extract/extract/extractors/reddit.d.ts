import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
export declare function isRedditChallengeHtml(html: string): boolean;
export declare function parseOldRedditHtml(html: string): string | null;
export declare class RedditExtractor extends PageExtractor {
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
//# sourceMappingURL=reddit.d.ts.map