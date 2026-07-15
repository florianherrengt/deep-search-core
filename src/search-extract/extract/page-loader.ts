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

export const DEFAULT_MAX_PAGE_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function parseIpAddress(hostname: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  const bare = hostname.replace(/^\[|\]$/g, "");

  try {
    const address = ipaddr.parse(bare);

    return address.kind() === "ipv6" && (address as ipaddr.IPv6).isIPv4MappedAddress()
      ? (address as ipaddr.IPv6).toIPv4Address()
      : address;
  } catch {
    return null;
  }
}

function isPrivateIp(hostname: string): boolean {
  const address = parseIpAddress(hostname);
  return address ? address.range() !== "unicast" : false;
}

export function validatePublicIpAddress(address: string): void {
  const parsedAddress = parseIpAddress(address);

  if (!parsedAddress || parsedAddress.range() !== "unicast") {
    throw new UrlValidationError(
      `Private/special-use IP address not allowed: ${address}`,
    );
  }
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

  if (parsed.username || parsed.password) {
    throw new UrlValidationError("URL credentials are not allowed");
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

function contentLengthExceedsLimit(response: Response, maxBytes: number): boolean {
  const contentLength = Number(response.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

async function readStreamWithLimit({
  bytesRead,
  decoder,
  maxBytes,
  reader,
  text,
}: {
  bytesRead: number;
  decoder: TextDecoder;
  maxBytes: number;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  text: string;
}): Promise<string | null> {
  const chunk = await reader.read();

  if (chunk.done) {
    return text + decoder.decode();
  }

  const nextByteCount = bytesRead + chunk.value.byteLength;

  if (nextByteCount > maxBytes) {
    await reader.cancel();
    return null;
  }

  return readStreamWithLimit({
    bytesRead: nextByteCount,
    decoder,
    maxBytes,
    reader,
    text: text + decoder.decode(chunk.value, { stream: true }),
  });
}

export async function readResponseText(
  response: Response,
  maxBytes: number = DEFAULT_MAX_PAGE_BYTES,
): Promise<string | null> {
  if (contentLengthExceedsLimit(response, maxBytes)) {
    await response.body?.cancel();
    return null;
  }

  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength <= maxBytes ? text : null;
  }

  return readStreamWithLimit({
    bytesRead: 0,
    decoder: new TextDecoder(),
    maxBytes,
    reader: response.body.getReader(),
    text: "",
  });
}

async function fetchValidatedResponse({
  fetchImpl,
  maxRedirects,
  redirectsFollowed,
  signal,
  url,
}: {
  fetchImpl: typeof globalThis.fetch;
  maxRedirects: number;
  redirectsFollowed: number;
  signal?: AbortSignal;
  url: string;
}): Promise<Response | null> {
  const parsedUrl = validateUrl(url);
  const response = await fetchImpl(parsedUrl.href, {
    redirect: "manual",
    signal,
  });

  if (response.url) {
    validateUrl(response.url);
  }

  if (!REDIRECT_STATUSES.has(response.status)) {
    return response;
  }

  const location = response.headers.get("location");

  if (!location || redirectsFollowed >= maxRedirects) {
    return null;
  }

  const redirectUrl = new URL(location, parsedUrl);
  validateUrl(redirectUrl.href);

  return fetchValidatedResponse({
    fetchImpl,
    maxRedirects,
    redirectsFollowed: redirectsFollowed + 1,
    signal,
    url: redirectUrl.href,
  });
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
    const response = await fetchValidatedResponse({
      fetchImpl,
      maxRedirects: options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      redirectsFollowed: 0,
      signal: options?.signal,
      url,
    });

    if (!response?.ok) {
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

    return await readResponseText(
      response,
      options?.maxBytes ?? DEFAULT_MAX_PAGE_BYTES,
    );
  } catch (error) {
    if (isAbortError(error) || error instanceof UrlValidationError) {
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
