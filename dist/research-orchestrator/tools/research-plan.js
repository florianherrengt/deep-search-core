import { streamText, tool, zodSchema } from "ai";
import { z } from "zod";
import { RESEARCH_PLANNER_PROMPT } from "../prompts/research-planner-prompt.js";
export const researchPlanInputSchema = z.object({
    query: z.string().min(1).describe("The user's research question or request"),
});
export function createResearchPlanTool(model) {
    return tool({
        description: "Call this after asking clarifying questions to create a research plan.",
        strict: true,
        inputSchema: zodSchema(researchPlanInputSchema),
        execute: async ({ query }, options) => {
            const result = streamText({
                model,
                system: RESEARCH_PLANNER_PROMPT,
                prompt: query,
                abortSignal: options?.abortSignal,
            });
            const text = await result.text;
            if (!text || !text.trim()) {
                return "Error: Research plan was empty. Please try again with a more specific query.";
            }
            return text;
        },
    });
}
//# sourceMappingURL=research-plan.js.map