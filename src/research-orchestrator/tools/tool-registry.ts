import { type LanguageModel, type ToolSet } from "ai";
import { questionsTool } from "./ask-questions";
import { createDisambiguateTool } from "./disambiguate";
import { createSearchTools } from "./search";
import { createExtractPageContentTool } from "./extract-page-content";
import { createResearchCheckpointTool } from "./research-checkpoint";
import { createSequentialThinkingTool } from "./sequential-thinking";
import { createResearchPlanTool } from "./research-plan";
import { createFactsCheckTool } from "./facts-check";
import { applyToolCallRequirementSafeguards } from "../guards/tool-call-requirements";
import type { SearchKeys, FetchFn, PageLoader } from "../types";

export interface CreateResearchToolsConfig {
  model: LanguageModel;
  fetchFn: FetchFn;
  searchKeys?: SearchKeys;
  pageLoader?: PageLoader;
}

export async function createResearchTools(config: CreateResearchToolsConfig): Promise<ToolSet> {
  const { model, fetchFn, searchKeys, pageLoader } = config;

  const searchTools = createSearchTools(searchKeys, fetchFn);

  const tools: ToolSet = {
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
