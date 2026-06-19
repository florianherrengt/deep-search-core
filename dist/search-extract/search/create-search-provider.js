import { SearchProviderResponseError, } from "../core/errors.js";
export function createSearchProvider(options) {
    return async (query, signal) => {
        const raw = await options.execute(query, signal);
        const parsed = tryParseJson(raw);
        const result = options.responseSchema.safeParse(parsed);
        if (!result.success) {
            if (options.throwOnParseError) {
                throw new SearchProviderResponseError(options.providerName, result.error.message);
            }
            return [];
        }
        return options.mapResults(result.data);
    };
}
export async function formatSearchHttpError(providerName, response) {
    const body = await readResponseText(response);
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    return `${providerName} search failed with HTTP ${response.status}${statusText}${body ? `: ${body}` : ""}`;
}
async function readResponseText(response) {
    try {
        const text = await response.text();
        return truncateForError(text.trim());
    }
    catch {
        return "";
    }
}
function truncateForError(text) {
    const maxLength = 300;
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, maxLength)}...`;
}
function tryParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=create-search-provider.js.map