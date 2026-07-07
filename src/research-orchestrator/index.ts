import defaultSystemPrompt from "./prompts/system-prompt.md?raw";

export { streamResearch } from "./orchestrator/stream";

export { createGuardedStream } from "./orchestrator/guarded-stream";
export { createResearchTools } from "./tools/tool-registry";
export type { CreateResearchToolsConfig } from "./tools/tool-registry";

export {
  evaluateAssistantStep,
  reviewResearchCheckpoint,
  asksUserForInput,
  isResearchLikeRequest,
  researchCheckpointInputSchema,
  researchCheckpointResultSchema,
  guardrailEventSchema,
} from "./guards/agent-guards";
export type {
  GuardName,
  GuardDecision,
  GuardrailEvent,
  ResearchCheckpointInput,
  ResearchCheckpointResult,
} from "./guards/agent-guards";

export {
  TOOL_CALL_REQUIREMENTS,
  applyToolCallRequirementSafeguards,
  getActiveToolNamesForMessages,
  evaluateToolCallRequirementForResponse,
  evaluateToolCallRequirementForUIMessages,
  evaluateToolCallRequirementForModelMessages,
  getToolCallNamesFromUIMessages,
  getToolCallNamesFromModelMessages,
  formatToolCallRequirementViolation,
  ToolCallRequirementError,
} from "./guards/tool-call-requirements";
export type {
  ToolCallRequirement,
  ToolCallRequirementViolation,
} from "./guards/tool-call-requirements";

export { createSequentialThinkingTool } from "./tools/sequential-thinking";
export { questionsTool } from "./tools/ask-questions";
export { createDisambiguateTool } from "./tools/disambiguate";
export { createExtractPageContentTool, extractPageContent } from "./tools/extract-page-content";
export { createResearchPlanTool } from "./tools/research-plan";
export { createResearchCheckpointTool } from "./tools/research-checkpoint";
export { createFactsCheckTool } from "./tools/facts-check";
export type { CreateFactsCheckToolConfig } from "./tools/facts-check";
export { createSearchTools } from "./tools/search";
export {
  normalizeSearchKeys,
  hasSearchProviders,
  hasAggregatableSearchProviders,
  getConfiguredSearchProviderIds,
} from "./tools/search/search-keys";
export type { ConfiguredSearchProviderId } from "./tools/search/search-keys";
export { createBraveSearchTool } from "./tools/search/brave";
export { createExaSearchTool } from "./tools/search/exa";
export { createSerperSearchTool } from "./tools/search/serper";
export { createTavilySearchTool } from "./tools/search/tavily";
export { createSearXNGSearchTool } from "./tools/search/searxng";
export { createYouTubeSearchTool } from "./tools/search/youtube";
export { createHackerNewsSearchTool } from "./tools/search/hacker-news";
export { createAggregateSearchTool } from "./tools/search/aggregate";
export type { CreateAggregateSearchToolOptions } from "./tools/search/aggregate";
export { createScopedFileTools } from "./tools/scoped-file-tools";
export type {
  CreateScopedFileToolsConfig,
  ScopedFileMutationEvent,
} from "./tools/scoped-file-tools";
export {
  createArtifactStore,
  normalizeArtifactRelativePath,
  sanitizeArtifactPathSegment,
  joinArtifactPaths,
} from "./artifacts/artifact-store";
export type {
  ArtifactEntryType,
  ArtifactListEntry,
  ArtifactStorage,
  ArtifactStorageEntry,
  ArtifactStore,
  CreateArtifactStoreConfig,
} from "./artifacts/artifact-store";

export const DEFAULT_SYSTEM_PROMPT = defaultSystemPrompt;
export { RESEARCH_PLANNER_PROMPT } from "./prompts/research-planner-prompt";

export { TOOL_NAMES } from "./tool-names";
export type { ToolName } from "./tool-names";

export type {
  SearchKeys,
  FetchFn,
  PageLoader,
  HiddenTextPredicate,
  OrchestratorEvent,
  EvaluateStepFn,
  StreamResearchOptions,
  ProviderOptionsCallback,
} from "./types";

export { validateUrl, isValidUrl, validateServiceUrl, isValidServiceUrl, UrlValidationError } from "./utils/url-validation";
export { isAbortError, throwIfAborted, abortablePromise, abortableDelay } from "./utils/abort";
