import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
export declare class ShopifyExtractor extends PageExtractor {
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
//# sourceMappingURL=shopify.d.ts.map