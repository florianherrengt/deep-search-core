import type { PageLoader, PageLoadOptions, PageRenderOptions } from "../core/types.js";

export interface TauriLoaderCallbacks {
  fetchHtml: (url: string, abortSignal?: AbortSignal) => Promise<string | null>;
  renderHtml: (url: string, abortSignal?: AbortSignal) => Promise<string | null>;
}

export function createTauriPageLoader(callbacks: TauriLoaderCallbacks): PageLoader {
  return {
    fetchHtml: (url: string, options?: PageLoadOptions) =>
      callbacks.fetchHtml(url, options?.signal),

    renderHtml: (url: string, options?: PageRenderOptions) =>
      callbacks.renderHtml(url, options?.signal),
  };
}
