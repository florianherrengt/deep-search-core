export function formatSearchResults(results) {
    if (results.length === 0)
        return "No results found.";
    return results
        .map((r) => `${r.title}: ${r.url}\n${r.description}`)
        .join("\n-\n");
}
//# sourceMappingURL=format.js.map