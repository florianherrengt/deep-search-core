export declare class SearchProviderConfigError extends Error {
    readonly provider: string;
    constructor(provider: string, message: string);
}
export declare class SearchProviderError extends Error {
    readonly provider: string;
    readonly status: number;
    constructor(provider: string, status: number, body?: string);
}
export declare class SearchProviderResponseError extends Error {
    readonly provider: string;
    constructor(provider: string, detail?: string);
}
export declare class AggregateSearchError extends Error {
    readonly errors: ReadonlyArray<Error>;
    constructor(errors: Error[], message: string);
}
export declare class UrlValidationError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map