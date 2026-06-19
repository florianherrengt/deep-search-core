import { type LanguageModel } from "ai";
import { z } from "zod";
export declare const researchPlanInputSchema: z.ZodObject<{
    query: z.ZodString;
}, z.core.$strip>;
export declare function createResearchPlanTool(model: LanguageModel): import("ai").Tool<{
    query: string;
}, string>;
//# sourceMappingURL=research-plan.d.ts.map