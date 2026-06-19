import { generateText, tool, zodSchema } from "ai";
import { researchCheckpointInputSchema, researchCheckpointResultSchema, reviewResearchCheckpoint, } from "../guards/agent-guards.js";
export function createResearchCheckpointTool(model) {
    return tool({
        description: "Get plain-text research quality guidance before finalizing a researched answer. Include searches run, opened sources, verified claims, unresolved questions, confidence, and readiness. The result is advisory guidance, not an approval or rejection.",
        strict: true,
        inputSchema: zodSchema(researchCheckpointInputSchema),
        outputSchema: zodSchema(researchCheckpointResultSchema),
        execute: async (input, options) => {
            return reviewResearchCheckpoint(input, (checkpoint) => judgeResearchCheckpoint(model, checkpoint, options?.abortSignal));
        },
    });
}
async function judgeResearchCheckpoint(model, checkpoint, abortSignal) {
    const { text } = await generateText({
        model,
        system: "You review whether an agent has done enough research to answer. Return concise plain text guidance only, never JSON. Do not approve or reject the work. Help the agent decide whether more research would materially improve the answer, with attention to direct relevance, source support, recency when relevant, and unresolved gaps.",
        prompt: `Review this research checkpoint.\n\n${JSON.stringify(checkpoint, null, 2)}`,
        abortSignal,
    });
    return text;
}
//# sourceMappingURL=research-checkpoint.js.map