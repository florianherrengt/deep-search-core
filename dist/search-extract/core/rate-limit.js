import PQueue from "p-queue";
function createRateLimiter(requestsPerSecond = 1, concurrency = 1) {
    const queue = new PQueue({
        concurrency,
        intervalCap: requestsPerSecond,
        interval: 1000,
    });
    return {
        schedule(fn, signal) {
            return queue.add(fn, { signal });
        },
    };
}
let defaultInstance = null;
export function getRateLimiter() {
    if (!defaultInstance) {
        defaultInstance = createRateLimiter();
    }
    return defaultInstance;
}
export function rateLimit(fn, signal) {
    return getRateLimiter().schedule(fn, signal);
}
export function setRateLimiter(limiter) {
    defaultInstance = limiter;
}
export function resetRateLimiter() {
    defaultInstance = null;
}
//# sourceMappingURL=rate-limit.js.map