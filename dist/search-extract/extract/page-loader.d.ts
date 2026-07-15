import type { PageLoadOptions } from "../core/types.js";
export declare const DEFAULT_MAX_PAGE_BYTES = 2000000;
export declare function validatePublicIpAddress(address: string): void;
export declare function validateUrl(raw: string): URL;
export declare function readResponseText(response: Response, maxBytes?: number): Promise<string | null>;
export declare function loadPageHtml(url: string, fetchImpl: typeof globalThis.fetch, options?: PageLoadOptions): Promise<string | null>;
//# sourceMappingURL=page-loader.d.ts.map