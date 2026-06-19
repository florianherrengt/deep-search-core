import { createGuardedStream } from "./guarded-stream.js";
import { DEFAULT_SYSTEM_PROMPT } from "../prompts/system-prompt.js";
export function streamResearch(options) {
    const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    return new ReadableStream({
        async start(controller) {
            try {
                await createGuardedStream({
                    model: options.model,
                    messages: options.messages,
                    abortSignal: options.abortSignal,
                    fetchFn,
                    searchKeys: options.searchKeys,
                    pageLoader: options.pageLoader,
                    systemPrompt,
                    isHiddenText: options.isHiddenText,
                    tools: options.tools,
                    extraTools: options.extraTools,
                    evaluateStep: options.evaluateStep,
                    maxGuardRetries: options.maxGuardRetries,
                    getProviderOptions: options.getProviderOptions,
                    onError: options.onError,
                    onEvent: options.onEvent,
                    controller,
                });
                if (options.abortSignal?.aborted) {
                    controller.enqueue({ type: "abort", reason: "aborted" });
                }
                else {
                    controller.enqueue({ type: "finish", finishReason: "stop" });
                }
            }
            catch (error) {
                if (options.abortSignal?.aborted) {
                    controller.enqueue({ type: "abort", reason: "aborted" });
                }
                else {
                    controller.enqueue({
                        type: "error",
                        errorText: error instanceof Error ? error.message : "Research failed.",
                    });
                    controller.enqueue({ type: "finish", finishReason: "error" });
                }
            }
            finally {
                controller.close();
            }
        },
    });
}
//# sourceMappingURL=stream.js.map