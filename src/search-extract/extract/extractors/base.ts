import type { PageLoader } from "../../core/types.js";

export interface ExtractorInput {
  url: URL;
  loader: PageLoader;
  signal?: AbortSignal;
}

export interface ExtractorResult {
  content: string;
  html?: string | null;
  warnings?: string[];
}

export abstract class PageExtractor {
  abstract canHandle(url: URL): boolean;
  abstract extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
