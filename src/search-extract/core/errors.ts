export class SearchProviderConfigError extends Error {
  public readonly provider: string;

  constructor(provider: string, message: string) {
    super(`${provider} ${message}`);
    this.name = "SearchProviderConfigError";
    this.provider = provider;
  }
}

export class SearchProviderError extends Error {
  public readonly provider: string;
  public readonly status: number;

  constructor(provider: string, status: number, body?: string) {
    const bodySuffix = body ? `: ${body}` : "";
    super(`${provider} search failed with HTTP ${status}${bodySuffix}`);
    this.name = "SearchProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export class SearchProviderResponseError extends Error {
  public readonly provider: string;

  constructor(provider: string, detail?: string) {
    const detailSuffix = detail ? `: ${detail}` : "";
    super(
      `${provider} search response did not match the expected format${detailSuffix}`,
    );
    this.name = "SearchProviderResponseError";
    this.provider = provider;
  }
}

export class AggregateSearchError extends Error {
  public readonly errors: ReadonlyArray<Error>;

  constructor(errors: Error[], message: string) {
    super(message);
    this.name = "AggregateSearchError";
    this.errors = [...errors];
  }
}

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}
