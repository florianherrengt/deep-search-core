import { type ModelMessage, type ToolSet, type UIMessage } from "ai";
export interface ToolCallRequirement {
    requiredPreviousTools?: readonly string[];
    anyOfPreviousTools?: readonly string[];
    instruction: string;
}
export interface ToolCallRequirementViolation {
    toolName: string;
    requiredPreviousTools?: readonly string[];
    missingPreviousTools?: readonly string[];
    anyOfPreviousTools?: readonly string[];
    missingAnyOfTools?: readonly string[];
    instruction: string;
}
export declare const TOOL_CALL_REQUIREMENTS: {
    readonly create_research_plan: {
        readonly requiredPreviousTools: readonly ["ask_questions"];
        readonly instruction: "Call ask_questions first to clarify the research scope, then retry create_research_plan.";
    };
    readonly extract_page_content: {
        readonly anyOfPreviousTools: readonly ["brave_search", "exa_search", "serper_search", "tavily_search", "searxng_search"];
        readonly instruction: "Run a web search first to find URLs to extract from, then retry extract_page_content.";
    };
};
export declare class ToolCallRequirementError extends Error {
    readonly violation: ToolCallRequirementViolation;
    constructor(violation: ToolCallRequirementViolation);
}
export declare function applyToolCallRequirementSafeguards<TOOLS extends ToolSet>(tools: TOOLS): TOOLS;
export declare function getActiveToolNamesForMessages<TOOLS extends ToolSet>(tools: TOOLS, messages: UIMessage[]): Array<Extract<keyof TOOLS, string>>;
export declare function evaluateToolCallRequirementForResponse({ messages, responseMessage, }: {
    messages: UIMessage[];
    responseMessage: UIMessage;
}): ToolCallRequirementViolation | null;
export declare function evaluateToolCallRequirementForUIMessages(toolName: string, messages: UIMessage[]): ToolCallRequirementViolation | null;
export declare function evaluateToolCallRequirementForModelMessages(toolName: string, messages: ModelMessage[]): ToolCallRequirementViolation | null;
export declare function getToolCallNamesFromUIMessages(messages: UIMessage[]): string[];
export declare function getToolCallNamesFromModelMessages(messages: ModelMessage[]): string[];
export declare function formatToolCallRequirementViolation(violation: ToolCallRequirementViolation): string;
//# sourceMappingURL=tool-call-requirements.d.ts.map