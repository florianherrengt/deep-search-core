import type { PageLoader, PageRenderOptions } from "../core/types.js";
export declare const SCRAPE_DO_API_URL = "https://api.scrape.do/";
type ScrapeDoParamValue = string | number | boolean | null | undefined;
export interface ScrapeDoPageLoaderConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
    endpoint?: string | URL;
    params?: Record<string, ScrapeDoParamValue>;
}
export declare function fetchScrapeDoHtml(url: string, config: ScrapeDoPageLoaderConfig, options?: PageRenderOptions): Promise<string | null>;
export declare function createScrapeDoPageLoader(config: ScrapeDoPageLoaderConfig): PageLoader;
export {};
//# sourceMappingURL=scrape-do.d.ts.map