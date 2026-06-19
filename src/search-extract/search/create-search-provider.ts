import { z } from "zod";
import type { SearchResult } from "../core/types.js";
import {
  SearchProviderResponseError,
} from "../core/errors.js";

export interface CreateSearchProviderOptions<TResponse> {
  /** Human-readable provider name used in error messages (e.g. "Tavily"). */
  providerName: string;
  /** Schema to validate the response. Can be the full envelope or the array. */
  responseSchema: z.ZodType<TResponse>;
  /** Map a parsed response to SearchResult[]. */
  mapResults: (response: TResponse) => SearchResult[];
  /**
   * Execute the HTTP request. Return the response body as a string.
   * Return "" if the response should be treated as no results.
   * Throw if the error is fatal and should propagate.
   */
  execute: (
    query: string,
    abortSignal?: AbortSignal,
  ) => Promise<string>;
  /**
   * If true (default false), throw on response parse failure.
   * If false, return [] on parse failure (matches Brave/Exa/SearXNG behavior).
   */
  throwOnParseError?: boolean;
}

export function createSearchProvider<TResponse>(
  options: CreateSearchProviderOptions<TResponse>,
) {
  return async (
    query: string,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> => {
    const raw = await options.execute(query, signal);
    const parsed = tryParseJson(raw);
    const result = options.responseSchema.safeParse(parsed);
    if (!result.success) {
      if (options.throwOnParseError) {
        throw new SearchProviderResponseError(
          options.providerName,
          result.error.message,
        );
      }
      return [];
    }
    return options.mapResults(result.data);
  };
}

export async function formatSearchHttpError(
  providerName: string,
  response: Response,
): Promise<string> {
  const body = await readResponseText(response);
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  return `${providerName} search failed with HTTP ${response.status}${statusText}${body ? `: ${body}` : ""}`;
}

async function readResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return truncateForError(text.trim());
  } catch {
    return "";
  }
}

function truncateForError(text: string): string {
  const maxLength = 300;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
