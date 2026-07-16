import type { PageLoader, PageRenderOptions } from "../core/types.js";
export declare const SCRAPING_ANT_API_URL = "https://api.scrapingant.com/v2/general";
type ScrapingAntParamValue = string | number | boolean | null | undefined;
export interface ScrapingAntPageLoaderConfig {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
    endpoint?: string | URL;
    params?: Record<string, ScrapingAntParamValue>;
}
export declare function fetchScrapingAntHtml(url: string, config: ScrapingAntPageLoaderConfig, options?: PageRenderOptions): Promise<string | null>;
export declare function createScrapingAntPageLoader(config: ScrapingAntPageLoaderConfig): PageLoader;
export {};
//# sourceMappingURL=scraping-ant.d.ts.map