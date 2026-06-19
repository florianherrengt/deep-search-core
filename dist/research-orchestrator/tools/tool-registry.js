import { questionsTool } from "./ask-questions.js";
import { createDisambiguateTool } from "./disambiguate.js";
import { createSearchTools } from "./search/index.js";
import { createExtractPageContentTool } from "./extract-page-content.js";
import { createResearchCheckpointTool } from "./research-checkpoint.js";
import { createSequentialThinkingTool } from "./sequential-thinking.js";
import { createResearchPlanTool } from "./research-plan.js";
import { createFactsCheckTool } from "./facts-check.js";
import { applyToolCallRequirementSafeguards } from "../guards/tool-call-requirements.js";
export async function createResearchTools(config) {
    const { model, fetchFn, searchKeys, pageLoader } = config;
    const searchTools = createSearchTools(searchKeys, fetchFn);
    const tools = {
        ask_questions: questionsTool,
        disambiguate: createDisambiguateTool(fetchFn),
        ...searchTools,
        extract_page_content: createExtractPageContentTool(model, fetchFn, pageLoader),
        research_checkpoint: createResearchCheckpointTool(model),
        sequential_thinking: createSequentialThinkingTool(),
        create_research_plan: createResearchPlanTool(model),
        facts_check: createFactsCheckTool(model, { fetchFn, pageLoader }),
    };
    return applyToolCallRequirementSafeguards(tools);
}
//# sourceMappingURL=tool-registry.js.map