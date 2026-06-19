function createAbortError() {
    return new DOMException("The operation was aborted.", "AbortError");
}
export function isAbortError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError");
}
export function throwIfAborted(abortSignal) {
    if (abortSignal?.aborted) {
        throw createAbortError();
    }
}
export function abortablePromise(promise, abortSignal) {
    if (!abortSignal)
        return promise;
    throwIfAborted(abortSignal);
    return new Promise((resolve, reject) => {
        const abort = () => reject(createAbortError());
        abortSignal.addEventListener("abort", abort, { once: true });
        promise.then(resolve, reject).finally(() => {
            abortSignal.removeEventListener("abort", abort);
        });
    });
}
export function abortableDelay(ms, abortSignal) {
    if (!abortSignal) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    throwIfAborted(abortSignal);
    let abort;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        abort = () => {
            clearTimeout(timeout);
            reject(createAbortError());
        };
        abortSignal.addEventListener("abort", abort, { once: true });
    }).finally(() => {
        if (abort)
            abortSignal.removeEventListener("abort", abort);
    });
}
//# sourceMappingURL=abort.js.map