import { describe, it, expect } from "vitest";
import { validateUrl, isValidUrl, validateServiceUrl, isValidServiceUrl, UrlValidationError } from "../../src/research-orchestrator/utils/url-validation";

describe("UrlValidationError", () => {
  it("has name UrlValidationError", () => {
    const err = new UrlValidationError("test");
    expect(err.name).toBe("UrlValidationError");
    expect(err.message).toBe("test");
  });
});

describe("validateUrl", () => {
  it("accepts valid https URLs", () => {
    expect(validateUrl("https://example.com").href).toBe("https://example.com/");
    expect(validateUrl("https://sub.example.com/path?q=1").href).toBe(
      "https://sub.example.com/path?q=1",
    );
  });

  it("rejects http URLs", () => {
    expect(() => validateUrl("http://example.com")).toThrow(UrlValidationError);
  });

  it("rejects blocked schemes", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(UrlValidationError);
    expect(() => validateUrl("data:text/html,hello")).toThrow(UrlValidationError);
    expect(() => validateUrl("javascript:alert(1)")).toThrow(UrlValidationError);
    expect(() => validateUrl("vbscript:msgbox")).toThrow(UrlValidationError);
    expect(() => validateUrl("tauri://localhost")).toThrow(UrlValidationError);
    expect(() => validateUrl("about:blank")).toThrow(UrlValidationError);
    expect(() => validateUrl("blob:https://example.com")).toThrow(UrlValidationError);
  });

  it("rejects localhost", () => {
    expect(() => validateUrl("https://localhost")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://127.0.0.1")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://0.0.0.0")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://[::1]")).toThrow(UrlValidationError);
  });

  it("rejects .local and .localhost domains", () => {
    expect(() => validateUrl("https://foo.local")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://bar.localhost")).toThrow(UrlValidationError);
  });

  it("rejects private IPs", () => {
    expect(() => validateUrl("https://10.0.0.1")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://172.16.0.1")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://192.168.1.1")).toThrow(UrlValidationError);
    expect(() => validateUrl("https://169.254.1.1")).toThrow(UrlValidationError);
  });

  it("rejects invalid URLs", () => {
    expect(() => validateUrl("not a url")).toThrow(UrlValidationError);
    expect(() => validateUrl("")).toThrow(UrlValidationError);
  });

  it("trims whitespace", () => {
    expect(validateUrl(" https://example.com ").href).toBe("https://example.com/");
  });
});

describe("isValidUrl", () => {
  it("returns true for valid URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
  });

  it("returns false for invalid URLs", () => {
    expect(isValidUrl("http://example.com")).toBe(false);
    expect(isValidUrl("not a url")).toBe(false);
    expect(isValidUrl("https://localhost")).toBe(false);
  });
});

describe("validateServiceUrl", () => {
  it("accepts https", () => {
    expect(validateServiceUrl("https://example.com").href).toBe("https://example.com/");
  });

  it("accepts http (unlike validateUrl)", () => {
    expect(validateServiceUrl("http://example.com").href).toBe("http://example.com/");
    expect(validateServiceUrl("http://localhost:8080").href).toBe("http://localhost:8080/");
  });

  it("rejects blocked schemes", () => {
    expect(() => validateServiceUrl("file:///etc/passwd")).toThrow(UrlValidationError);
    expect(() => validateServiceUrl("data:text/html,hello")).toThrow(UrlValidationError);
  });

  it("rejects URLs without hostname", () => {
    expect(() => validateServiceUrl("https://")).toThrow(UrlValidationError);
  });
});

describe("isValidServiceUrl", () => {
  it("returns true for valid service URLs", () => {
    expect(isValidServiceUrl("https://example.com")).toBe(true);
    expect(isValidServiceUrl("http://localhost:8080")).toBe(true);
  });

  it("returns false for invalid URLs", () => {
    expect(isValidServiceUrl("file:///etc/passwd")).toBe(false);
    expect(isValidServiceUrl("not a url")).toBe(false);
  });
});
