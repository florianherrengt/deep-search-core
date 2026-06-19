import { describe, it, expect, vi } from "vitest";
import { isAbortError, throwIfAborted, abortablePromise, abortableDelay } from "../../src/research-orchestrator/utils/abort";

describe("isAbortError", () => {
  it("detects real AbortError", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(isAbortError(err)).toBe(true);
  });

  it("returns false for regular Error", () => {
    expect(isAbortError(new Error("fail"))).toBe(false);
  });

  it("returns false for object with wrong name", () => {
    expect(isAbortError({ name: "Error" })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isAbortError("string")).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });
});

describe("throwIfAborted", () => {
  it("does not throw if signal is not aborted", () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it("does not throw if signal is undefined", () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });

  it("throws AbortError if signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow("aborted");
  });
});

describe("abortablePromise", () => {
  it("returns the promise result when not aborted", async () => {
    const result = await abortablePromise(Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("passes through without signal", async () => {
    const result = await abortablePromise(Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("rejects with AbortError when signal aborts before resolution", async () => {
    const controller = new AbortController();
    const promise = new Promise(() => {}); // never resolves
    const wrapped = abortablePromise(promise, controller.signal);
    controller.abort();
    await expect(wrapped).rejects.toThrow("aborted");
  });

  it("throws AbortError when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      abortablePromise(Promise.resolve(42), controller.signal),
    ).toThrow("aborted");
  });

  it("resolves normally if signal never aborts", async () => {
    const controller = new AbortController();
    const result = await abortablePromise(Promise.resolve("done"), controller.signal);
    expect(result).toBe("done");
  });

  it("cleans up event listener on resolve", async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    const promise = abortablePromise(Promise.resolve("ok"), controller.signal);
    // Let microtasks flush so the promise resolves and finally() runs
    await promise;
    await new Promise((r) => setTimeout(r, 0));
    expect(removeSpy).toHaveBeenCalled();
  });
});

describe("abortableDelay", () => {
  it("resolves after given ms", async () => {
    const start = Date.now();
    await abortableDelay(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("resolves without signal", async () => {
    await expect(abortableDelay(10)).resolves.toBeUndefined();
  });

  it("rejects with AbortError when signal aborts", async () => {
    const controller = new AbortController();
    const promise = abortableDelay(5000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("aborted");
  });

  it("throws when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => abortableDelay(10, controller.signal)).toThrow("aborted");
  });

  it("cleans up timeout on abort", async () => {
    const controller = new AbortController();
    const promise = abortableDelay(5000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("aborted");
  });
});
