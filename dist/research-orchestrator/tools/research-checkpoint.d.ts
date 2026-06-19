import { type LanguageModel } from "ai";
export declare function createResearchCheckpointTool(model: LanguageModel): import("ai").Tool<{
    originalQuestion: string;
    searchesRun: string[];
    sourcesOpened: {
        url: string;
        title?: string | undefined;
        sourceType?: "unknown" | "primary" | "secondary" | "forum" | undefined;
        date?: string | undefined;
    }[];
    claimsVerified: string[];
    unresolvedQuestions: string[];
    confidence: "low" | "medium" | "high";
    readyToAnswer: boolean;
}, string>;
//# sourceMappingURL=research-checkpoint.d.ts.map