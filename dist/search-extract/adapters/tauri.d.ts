import type { PageLoader } from "../core/types.js";
export interface TauriLoaderCallbacks {
    fetchHtml: (url: string, abortSignal?: AbortSignal) => Promise<string | null>;
    renderHtml: (url: string, abortSignal?: AbortSignal) => Promise<string | null>;
}
export declare function createTauriPageLoader(callbacks: TauriLoaderCallbacks): PageLoader;
//# sourceMappingURL=tauri.d.ts.map