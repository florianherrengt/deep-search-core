import type { PageLoader } from "../../core/types.js";
export interface ExtractorInput {
    url: URL;
    loader: PageLoader;
    fetch?: typeof globalThis.fetch;
    signal?: AbortSignal;
}
export interface ExtractorResult {
    content: string;
    html?: string | null;
    warnings?: string[];
}
export declare abstract class PageExtractor {
    abstract canHandle(url: URL): boolean;
    abstract extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
//# sourceMappingURL=base.d.ts.map