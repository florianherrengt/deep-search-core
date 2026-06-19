import { type LanguageModel, type ToolSet, type UIMessage, type UIMessageChunk } from "ai";
import { type GuardDecision } from "../guards/agent-guards";
import type { SearchKeys, FetchFn, PageLoader, HiddenTextPredicate, OrchestratorEvent, ProviderOptionsCallback, StreamErrorHandler } from "../types";
export declare function createGuardedStream({ model, messages, abortSignal, fetchFn, searchKeys, pageLoader, systemPrompt, isHiddenText, tools: prebuiltTools, extraTools, evaluateStep, maxGuardRetries, getProviderOptions, onError, onEvent, controller, }: {
    model: LanguageModel;
    messages: UIMessage[];
    abortSignal?: AbortSignal;
    fetchFn?: FetchFn;
    searchKeys?: SearchKeys;
    pageLoader?: PageLoader;
    systemPrompt: string;
    isHiddenText?: HiddenTextPredicate;
    tools?: ToolSet;
    extraTools?: ToolSet;
    evaluateStep?: (params: {
        messages: UIMessage[];
        responseMessage: UIMessage;
    }) => GuardDecision<ToolSet>;
    maxGuardRetries?: Record<string, number>;
    getProviderOptions?: ProviderOptionsCallback;
    onError?: StreamErrorHandler;
    onEvent?: (event: OrchestratorEvent) => void;
    controller: ReadableStreamDefaultController<UIMessageChunk>;
}): Promise<void>;
//# sourceMappingURL=guarded-stream.d.ts.map