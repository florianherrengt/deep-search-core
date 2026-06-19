import PQueue from "p-queue";

export interface RateLimiter {
  schedule<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}

function createRateLimiter(
  requestsPerSecond: number = 1,
  concurrency: number = 1,
): RateLimiter {
  const queue = new PQueue({
    concurrency,
    intervalCap: requestsPerSecond,
    interval: 1000,
  });

  return {
    schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      return queue.add(fn, { signal });
    },
  };
}

let defaultInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!defaultInstance) {
    defaultInstance = createRateLimiter();
  }
  return defaultInstance;
}

export function rateLimit<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return getRateLimiter().schedule(fn, signal);
}

export function setRateLimiter(limiter: RateLimiter): void {
  defaultInstance = limiter;
}

export function resetRateLimiter(): void {
  defaultInstance = null;
}
