export interface RateLimiter {
    schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
export declare function getRateLimiter(): RateLimiter;
export declare function rateLimit<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
export declare function setRateLimiter(limiter: RateLimiter): void;
export declare function resetRateLimiter(): void;
//# sourceMappingURL=rate-limit.d.ts.map