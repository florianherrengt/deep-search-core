import type { PageLoadOptions } from "../core/types.js";
export declare function validateUrl(raw: string): URL;
export declare function loadPageHtml(url: string, fetchImpl: typeof globalThis.fetch, options?: PageLoadOptions): Promise<string | null>;
//# sourceMappingURL=page-loader.d.ts.map