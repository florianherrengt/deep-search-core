import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
export declare function isAmazonChallengePage(html: string): boolean;
export declare function parseAmazonProductHtml(html: string): string | null;
export declare class AmazonExtractor extends PageExtractor {
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
//# sourceMappingURL=amazon.d.ts.map