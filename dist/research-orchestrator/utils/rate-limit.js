import PQueue from 'p-queue';
const queue = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000 });
export function rateLimit(fn, abortSignal) {
    return queue.add(fn, { signal: abortSignal });
}
//# sourceMappingURL=rate-limit.js.map