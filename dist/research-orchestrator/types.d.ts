import type { LanguageModel, ToolSet, ToolChoice, UIMessage } from "ai";
import type { PageLoader as SearchExtractPageLoader } from "../search-extract/index.js";
import type { GuardDecision } from "./guards/agent-guards";
export type ProviderOptionsCallback = (params: {
    model: LanguageModel;
    toolChoice: ToolChoice<ToolSet> | undefined;
}) => Record<string, Record<string, any>> | undefined;
export interface SearchKeys {
    braveApiKey?: string;
    exaApiKey?: string;
    serperApiKey?: string;
    tavilyApiKey?: string;
    searxngBaseUrl?: string;
    youtubeApiKey?: string;
    hackerNews?: boolean;
}
export type FetchFn = typeof globalThis.fetch;
export type PageLoader = SearchExtractPageLoader;
export type HiddenTextPredicate = (part: UIMessage["parts"][number]) => boolean;
export type StreamErrorHandler = (error: unknown) => string;
export interface OrchestratorEvent {
    type: "guardrail" | "diagnostic" | "token_usage";
    data: Record<string, unknown>;
}
export type EvaluateStepFn = (params: {
    messages: UIMessage[];
    responseMessage: UIMessage;
}) => GuardDecision<ToolSet>;
export interface StreamResearchOptions {
    model: LanguageModel;
    messages: UIMessage[];
    abortSignal?: AbortSignal;
    searchKeys?: SearchKeys;
    fetch?: FetchFn;
    pageLoader?: PageLoader;
    systemPrompt?: string;
    onEvent?: (event: OrchestratorEvent) => void;
    isHiddenText?: HiddenTextPredicate;
    tools?: ToolSet;
    extraTools?: ToolSet;
    evaluateStep?: EvaluateStepFn;
    maxGuardRetries?: Record<string, number>;
    getProviderOptions?: ProviderOptionsCallback;
    onError?: StreamErrorHandler;
}
//# sourceMappingURL=types.d.ts.map