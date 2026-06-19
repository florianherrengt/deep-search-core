import { describe, it, expect, vi } from "vitest";
import { loadPageHtml, validateUrl } from "../page-loader";
import { UrlValidationError } from "../../core/errors";

describe("validateUrl", () => {
  it("accepts valid HTTPS URLs", () => {
    expect(validateUrl("https://example.com/page").hostname).toBe("example.com");
    expect(validateUrl("https://sub.example.com/path?q=1").hostname).toBe("sub.example.com");
  });

  it("throws for invalid URLs", () => {
    expect(() => validateUrl("not-a-valid-url")).toThrow(UrlValidationError);
  });

  it("throws for non-https protocol", () => {
    expect(() => validateUrl("http://example.com")).toThrow(UrlValidationError);
  });

  it("throws for blocked schemes", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(UrlValidationError);
    expect(() => validateUrl("data:text/html,hello")).toThrow(UrlValidationError);
    expect(() => validateUrl("javascript:alert(1)")).toThrow(UrlValidationError);
    expect(() => validateUrl("tauri://localhost")).toThrow(UrlValidationError);
  });

  it("throws for private hostnames", () => {
    expect(() => validateUrl("https://localhost/page")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://127.0.0.1/page")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://[::1]/page")).toThrow(UrlValidationError);
  });

  it("throws for .local and .localhost domains", () => {
    expect(() => validateUrl("https://myservice.local/page")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://myapp.localhost/page")).toThrow(UrlValidationError);
  });

  it("throws for private IPv4 address literals", () => {
    expect(() => validateUrl("https://10.0.0.1/page")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://192.168.1.1/page")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://172.16.0.1/page")).toThrow(UrlValidationError);
  });

  it("throws for loopback IPv4 address literals not in the hostname set", () => {
    expect(() => validateUrl("https://127.1.2.3/page")).toThrow(UrlValidationError);
  });

  it("throws for IPv6 link-local and unique-local address literals", () => {
    expect(() => validateUrl("https://[fe80::1]/page")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://[fc00::1]/page")).toThrow(UrlValidationError);
  });

  it("accepts public IP address literals", () => {
    expect(validateUrl("https://8.8.8.8/page").hostname).toBe("8.8.8.8");
    expect(validateUrl("https://1.1.1.1/page").hostname).toBe("1.1.1.1");
    expect(validateUrl("https://93.184.216.34/page").hostname).toBe("93.184.216.34");
  });

  it("throws for IPv4-mapped IPv6 private address literal", () => {
    expect(() => validateUrl("https://[::ffff:10.0.0.1]/")).toThrow(UrlValidationError);
  });

  it("accepts IPv4-mapped IPv6 public address literal", () => {
    const url = validateUrl("https://[::ffff:8.8.8.8]/");
    expect(url.hostname).toMatch(/^\[::ffff:8/);
    expect(url.hostname.endsWith("]")).toBe(true);
  });

  it("accepts public IPv6 address literal", () => {
    expect(validateUrl("https://[2001:4860:4860::8888]/").hostname).toBe("[2001:4860:4860::8888]");
  });
});

describe("loadPageHtml", () => {
  it("fetches HTML content from a URL", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html><body>Hello</body></html>"),
    });

    const result = await loadPageHtml("https://example.com/page", fetch);

    expect(result).toContain("Hello");
    expect(fetch).toHaveBeenCalledWith("https://example.com/page", {
      signal: undefined,
    });
  });

  it("returns null for non-OK responses", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "text/html" }),
    });

    const result = await loadPageHtml("https://example.com/page", fetch);

    expect(result).toBeNull();
  });

  it("returns null for non-HTML content types", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve('{"key":"value"}'),
    });

    const result = await loadPageHtml("https://example.com/page", fetch);

    expect(result).toBeNull();
  });

  it("accepts text/plain content type", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("Plain text content"),
    });

    const result = await loadPageHtml("https://example.com/page", fetch);

    expect(result).toBe("Plain text content");
  });

  it("throws UrlValidationError for invalid URLs", async () => {
    const fetch = vi.fn();

    await expect(loadPageHtml("not-a-url", fetch)).rejects.toThrow(
      UrlValidationError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates abort signals before fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();

    await expect(
      loadPageHtml("https://example.com/page", fetch, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("aborted");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes abort signal through to fetch", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html>ok</html>"),
    });

    await loadPageHtml("https://example.com/page", fetch, {
      signal: controller.signal,
    });

    expect(fetch).toHaveBeenCalledWith("https://example.com/page", {
      signal: controller.signal,
    });
  });

  it("returns null on fetch network errors", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await loadPageHtml("https://example.com/page", fetch);

    expect(result).toBeNull();
  });

  it("propagates AbortError from fetch", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetch = vi.fn().mockRejectedValue(abortError);

    await expect(loadPageHtml("https://example.com/page", fetch)).rejects.toThrow(
      "aborted",
    );
  });
});
