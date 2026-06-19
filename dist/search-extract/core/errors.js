export class SearchProviderConfigError extends Error {
    provider;
    constructor(provider, message) {
        super(`${provider} ${message}`);
        this.name = "SearchProviderConfigError";
        this.provider = provider;
    }
}
export class SearchProviderError extends Error {
    provider;
    status;
    constructor(provider, status, body) {
        const bodySuffix = body ? `: ${body}` : "";
        super(`${provider} search failed with HTTP ${status}${bodySuffix}`);
        this.name = "SearchProviderError";
        this.provider = provider;
        this.status = status;
    }
}
export class SearchProviderResponseError extends Error {
    provider;
    constructor(provider, detail) {
        const detailSuffix = detail ? `: ${detail}` : "";
        super(`${provider} search response did not match the expected format${detailSuffix}`);
        this.name = "SearchProviderResponseError";
        this.provider = provider;
    }
}
export class AggregateSearchError extends Error {
    errors;
    constructor(errors, message) {
        super(message);
        this.name = "AggregateSearchError";
        this.errors = [...errors];
    }
}
export class UrlValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "UrlValidationError";
    }
}
//# sourceMappingURL=errors.js.map