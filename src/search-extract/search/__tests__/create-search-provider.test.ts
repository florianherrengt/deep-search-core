import { describe, expect, it, vi } from "vitest";
import { createSearchProvider, formatSearchHttpError } from "../create-search-provider.js";
import { z } from "zod";
import { SearchProviderResponseError } from "../../core/errors.js";

describe("createSearchProvider", () => {
  const TestSchema = z.object({
    items: z.array(
      z.object({
        name: z.string(),
        link: z.string(),
        desc: z.string(),
      }),
    ),
  });

  it("parses and maps response", async () => {
    const provider = createSearchProvider({
      providerName: "Test",
      responseSchema: TestSchema,
      mapResults: (r) =>
        r.items.map((i) => ({
          title: i.name,
          url: i.link,
          description: i.desc,
        })),
      execute: async () =>
        JSON.stringify({
          items: [{ name: "N", link: "https://n.com", desc: "D" }],
        }),
    });

    const results = await provider("test");
    expect(results).toEqual([
      { title: "N", url: "https://n.com", description: "D" },
    ]);
  });

  it("throws SearchProviderResponseError when throwOnParseError is true and response is invalid", async () => {
    const provider = createSearchProvider({
      providerName: "Test",
      responseSchema: TestSchema,
      throwOnParseError: true,
      mapResults: () => [],
      execute: async () => JSON.stringify({ wrong: "shape" }),
    });

    await expect(provider("test")).rejects.toThrow(SearchProviderResponseError);
  });

  it("returns empty array when throwOnParseError is false and response is invalid", async () => {
    const provider = createSearchProvider({
      providerName: "Test",
      responseSchema: TestSchema,
      mapResults: () => [],
      execute: async () => JSON.stringify({ wrong: "shape" }),
    });

    const results = await provider("test");
    expect(results).toEqual([]);
  });

  it("returns empty array when execute returns empty string", async () => {
    const provider = createSearchProvider({
      providerName: "Test",
      responseSchema: TestSchema,
      mapResults: () => [],
      execute: async () => "",
    });

    const results = await provider("test");
    expect(results).toEqual([]);
  });

  it("passes abort signal to execute", async () => {
    const controller = new AbortController();
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({ items: [] }),
    );

    const provider = createSearchProvider({
      providerName: "Test",
      responseSchema: TestSchema,
      mapResults: (r) => r.items.map((i) => ({ title: i.name, url: i.link, description: i.desc })),
      execute,
    });

    await provider("test", controller.signal);
    expect(execute).toHaveBeenCalledWith("test", controller.signal);
  });
});

describe("formatSearchHttpError", () => {
  it("formats error with status and body", async () => {
    const response = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "rate limit exceeded",
    } as Response;

    const errText = await formatSearchHttpError("Test", response);
    expect(errText).toContain("429");
    expect(errText).toContain("Too Many Requests");
    expect(errText).toContain("rate limit exceeded");
  });

  it("formats error without statusText", async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: "",
      text: async () => "internal error",
    } as Response;

    const errText = await formatSearchHttpError("Test", response);
    expect(errText).toContain("500");
    expect(errText).toContain("internal error");
  });

  it("truncates long error bodies", async () => {
    const longBody = "x".repeat(500);
    const response = {
      ok: false,
      status: 400,
      statusText: "",
      text: async () => longBody,
    } as Response;

    const errText = await formatSearchHttpError("Test", response);
    expect(errText.length).toBeLessThan(longBody.length + 50);
  });
});
