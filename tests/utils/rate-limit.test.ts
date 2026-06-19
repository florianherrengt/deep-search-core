import { describe, it, expect, vi } from "vitest";
import { rateLimit } from "../../src/research-orchestrator/utils/rate-limit";

describe("rateLimit", () => {
  it("returns the result of the function", async () => {
    const result = await rateLimit(async () => 42);
    expect(result).toBe(42);
  });

  it("passes through errors", async () => {
    await expect(
      rateLimit(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
  });

  it("serializes concurrent calls", async () => {
    const order: number[] = [];
    const fn1 = async () => {
      order.push(1);
      return "a";
    };
    const fn2 = async () => {
      order.push(2);
      return "b";
    };

    const [r1, r2] = await Promise.all([rateLimit(fn1), rateLimit(fn2)]);
    expect(order).toEqual([1, 2]);
    expect(r1).toBe("a");
    expect(r2).toBe("b");
  });

  it("rejects with already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      rateLimit(async () => "ok", controller.signal),
    ).rejects.toBeDefined();
  });
});
