import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  rateLimit,
  setRateLimiter,
  resetRateLimiter,
  getRateLimiter,
} from "../rate-limit.js";

describe("rateLimiter", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  afterEach(() => {
    resetRateLimiter();
  });

  it("executes work sequentially", async () => {
    const order: number[] = [];

    const p1 = rateLimit(async () => {
      order.push(1);
      return 1;
    });
    const p2 = rateLimit(async () => {
      order.push(2);
      return 2;
    });

    const results = await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
    expect(order).toEqual([1, 2]);
  });

  it("rejects with AbortError when signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockResolvedValue("done");

    await expect(rateLimit(fn, controller.signal)).rejects.toThrow(
      "aborted",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("propagates abort to queued work", async () => {
    const controller = new AbortController();

    // First, schedule a long-running task
    const firstTask = new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    const firstPromise = rateLimit(
      async () => firstTask.then(() => "first"),
      controller.signal,
    ).catch(() => {}); // Suppress unhandled rejection

    // Then schedule a second task that should be aborted
    const secondTask = rateLimit(
      async () => "second",
      controller.signal,
    );

    // Abort before the first task completes
    controller.abort();

    await expect(secondTask).rejects.toThrow("aborted");
    await firstPromise; // Consume the first task rejection
  });

  it("allows custom rate limiter injection", async () => {
    const order: number[] = [];
    const customLimiter = {
      schedule: vi
        .fn()
        .mockImplementation(<T>(fn: () => Promise<T>) => fn()),
    };

    setRateLimiter(customLimiter);
    const result = await rateLimit(async () => {
      order.push(1);
      return "result";
    });

    expect(result).toBe("result");
    expect(order).toEqual([1]);
    expect(customLimiter.schedule).toHaveBeenCalledTimes(1);
  });

  it("getRateLimiter returns the same instance", () => {
    const a = getRateLimiter();
    const b = getRateLimiter();
    expect(a).toBe(b);
  });

  it("resetRateLimiter creates a new instance", () => {
    const a = getRateLimiter();
    resetRateLimiter();
    const b = getRateLimiter();
    expect(a).not.toBe(b);
  });
});
