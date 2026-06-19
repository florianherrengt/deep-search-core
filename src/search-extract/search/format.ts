import type { SearchResult } from "../core/types.js";

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";
  return results
    .map((r) => `${r.title}: ${r.url}\n${r.description}`)
    .join("\n-\n");
}
