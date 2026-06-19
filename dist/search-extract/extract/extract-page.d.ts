import type { ExtractOptions, ExtractResult, PageLoader, Summarizer } from "../core/types.js";
import { UrlValidationError } from "../core/errors.js";
import { validateUrl } from "./page-loader.js";
import { PageExtractor } from "./extractors/base.js";
export interface ExtractPageDeps {
    fetch?: typeof globalThis.fetch;
    pageLoader?: PageLoader;
    summarizer?: Summarizer;
    extractors?: PageExtractor[];
}
export declare function extractPage(url: string, options: ExtractOptions | undefined, deps: ExtractPageDeps): Promise<ExtractResult>;
export { validateUrl, UrlValidationError };
//# sourceMappingURL=extract-page.d.ts.map