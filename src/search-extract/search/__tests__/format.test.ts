import { describe, expect, it } from "vitest";
import { formatSearchResults } from "../format.js";

describe("formatSearchResults", () => {
  it("returns 'No results found.' for empty array", () => {
    expect(formatSearchResults([])).toBe("No results found.");
  });

  it("formats single result", () => {
    const result = formatSearchResults([
      { title: "T", url: "https://a.com", description: "D" },
    ]);
    expect(result).toBe("T: https://a.com\nD");
  });

  it("separates multiple results with newline-hyphen-newline", () => {
    const result = formatSearchResults([
      { title: "A", url: "https://a.com", description: "Desc A" },
      { title: "B", url: "https://b.com", description: "Desc B" },
    ]);
    expect(result).toContain("\n-\n");
    expect(result).toContain("A: https://a.com\nDesc A");
    expect(result).toContain("B: https://b.com\nDesc B");
  });
});
