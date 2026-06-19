import { z } from "zod";
export declare const sequentialThinkingInputSchema: z.ZodObject<{
    thought: z.ZodString;
}, z.core.$strip>;
export declare function createSequentialThinkingTool(): import("ai").Tool<{
    thought: string;
}, {
    status: string;
}>;
//# sourceMappingURL=sequential-thinking.d.ts.map