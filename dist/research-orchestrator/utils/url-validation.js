import ipaddr from "ipaddr.js";
const BLOCKED_SCHEMES = ["file:", "data:", "javascript:", "vbscript:", "tauri:", "about:", "blob:"];
const PRIVATE_HOSTNAMES = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "[::1]",
    "::1",
]);
function isPrivateIp(hostname) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    let addr;
    try {
        addr = ipaddr.parse(bare);
    }
    catch {
        return false;
    }
    if (addr.kind() === "ipv6") {
        const v6 = addr;
        if (v6.isIPv4MappedAddress()) {
            addr = v6.toIPv4Address();
        }
    }
    return addr.range() !== "unicast";
}
export class UrlValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "UrlValidationError";
    }
}
function parseUrl(raw) {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();
    const blockedScheme = BLOCKED_SCHEMES.find((scheme) => lower.startsWith(scheme));
    if (blockedScheme) {
        throw new UrlValidationError(`Blocked scheme: ${blockedScheme}`);
    }
    try {
        return new URL(trimmed);
    }
    catch {
        throw new UrlValidationError(`Invalid URL: ${trimmed}`);
    }
}
export function validateUrl(raw) {
    const parsed = parseUrl(raw);
    if (parsed.protocol !== "https:") {
        throw new UrlValidationError(`Only https URLs are allowed, got: ${parsed.protocol}`);
    }
    const hostname = parsed.hostname.toLowerCase();
    if (PRIVATE_HOSTNAMES.has(hostname)) {
        throw new UrlValidationError(`Private/loopback hostname not allowed: ${hostname}`);
    }
    if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
        throw new UrlValidationError(`Local hostname not allowed: ${hostname}`);
    }
    if (isPrivateIp(hostname)) {
        throw new UrlValidationError(`Private/special-use IP address not allowed: ${hostname}`);
    }
    return parsed;
}
export function isValidUrl(raw) {
    try {
        validateUrl(raw);
        return true;
    }
    catch {
        return false;
    }
}
export function validateServiceUrl(raw) {
    const parsed = parseUrl(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new UrlValidationError(`Only http or https service URLs are allowed, got: ${parsed.protocol}`);
    }
    if (!parsed.hostname) {
        throw new UrlValidationError("Service URL must include a hostname.");
    }
    return parsed;
}
export function isValidServiceUrl(raw) {
    try {
        validateServiceUrl(raw);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=url-validation.js.map