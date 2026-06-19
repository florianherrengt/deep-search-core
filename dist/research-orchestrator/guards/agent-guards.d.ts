import { type ToolChoice, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import type { HiddenTextPredicate } from "../types";
export declare const guardrailEventSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        research_checkpoint: "research_checkpoint";
        question_tool: "question_tool";
        tool_call_requirement: "tool_call_requirement";
    }>;
    status: z.ZodEnum<{
        retrying: "retrying";
        warning: "warning";
        passed: "passed";
    }>;
    title: z.ZodString;
    message: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
    attempt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type GuardrailEvent = z.infer<typeof guardrailEventSchema>;
export declare const researchCheckpointInputSchema: z.ZodObject<{
    originalQuestion: z.ZodString;
    searchesRun: z.ZodArray<z.ZodString>;
    sourcesOpened: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        sourceType: z.ZodOptional<z.ZodEnum<{
            unknown: "unknown";
            primary: "primary";
            secondary: "secondary";
            forum: "forum";
        }>>;
        date: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    claimsVerified: z.ZodArray<z.ZodString>;
    unresolvedQuestions: z.ZodArray<z.ZodString>;
    confidence: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
    readyToAnswer: z.ZodBoolean;
}, z.core.$strip>;
export declare const researchCheckpointResultSchema: z.ZodString;
export type ResearchCheckpointInput = z.infer<typeof researchCheckpointInputSchema>;
export type ResearchCheckpointResult = z.infer<typeof researchCheckpointResultSchema>;
export type GuardName = "question_tool" | "research_checkpoint" | "tool_call_requirement";
export type GuardDecision<TOOLS extends ToolSet = ToolSet> = {
    action: "accept";
} | {
    action: "retry";
    guard: GuardName;
    event: GuardrailEvent;
    retryInstruction: string;
    toolChoice?: ToolChoice<TOOLS>;
};
export declare function asksUserForInput(text: string): boolean;
export declare function isResearchLikeRequest(text: string): boolean;
export declare function evaluateAssistantStep<TOOLS extends ToolSet>({ messages, responseMessage, isHiddenText, }: {
    messages: UIMessage[];
    responseMessage: UIMessage;
    isHiddenText?: HiddenTextPredicate;
}): GuardDecision<TOOLS>;
export declare function reviewResearchCheckpoint(input: ResearchCheckpointInput, judge?: (input: ResearchCheckpointInput) => Promise<ResearchCheckpointResult>): Promise<ResearchCheckpointResult>;
//# sourceMappingURL=agent-guards.d.ts.map