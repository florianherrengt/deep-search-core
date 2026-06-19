import ipaddr from "ipaddr.js";
import { UrlValidationError } from "../core/errors.js";
import type { PageLoadOptions } from "../core/types.js";

const BLOCKED_SCHEMES = [
  "file:",
  "data:",
  "javascript:",
  "vbscript:",
  "tauri:",
  "about:",
  "blob:",
] as const;

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

function isPrivateIp(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");

  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(bare);
  } catch {
    return false;
  }

  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    }
  }

  return addr.range() !== "unicast";
}

export function validateUrl(raw: string): URL {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const blockedScheme = BLOCKED_SCHEMES.find((scheme) =>
    lower.startsWith(scheme),
  );

  if (blockedScheme) {
    throw new UrlValidationError(`Blocked scheme: ${blockedScheme}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UrlValidationError(`Invalid URL: ${trimmed}`);
  }

  if (parsed.protocol !== "https:") {
    throw new UrlValidationError(
      `Only https URLs are allowed, got: ${parsed.protocol}`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (PRIVATE_HOSTNAMES.has(hostname)) {
    throw new UrlValidationError(
      `Private/loopback hostname not allowed: ${hostname}`,
    );
  }

  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    throw new UrlValidationError(`Local hostname not allowed: ${hostname}`);
  }

  if (isPrivateIp(hostname)) {
    throw new UrlValidationError(
      `Private/special-use IP address not allowed: ${hostname}`,
    );
  }

  return parsed;
}

export async function loadPageHtml(
  url: string,
  fetchImpl: typeof globalThis.fetch,
  options?: PageLoadOptions,
): Promise<string | null> {
  validateUrl(url);

  if (options?.signal?.aborted) {
    throw createAbortError();
  }

  try {
    const response = await fetchImpl(url, {
      signal: options?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      return null;
    }

    return await response.text();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
