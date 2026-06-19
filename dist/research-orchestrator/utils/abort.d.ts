export declare function isAbortError(error: unknown): boolean;
export declare function throwIfAborted(abortSignal?: AbortSignal): void;
export declare function abortablePromise<T>(promise: Promise<T>, abortSignal?: AbortSignal): Promise<T>;
export declare function abortableDelay(ms: number, abortSignal?: AbortSignal): Promise<void>;
//# sourceMappingURL=abort.d.ts.map