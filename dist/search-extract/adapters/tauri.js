export function createTauriPageLoader(callbacks) {
    return {
        fetchHtml: (url, options) => callbacks.fetchHtml(url, options?.signal),
        renderHtml: (url, options) => callbacks.renderHtml(url, options?.signal),
    };
}
//# sourceMappingURL=tauri.js.map