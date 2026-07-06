import { isToolUIPart, tool, zodSchema, streamText, generateText, convertToModelMessages } from "ai";
import { z } from "zod";
import PQueue from "p-queue";
import { i as createSearchExtractEngine, b as SearchProviderConfigError, A as AggregateSearchError, q as formatSearchResults, N as mergeResults, M as DEFAULT_AGGREGATE_NUM_RESULTS, H as searchQueryInputSchema, f as createBraveSearch, g as createExaSearch, k as createSerperSearch, l as createTavilySearch, h as createSearXNGFetchSearch, L as AGGREGATABLE_PROVIDER_NAMES, R as RedditExtractor, a as AmazonExtractor, e as ShopifyExtractor, T as TrustpilotExtractor, Y as YouTubeExtractor } from "../chunks/youtube-B2M5GRew.js";
import "cheerio";
import ipaddr from "ipaddr.js";
import { a as createAiSdkSearchTool, G as GithubExtractor } from "../chunks/ai-sdk-HwsLB3P_.js";
const defaultSystemPrompt = '## Core behaviour\n\nYou are a deep research agent.\n\nDo not stop at first results. Search broadly, verify primary sources, follow leads, compare evidence, and only answer once the topic is well-supported.\n\nThink through step by step using `sequential_thinking`.\n\n## Workflow\n\n**Clarify before planning**\n\n- `disambiguate` resolves genuinely ambiguous terms only — acronyms with multiple expansions, words that change meaning by context, unfamiliar jargon. Do not use it as a research tool, a general knowledge lookup, or a first step on every question. If a term is unambiguous, skip it.\n- Call `ask_questions` to narrow scope, intent, and output format before planning. `create_research_plan` is not available until `ask_questions` has been called earlier in the conversation.\n\n**Plan the research**\n\n- After the user answers the clarification questions, call `create_research_plan` with the user\'s question and clarifications. This returns a structured plan with: normalized request, goal classification, must-answer questions, search queries organized by research pass, source classification rules, confidence rules, contradiction rules, and stop conditions.\n- Review the plan output. Use it to guide every subsequent step.\n- Use the plan to derive focused keyword queries for previous-research lookup and web search.\n\n**Check previous research before web search**\n\n- When `search_research` is available, use it before web search to search your past research history — research folders you have already saved. It does NOT search the web. Returns matched folders with `folder_name` and any `relevant_memories` (stored user facts from the folders\' memories.md files). Use it to find and revisit earlier research on a topic before starting a new one.\n- Run `search_research` with queries from the plan — one query per call, aiming for 2-4 calls total.\n- If relevant previous research is found, identify the matching folder names and memories from the results.\n- Ask the user with `ask_questions`: "I found previous research on [topic] in [folder name]. Want me to continue that research, or start fresh?"\n- If multiple previous folders look relevant, include the best folder choices and a start-fresh choice.\n- If the user chooses to continue, call `switch_research_folder` with the selected folder before doing further research. Keep saving new research into that same folder.\n- If the user chooses to start fresh, do not switch folders; proceed as normal in the current research folder.\n- If no relevant previous research is found, or if `search_research` is unavailable, continue the normal workflow.\n- When continuing in an existing folder and file tools are available, use `list_files` to see what files are already there, and `read_file` to read specific files.\n\n**Research in passes, not one-off searches.**\n\n- Identify potential `skills` you can use when skill-loading tools are available.\n- Follow the research passes from the plan: broad map → primary evidence → independent evidence → failure/limitation search → synthesis.\n- For each pass, use the search queries from the plan. Add more queries as needed based on findings.\n- Classify every source using the plan\'s source classes (primary, secondary, experiential, weak).\n- Assign confidence using the plan\'s confidence rules.\n- Apply the plan\'s contradiction rules when sources disagree.\n- Do not stop until all stop conditions from the plan are met.\n\n- Search broadly enough to map the topic.\n- Use `youtube_search` when the research target is specifically YouTube videos. Use `extract_page_content` on YouTube video URLs to extract the transcript through the YouTube custom extractor. It tries public captions first and may use the configured yt-dlp subtitle fallback when captions are unavailable.\n- Read actual pages/results, not snippets.\n- Use `extract_page_content` to read pages. By default the page is summarized — provide a `query` to focus the summary on specific information (e.g. `query: "price and availability"`). Set `summarize: false` only on special occasions when the summary didn\'t give you what you needed — default to summarized extraction.\n- Extract useful facts, claims, contradictions, source quality, and new terminology.\n- When file tools are available, use `create_file` to persist new research files. Just provide a filename and content — the folder is already set up.\n- Use `read_file` to read a file from the research folder, `update_file` to modify an existing file, and `list_files` to see what is already saved. Use `delete_file` to remove a file or `move_file` to rename one.\n- Use descriptive filenames that identify the source or pass, for example `notes.md`, `findings.md`, `open-questions.md`, or `queue.json`.\n- After each meaningful pass and when file tools are available, save the current state of the research: queries run, source URLs read, key facts, contradictions, reliability notes, open questions, and next leads. Do not wait until the final answer.\n- Store working notes only; do not save private API keys, credentials, or unrelated sensitive user data.\n- When file tools are available, update `README.md` incrementally as you learn — it is the final research report, not a dump at the end. Include: title, answer/recommendation, key findings, evidence with URLs, confidence, open questions, last updated.\n- Update `summary.md` incrementally alongside README.md — it is a compact, search-optimized summary. Include: research scope, final answer, search keywords, key decisions, source quality, reuse guidance.\n- Use what you learned to refine the next pass:\n  - ask the user with `ask_questions` if the new information changes the scope\n  - run deeper queries for new leads, terms, products, places, people, or communities\n  - verify important claims against official or primary sources\n  - investigate disagreements instead of smoothing them over\n- Repeat until new searches mostly repeat known information, key claims are verified, and remaining uncertainty is explicit.\n\nStop only when further searching is unlikely to change the answer.\n\n**Analyze and answer**\n\n- Cross-reference sources.\n- Go deeper where gaps remain.\n- Before finalizing a researched answer, call `research_checkpoint` with the searches you ran, sources you opened, claims you verified, unresolved questions, confidence, and readiness.\n- `research_checkpoint` returns plain-text guidance, not JSON and not an approval status. Treat it as a self-check: decide whether the guidance means further research would materially improve the answer. Do not loop on the checkpoint or call it repeatedly unless new evidence changes the answer.\n- After the research is done and you have considered the checkpoint guidance, call `facts_check` before giving the final answer. Pass the original research objective/questions/clarifications and the final answer/report you plan to give. The tool will extract source URLs from your text, open each one, and check whether high-risk factual claims (numbers, prices, dimensions, dates, current claims, regulations, etc.) are supported by those sources. Do not pass prior messages, tool history, working notes, or hidden context.\n- If `facts_check` reports factual problems, tell the user what was wrong and correct the final answer before presenting it.\n- Cite URLs.\n- Verify links before sharing them.\n- Final answers should be supported by the research files and verified sources.\n- When `currency_conversion` is available, final answers must show prices, costs, fees, and other monetary amounts only in the user\'s preferred currency. If a source or draft answer has a foreign amount, call `currency_conversion` and report only the converted amount. Never include the original foreign amount, exchange rates, or ≈ unless the user explicitly asks for those details. Do not call this tool for non-monetary codes, product/model names, or code/math text that only looks like currency.\n\n## Browser debugging\n\nChrome DevTools MCP tools may be available with names like `chrome_devtools_*` when the user has enabled them in settings. Treat these as a last-resort local-browser control path.\n\n- Prefer the built-in search tools, internal webview tabs, and `extract_page_content` for normal research and page reading.\n- Do not use Chrome DevTools MCP for ordinary web research when the internal tools can answer the question.\n- Use Chrome DevTools MCP only when the user explicitly asks you to inspect/control a local Chrome session, or when internal extraction cannot handle a dynamic page, console/network/performance issue, screenshot need, or browser state that only Chrome can expose.\n- Avoid interacting with authenticated, private, or sensitive pages unless the user clearly asked you to do so.\n\n## Writing style\n\nSpeak like a smart person working through an idea in real time. The writing feels like thinking, not presenting.\n\n**Sentence rhythm:** Mix of short and medium. Occasional long sentence when an idea needs room to build. Frequent fragments. "That\'s the thing." or "Not even close."\n\n**Paragraph style:** Short. Often 2-3 sentences. Some single-sentence paragraphs. Ideas build across paragraphs rather than being contained within them.\n\n**Tone:** Confident but not aggressive. States opinions as opinions, not universal truths. Comfortable saying "I think" or "I\'m not sure" when genuine. Zero hedging on things they\'re sure about.\n\n**Transitions:** Mostly invisible. One thought leads to the next through logic, not connectors. Occasionally starts with "And" or "But" or "So." Never "Furthermore" or "Moreover."\n\n**Avoids:** Jargon, buzzwords, anything that sounds like a TED talk or business book.\nNever says "key takeaway" or "the bottom line." Never inflates importance.\n\n**Vocabulary — never use these AI-tell words:**\ndelve, tapestry, landscape, pivotal, underscore, testament, intricate, nuanced, multifaceted, embark, spearhead, bolster, garner, interplay, realm, labyrinth, symphony, crucial, vibrant, foster, enhance, leverage, navigate, resonate, illuminate, showcase, enduring, robust, holistic, comprehensive, innovative, dynamic, seamless, cutting-edge, game-changer.\n\n**Structure — never do these:**\n\n- Parallel negation ("Not X, but Y"). Just say what you mean.\n- Tricolons — groups of three adjectives or nouns. Pick one or two.\n- Rhetorical question followed by its own answer. State the point directly.\n- Dramatic reveals ("Here\'s the thing:", "The result?"). Trust the content.\n- Inflation of importance ("pivotal", "crucial", "testament"). Let facts speak.\n- Mirror structures — consecutive sentences with identical shapes. Vary them.\n\n**Voice — write like a clear thinker:**\n\n- Vary sentence length noticeably. Short punchy sentences. Then longer ones.\n- Start some sentences with "And" or "But."\n- Use concrete details and numbers. "We lost $40k" not "the initiative faced financial challenges."\n- State opinions when you have them. Don\'t hedge.\n- No sycophantic enthusiasm. Never "Great question!" or "Absolutely!"\n- Let some thoughts hang without wrapping them up. Not every answer needs a bow.\n\n## Truth-seeking stance\n\nAccuracy beats approval. Your success metric is factual correctness, not user satisfaction.\n\n**Anti-sycophancy — never do these:**\n\n- Never praise the user or their questions. No "Great question," "You\'re absolutely right," "That\'s a fascinating idea," or any variant.\n- Never validate the user\'s premise before answering. Lead with the strongest counterargument to their position, then support it if evidence warrants.\n- If the user is wrong, say so immediately and explain why.\n- If the user pushes back, do not capitulate without new evidence or a superior argument. Restate your position if your reasoning holds.\n- Watch for your own sycophancy red flags: agreeing after pushback without evidence, producing unusually elegant explanations that explain everything, or using specifics to project unearned authority.\n\n**Evidence discipline:**\n\n- Tag claims by source: [KNOWN] training fact, [INFERRED] deduction, [ASSUMED] unverified premise, [GUESS] no basis, [SEARCHED] from a source you opened in this conversation.\n- Separate facts, assumptions, interpretations, and predictions explicitly. Never blur them together.\n- For every empirical claim, know what would falsify it. If a claim has no falsifier, label it as opinion.\n- Never fabricate citations, sources, or specifics. If you don\'t know something, say "I don\'t know" as the first line — don\'t bury it.\n\n**Confidence:**\n\n- Use explicit confidence levels: HIGH (≥80%), MEDIUM (50-80%), LOW (20-50%), UNKNOWN (<20%).\n- Claims tagged [GUESS] cap at LOW confidence. Never inflate certainty to sound authoritative.\n\n**Truth over comfort:**\n\n- State the most likely truth based on data and logic, even if controversial.\n- Give contrarian takes when they exist, even if they conflict with mainstream narratives.\n- Highlight majority and minority views clearly without weighing them morally.\n- Make sharper, bolder predictions based on patterns in data when appropriate.\n- Treat all perspectives equally regardless of cultural or political sensitivity.\n- Do not prioritise optimism or safety unless factual accuracy depends on it.\n\n**Directness:**\n\n- Answer with maximum directness. Remove diplomatic filler. No sugar-coating.\n- If the question has a false premise, contradiction, or flawed framing, flag it first — then answer.\n- Challenge the user\'s assumptions when warranted. Ask clarifying questions when vague.\n- Prioritise information density over being nice. But always remain factual.\n- Do not announce that you are being blunt, direct, or no-bullshit. Just embody it.\n';
const TOOL_NAMES = {
  ask_questions: "ask_questions",
  disambiguate: "disambiguate",
  brave_search: "brave_search",
  exa_search: "exa_search",
  serper_search: "serper_search",
  tavily_search: "tavily_search",
  searxng_search: "searxng_search",
  youtube_search: "youtube_search",
  aggregate_search: "aggregate_search",
  extract_page_content: "extract_page_content",
  research_checkpoint: "research_checkpoint",
  sequential_thinking: "sequential_thinking",
  create_research_plan: "create_research_plan",
  facts_check: "facts_check"
};
const TOOL_CALL_REQUIREMENTS = {
  [TOOL_NAMES.create_research_plan]: {
    requiredPreviousTools: [TOOL_NAMES.ask_questions],
    instruction: "Call ask_questions first to clarify the research scope, then retry create_research_plan."
  },
  [TOOL_NAMES.extract_page_content]: {
    anyOfPreviousTools: [
      TOOL_NAMES.brave_search,
      TOOL_NAMES.exa_search,
      TOOL_NAMES.serper_search,
      TOOL_NAMES.tavily_search,
      TOOL_NAMES.searxng_search,
      TOOL_NAMES.youtube_search,
      TOOL_NAMES.aggregate_search
    ],
    instruction: "Run a web search first to find URLs to extract from, then retry extract_page_content."
  }
};
class ToolCallRequirementError extends Error {
  violation;
  constructor(violation) {
    super(formatToolCallRequirementViolation(violation));
    this.name = "ToolCallRequirementError";
    this.violation = violation;
  }
}
function applyToolCallRequirementSafeguards(tools) {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool2]) => {
      const execute = tool2.execute;
      return [
        toolName,
        {
          ...tool2,
          description: appendRequirementDescription(
            toolName,
            tool2.description
          ),
          ...execute ? {
            execute: ((input, options) => {
              const violation = evaluateToolCallRequirementForModelMessages(
                toolName,
                options.messages
              );
              if (violation) {
                throw new ToolCallRequirementError(violation);
              }
              return execute.call(tool2, input, options);
            })
          } : {}
        }
      ];
    })
  );
}
function getActiveToolNamesForMessages(tools, messages) {
  return Object.keys(tools).filter(
    (toolName) => !evaluateToolCallRequirementForUIMessages(toolName, messages)
  );
}
function evaluateToolCallRequirementForResponse({
  messages,
  responseMessage
}) {
  for (const toolName of getToolCallNamesFromUIMessage(responseMessage)) {
    const violation = evaluateToolCallRequirementForUIMessages(
      toolName,
      messages
    );
    if (violation) return violation;
  }
  return null;
}
function evaluateToolCallRequirementForUIMessages(toolName, messages) {
  const requirement = getToolCallRequirement(toolName);
  if (!requirement) return null;
  return evaluateToolCallRequirement(
    toolName,
    requirement,
    getToolCallNamesFromUIMessages(messages)
  );
}
function evaluateToolCallRequirementForModelMessages(toolName, messages) {
  const requirement = getToolCallRequirement(toolName);
  if (!requirement) return null;
  return evaluateToolCallRequirement(
    toolName,
    requirement,
    getToolCallNamesFromModelMessages(messages)
  );
}
function getToolCallNamesFromUIMessages(messages) {
  return messages.flatMap(getToolCallNamesFromUIMessage);
}
function getToolCallNamesFromModelMessages(messages) {
  return messages.flatMap((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return [];
    }
    return message.content.flatMap(
      (part) => part.type === "tool-call" ? [part.toolName] : []
    );
  });
}
function formatToolCallRequirementViolation(violation) {
  const parts = [`${violation.toolName} cannot run yet.`];
  if (violation.missingPreviousTools && violation.missingPreviousTools.length > 0) {
    parts.push(
      `Missing required previous tool call${violation.missingPreviousTools.length === 1 ? "" : "s"}: ${formatToolNames(violation.missingPreviousTools)}.`
    );
  }
  if (violation.missingAnyOfTools && violation.missingAnyOfTools.length > 0) {
    parts.push(
      `At least one of these tools must be called first: ${formatToolNames(
        violation.missingAnyOfTools
      )}.`
    );
  }
  parts.push(violation.instruction);
  return parts.join(" ");
}
function evaluateToolCallRequirement(toolName, requirement, previousToolNames) {
  const previous = new Set(previousToolNames);
  const missingPreviousTools = requirement.requiredPreviousTools?.filter(
    (requiredTool) => !previous.has(requiredTool)
  ) ?? [];
  const anyOfSatisfied = !requirement.anyOfPreviousTools || requirement.anyOfPreviousTools.some((tool2) => previous.has(tool2));
  if (missingPreviousTools.length === 0 && anyOfSatisfied) return null;
  return {
    toolName,
    requiredPreviousTools: requirement.requiredPreviousTools,
    missingPreviousTools: missingPreviousTools.length > 0 ? missingPreviousTools : void 0,
    anyOfPreviousTools: requirement.anyOfPreviousTools,
    missingAnyOfTools: !anyOfSatisfied ? requirement.anyOfPreviousTools : void 0,
    instruction: requirement.instruction
  };
}
function getToolCallRequirement(toolName) {
  return TOOL_CALL_REQUIREMENTS[toolName];
}
function appendRequirementDescription(toolName, description) {
  const requirement = getToolCallRequirement(toolName);
  if (!requirement) return description;
  const prereqParts = [];
  if (requirement.requiredPreviousTools && requirement.requiredPreviousTools.length > 0) {
    prereqParts.push(`call ${formatToolNames(requirement.requiredPreviousTools)}`);
  }
  if (requirement.anyOfPreviousTools && requirement.anyOfPreviousTools.length > 0) {
    prereqParts.push(
      `call at least one of ${formatToolNames(requirement.anyOfPreviousTools)}`
    );
  }
  return `${description ?? toolName}

Prerequisite: before calling this tool, ${prereqParts.join(" and ")} first.`;
}
function getToolCallNamesFromUIMessage(message) {
  return message.parts.flatMap(
    (part) => isToolUIPart(part) ? [part.type.slice("tool-".length)] : []
  );
}
function formatToolNames(toolNames) {
  return toolNames.map((toolName) => `\`${toolName}\``).join(", ");
}
const guardrailEventSchema = z.object({
  kind: z.enum([
    "question_tool",
    "research_checkpoint",
    "tool_call_requirement"
  ]),
  status: z.enum(["retrying", "warning", "passed"]),
  title: z.string(),
  message: z.string(),
  reason: z.string().optional(),
  attempt: z.number().optional()
});
const researchSourceSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  sourceType: z.enum(["primary", "secondary", "forum", "unknown"]).optional(),
  date: z.string().optional()
});
const researchCheckpointInputSchema = z.object({
  originalQuestion: z.string().min(1),
  searchesRun: z.array(z.string().min(1)),
  sourcesOpened: z.array(researchSourceSchema),
  claimsVerified: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"]),
  readyToAnswer: z.boolean()
});
const researchCheckpointResultSchema = z.string().min(1);
const QUESTION_STARTERS = [
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "can you",
  "could you",
  "would you",
  "do you",
  "did you",
  "are you",
  "should i",
  "should we",
  "may i"
];
const REQUEST_PATTERNS = [
  /\bplease\s+provide\b/i,
  /\bplease\s+confirm\b/i,
  /\blet me know\b/i,
  /\btell me\b/i,
  /\bi need your\b/i,
  /\bbefore i continue\b/i,
  /\bto proceed\b/i,
  /\bcan you share\b/i,
  /\bcould you share\b/i,
  /\bshare your\b/i,
  /\bsend me\b/i
];
const RESEARCH_KEYWORDS = [
  "latest",
  "current",
  "recent",
  "today",
  "news",
  "research",
  "investigate",
  "find",
  "search",
  "source",
  "sources",
  "cite",
  "verify",
  "compare",
  "best",
  "recommend",
  "recommendation",
  "review",
  "price",
  "cost",
  "market",
  "legal",
  "law",
  "regulation",
  "medical",
  "financial",
  "travel",
  "map",
  "directions"
];
const RESEARCH_TOOL_NAMES = /* @__PURE__ */ new Set([
  TOOL_NAMES.brave_search,
  TOOL_NAMES.exa_search,
  TOOL_NAMES.serper_search,
  TOOL_NAMES.tavily_search,
  TOOL_NAMES.searxng_search,
  TOOL_NAMES.youtube_search,
  TOOL_NAMES.extract_page_content
]);
const RESEARCH_CHECKPOINT_TOOL = TOOL_NAMES.research_checkpoint;
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripCodeBlocksAndQuotes(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").split("\n").filter((line) => !line.trimStart().startsWith(">")).join("\n");
}
function normalizeForDetection(text) {
  return stripCodeBlocksAndQuotes(text).replace(/\bwhy\?\s+because\b/gi, "because").split("\n").filter((line) => !/^\s*(open\s+)?questions?\s*:/i.test(line)).join("\n").toLowerCase();
}
function asksUserForInput(text) {
  const normalized = normalizeForDetection(text);
  if (!normalized.trim()) return false;
  if (/\bthe question is\b/.test(normalized)) return false;
  const userDirected = /\b(you|your|you'd|you'll|yourself)\b/i.test(normalized);
  const questionSentences = normalized.match(
    /(?:^|[.!?]\s+|\n\s*)[^.!?\n]{1,260}\?/g
  );
  const starterPattern = new RegExp(
    `^\\s*(${QUESTION_STARTERS.map(escapeRegex).join("|")})\\b`,
    "i"
  );
  const startsLikeQuestion = (questionSentences ?? []).some((sentence) => {
    const trimmed = sentence.replace(/^[.!?]\s+/, "").trim();
    return starterPattern.test(trimmed) && (/\b(you|your|you'd|you'll|yourself)\b/i.test(trimmed) || /\b(should|could|can|may)\s+i\b/i.test(trimmed) || /\bshould\s+we\b/i.test(trimmed));
  });
  if (startsLikeQuestion) return true;
  const requestsInput = REQUEST_PATTERNS.some(
    (pattern) => pattern.test(normalized)
  );
  const choiceNeedsReply = /(?:^|[.!?]\s+|\n\s*)(?:please\s+)?(?:choose|pick)\b[\s\S]{0,120}\b(?:before i continue|to proceed|so i can|then i can|and i(?:'ll| will| can))\b/i.test(
    normalized
  );
  const strongImperativeRequest = /\bplease\s+(provide|confirm)\b/i.test(normalized) || /\b(let me know|tell me|before i continue|to proceed)\b/i.test(normalized);
  return choiceNeedsReply || requestsInput && (userDirected || strongImperativeRequest);
}
function getMessageText(message, isHidden) {
  if (!message) return "";
  const hidden = isHidden ?? (() => false);
  return message.parts.filter(
    (part) => part.type === "text"
  ).filter((part) => !hidden(part)).map((part) => part.text).join("\n").trim();
}
function getLatestUserText(messages, isHidden) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return getMessageText(latestUserMessage, isHidden);
}
function isResearchLikeRequest(text) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^(hi|hello|thanks|thank you|ok|okay)\b/.test(normalized)) return false;
  if (RESEARCH_KEYWORDS.some((word) => normalized.includes(word))) return true;
  return normalized.length >= 40 && /^(what|who|when|where|why|how|which)\b/.test(normalized);
}
function getToolNameFromPart(part) {
  if (!isToolUIPart(part)) return null;
  return part.type.slice("tool-".length);
}
function hasToolCall(message, toolName) {
  return message.parts.some((part) => getToolNameFromPart(part) === toolName);
}
function hasDeepResearchToolCall(message) {
  return message.parts.some((part) => {
    const name = getToolNameFromPart(part);
    return name ? RESEARCH_TOOL_NAMES.has(name) : false;
  });
}
function hasResearchCheckpoint(message) {
  return hasToolCall(message, RESEARCH_CHECKPOINT_TOOL);
}
function evaluateAssistantStep({
  messages,
  responseMessage,
  isHiddenText
}) {
  const hiddenPredicate = isHiddenText ?? (() => false);
  const toolRequirementViolation = evaluateToolCallRequirementForResponse({
    messages,
    responseMessage
  });
  if (toolRequirementViolation) {
    return toolRequirementRetry(toolRequirementViolation);
  }
  const text = getMessageText(responseMessage, hiddenPredicate);
  if (!text) return { action: "accept" };
  const userText = getLatestUserText(messages, hiddenPredicate);
  const currentTurnMessages = getCurrentTurnMessages(messages, responseMessage);
  if (!hasToolCall(responseMessage, TOOL_NAMES.ask_questions) && asksUserForInput(text)) {
    return {
      action: "retry",
      guard: "question_tool",
      event: {
        kind: "question_tool",
        status: "retrying",
        title: "Question tool enforced",
        message: "Prompted the agent to ask this with the question tool.",
        reason: "The agent asked for user input in plain text."
      },
      retryInstruction: "Your previous response asked the user for input in plain text. Convert that request into an ask_questions tool call now. Do not answer in plain text.",
      toolChoice: {
        type: "tool",
        toolName: TOOL_NAMES.ask_questions
      }
    };
  }
  if (shouldContinueFromLatestTool(responseMessage, hiddenPredicate)) {
    return { action: "accept" };
  }
  if (!isResearchLikeRequest(userText)) return { action: "accept" };
  if (currentTurnMessages.some(hasResearchCheckpoint)) {
    return { action: "accept" };
  }
  if (!currentTurnMessages.some(hasDeepResearchToolCall)) {
    return {
      action: "retry",
      guard: "research_checkpoint",
      event: {
        kind: "research_checkpoint",
        status: "retrying",
        title: "Research depth reminder",
        message: "Prompted the agent to consider whether more research is needed.",
        reason: "The answer did not show enough research tool use."
      },
      retryInstruction: "Your previous response answered a research-like request without showing research. Reconsider whether you searched deeply enough. If more evidence would materially improve the answer, use search and page-reading tools before answering. You may call research_checkpoint for plain-text guidance when ready.",
      toolChoice: "required"
    };
  }
  if (!currentTurnMessages.some(hasResearchCheckpoint)) {
    return {
      action: "retry",
      guard: "research_checkpoint",
      event: {
        kind: "research_checkpoint",
        status: "retrying",
        title: "Research checkpoint guidance",
        message: "Prompted the agent to get advisory checkpoint guidance.",
        reason: "The answer did not include a research checkpoint."
      },
      retryInstruction: "Before finalizing this research answer, call research_checkpoint once for plain-text guidance. Use the guidance to decide whether further research would materially improve the answer; do not wait for an approval status.",
      toolChoice: {
        type: "tool",
        toolName: RESEARCH_CHECKPOINT_TOOL
      }
    };
  }
  return { action: "accept" };
}
function toolRequirementRetry(violation) {
  const missingTools = violation.missingPreviousTools ?? violation.missingAnyOfTools ?? [];
  const nextTool = missingTools[0];
  return {
    action: "retry",
    guard: "tool_call_requirement",
    event: {
      kind: "tool_call_requirement",
      status: "retrying",
      title: "Tool prerequisite enforced",
      message: `Prompted the agent to call ${nextTool} before ${violation.toolName}.`,
      reason: `The agent tried to call ${violation.toolName} before required previous tool calls: ${missingTools.join(", ")}.`
    },
    retryInstruction: `Your previous response tried to call ${violation.toolName} too early. ${violation.instruction}`,
    toolChoice: {
      type: "tool",
      toolName: nextTool
    }
  };
}
function getCurrentTurnMessages(messages, responseMessage) {
  const latestUserIndex = messages.reduce(
    (latest, message, index) => message.role === "user" ? index : latest,
    -1
  );
  return [
    ...latestUserIndex === -1 ? messages : messages.slice(latestUserIndex),
    responseMessage
  ];
}
function validateResearchCheckpoint(input) {
  const guidance = [];
  if (!input.readyToAnswer) {
    guidance.push("You marked the research as not ready to answer.");
  }
  if (input.searchesRun.length === 0) {
    guidance.push(
      "Run at least one real search query before relying on the answer."
    );
  }
  if (input.sourcesOpened.length < 2) {
    guidance.push(
      "Open and inspect more than one relevant source when the topic depends on external facts."
    );
  }
  if (input.claimsVerified.length < 2) {
    guidance.push(
      "List the key claims you verified, especially dates, prices, numbers, and source-specific facts."
    );
  }
  if (input.unresolvedQuestions.length > 0) {
    guidance.push(
      `Resolve or explicitly disclose these open questions: ${input.unresolvedQuestions.join("; ")}.`
    );
  }
  if (input.confidence === "low") {
    guidance.push(
      "Confidence is low; do more research or make the uncertainty prominent in the final answer."
    );
  }
  if (guidance.length === 0) {
    return "Research checkpoint guidance: You appear ready to answer. Synthesize the verified claims, cite the sources you opened, and state any residual uncertainty.";
  }
  return `Research checkpoint guidance:
${guidance.map((item) => `- ${item}`).join("\n")}`;
}
function shouldContinueFromLatestTool(message, isHidden) {
  const hidden = isHidden ?? (() => false);
  const lastToolIndex = message.parts.reduce(
    (latest, part, index) => isToolUIPart(part) ? index : latest,
    -1
  );
  if (lastToolIndex === -1) return false;
  return !message.parts.slice(lastToolIndex + 1).some(
    (part) => part.type === "text" && part.text.trim().length > 0 && !hidden(part)
  );
}
async function reviewResearchCheckpoint(input, judge) {
  const fallbackGuidance = validateResearchCheckpoint(input);
  if (!judge) return fallbackGuidance;
  try {
    const guidance = researchCheckpointResultSchema.parse(await judge(input));
    return guidance.trim() || fallbackGuidance;
  } catch (error) {
    console.warn(
      "[reviewResearchCheckpoint] Judge failed, falling back to local guidance:",
      error instanceof Error ? error.message : error
    );
    return fallbackGuidance;
  }
}
const candidateSchema = z.object({
  label: z.string().describe("Display text shown to the user"),
  value: z.string().describe("Machine-readable value returned when selected")
});
const questionSchema = z.object({
  question: z.string().describe("Question to ask the user"),
  candidates: candidateSchema.array().describe("List of candidate answers to the question")
});
const questionsInputSchema = z.object({
  questions: questionSchema.array().describe("Array of questions with their candidate answers")
});
const questionsTool = tool({
  description: `Present questions with candidate answers to the user.`,
  strict: true,
  inputSchema: zodSchema(questionsInputSchema)
});
const queue = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1e3 });
function rateLimit(fn, abortSignal) {
  return queue.add(fn, { signal: abortSignal });
}
const API_URL = "https://api.duckduckgo.com/";
const MAX_RELATED_TOPICS = 8;
const OptionalStringSchema = z.string().nullable().optional();
const DuckDuckGoResponseSchema = z.object({
  Heading: OptionalStringSchema,
  AbstractText: OptionalStringSchema,
  Definition: OptionalStringSchema,
  Answer: OptionalStringSchema,
  Type: OptionalStringSchema,
  RelatedTopics: z.array(z.unknown()).optional().default([])
}).passthrough();
const DuckDuckGoRelatedTopicSchema = z.object({
  Text: OptionalStringSchema,
  Topics: z.array(z.unknown()).optional()
}).passthrough();
function cleanString(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function flattenRelatedTopicText(relatedTopics) {
  const flattened = [];
  function visit(topic) {
    const parsed = DuckDuckGoRelatedTopicSchema.safeParse(topic);
    if (!parsed.success) return;
    const text = cleanString(parsed.data.Text);
    if (text) {
      flattened.push(text);
    }
    for (const child of parsed.data.Topics ?? []) {
      visit(child);
    }
  }
  for (const topic of relatedTopics) {
    visit(topic);
  }
  return flattened;
}
async function fetchDuckDuckGo(fetchFn, term, abortSignal) {
  return rateLimit(async () => {
    const url = new URL(API_URL);
    url.searchParams.set("q", term.trim());
    url.searchParams.set("format", "json");
    url.searchParams.set("no_redirect", "1");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "0");
    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: abortSignal
    });
    if (!response.ok) {
      return "";
    }
    const raw = await response.json().catch(() => null);
    const parsed = DuckDuckGoResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return "";
    }
    const data = parsed.data;
    const lines = [];
    const heading = cleanString(data.Heading);
    const abstract = cleanString(data.AbstractText);
    const definition = cleanString(data.Definition);
    const answer = cleanString(data.Answer);
    if (heading) lines.push(heading);
    if (abstract) lines.push(abstract);
    if (definition && definition !== abstract) lines.push(definition);
    if (answer && answer !== abstract && answer !== definition)
      lines.push(answer);
    const related = flattenRelatedTopicText(data.RelatedTopics).slice(0, MAX_RELATED_TOPICS).filter((t) => !lines.includes(t));
    if (related.length > 0) {
      lines.push("Related: " + related.join(", "));
    }
    return lines.join("\n");
  }, abortSignal);
}
const disambiguateInputSchema = z.object({
  terms: z.array(z.string()).describe("Specific terms to disambiguate. Only include terms that are genuinely ambiguous — e.g., acronyms with multiple expansions, words with common alternate meanings, or unfamiliar jargon. Do not include common unambiguous words.")
});
function createDisambiguateTool(fetchFn) {
  return tool({
    description: "Resolve genuinely ambiguous terms — acronyms with multiple meanings, words that change meaning by context, or unfamiliar jargon. Do NOT use this as a general research or lookup tool. Pass only the specific terms that need disambiguation.",
    strict: true,
    inputSchema: zodSchema(disambiguateInputSchema),
    execute: async ({ terms }, options) => {
      const results = [];
      for (const term of terms) {
        const ddgResult = await fetchDuckDuckGo(fetchFn, term, options?.abortSignal);
        results.push(`${term}: ${ddgResult || "no ambiguity."}`);
      }
      return results.join("\n");
    }
  });
}
function createBraveSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      brave: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "brave", "Search the web with Brave Search");
}
function createExaSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      exa: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "exa", "Search the web with Exa");
}
function createSerperSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      serper: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "serper", "Search the web with Serper (Google Search API)");
}
function createTavilySearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      tavily: { apiKey }
    }
  });
  return createAiSdkSearchTool(engine, "tavily", "Search the web with Tavily Search");
}
const BLOCKED_SCHEMES = ["file:", "data:", "javascript:", "vbscript:", "tauri:", "about:", "blob:"];
const PRIVATE_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1"
]);
function isPrivateIp(hostname) {
  const bare = hostname.replace(/^\[|\]$/g, "");
  let addr;
  try {
    addr = ipaddr.parse(bare);
  } catch {
    return false;
  }
  if (addr.kind() === "ipv6") {
    const v6 = addr;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    }
  }
  return addr.range() !== "unicast";
}
class UrlValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UrlValidationError";
  }
}
function parseUrl(raw) {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const blockedScheme = BLOCKED_SCHEMES.find(
    (scheme) => lower.startsWith(scheme)
  );
  if (blockedScheme) {
    throw new UrlValidationError(`Blocked scheme: ${blockedScheme}`);
  }
  try {
    return new URL(trimmed);
  } catch {
    throw new UrlValidationError(`Invalid URL: ${trimmed}`);
  }
}
function validateUrl(raw) {
  const parsed = parseUrl(raw);
  if (parsed.protocol !== "https:") {
    throw new UrlValidationError(`Only https URLs are allowed, got: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    throw new UrlValidationError(`Private/loopback hostname not allowed: ${hostname}`);
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    throw new UrlValidationError(`Local hostname not allowed: ${hostname}`);
  }
  if (isPrivateIp(hostname)) {
    throw new UrlValidationError(`Private/special-use IP address not allowed: ${hostname}`);
  }
  return parsed;
}
function isValidUrl(raw) {
  try {
    validateUrl(raw);
    return true;
  } catch {
    return false;
  }
}
function validateServiceUrl(raw) {
  const parsed = parseUrl(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UrlValidationError(`Only http or https service URLs are allowed, got: ${parsed.protocol}`);
  }
  if (!parsed.hostname) {
    throw new UrlValidationError("Service URL must include a hostname.");
  }
  return parsed;
}
function isValidServiceUrl(raw) {
  try {
    validateServiceUrl(raw);
    return true;
  } catch {
    return false;
  }
}
const DEFAULT_BASE_URL = "http://localhost:8080";
function createSearXNGSearchTool(baseUrl = DEFAULT_BASE_URL, fetchFn) {
  validateServiceUrl(baseUrl);
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      searxng: { baseUrl }
    }
  });
  return createAiSdkSearchTool(engine, "searxng", "Search the web with SearXNG (self-hosted meta search engine)");
}
function createYouTubeSearchTool(apiKey, fetchFn) {
  const engine = createSearchExtractEngine({
    fetch: fetchFn,
    searchProviders: {
      youtube: { apiKey }
    }
  });
  return createAiSdkSearchTool(
    engine,
    "youtube",
    "Search YouTube videos with the YouTube Data API. Results include video URLs and video IDs for follow-up subtitle extraction."
  );
}
function normalizeSearchKeys(keys) {
  return {
    braveApiKey: trimOptional(keys?.braveApiKey),
    exaApiKey: trimOptional(keys?.exaApiKey),
    serperApiKey: trimOptional(keys?.serperApiKey),
    tavilyApiKey: trimOptional(keys?.tavilyApiKey),
    searxngBaseUrl: trimOptional(keys?.searxngBaseUrl),
    youtubeApiKey: trimOptional(keys?.youtubeApiKey)
  };
}
function hasSearchProviders(keys) {
  return getConfiguredSearchProviderIds(keys).some((id) => id !== "aggregate");
}
function hasAggregatableSearchProviders(keys) {
  const normalized = normalizeSearchKeys(keys);
  return Boolean(
    normalized.braveApiKey || normalized.exaApiKey || normalized.serperApiKey || normalized.tavilyApiKey || normalized.searxngBaseUrl && isValidServiceUrl(normalized.searxngBaseUrl)
  );
}
function getConfiguredSearchProviderIds(keys, options = {}) {
  const normalized = normalizeSearchKeys(keys);
  const providers = [];
  if (normalized.braveApiKey) providers.push("brave");
  if (normalized.exaApiKey) providers.push("exa");
  if (normalized.serperApiKey) providers.push("serper");
  if (normalized.tavilyApiKey) providers.push("tavily");
  if (normalized.searxngBaseUrl && isValidServiceUrl(normalized.searxngBaseUrl)) {
    providers.push("searxng");
  }
  if (normalized.youtubeApiKey) providers.push("youtube");
  if (options.includeAggregate !== false && hasAggregatableSearchProviders(normalized)) {
    providers.push("aggregate");
  }
  return providers;
}
function trimOptional(value) {
  const trimmed = value?.trim();
  return trimmed || void 0;
}
const aggregateSearchInputSchema = searchQueryInputSchema;
const DEFAULT_PROVIDER_TIMEOUT_MS = 2e4;
function getConfiguredSearchProviders(searchKeys, fetchFn) {
  const keys = normalizeSearchKeys(searchKeys);
  const providers = [];
  if (keys.braveApiKey) {
    providers.push({
      name: "brave",
      search: createBraveSearch({ apiKey: keys.braveApiKey, fetch: fetchFn })
    });
  }
  if (keys.exaApiKey) {
    providers.push({
      name: "exa",
      search: createExaSearch({ apiKey: keys.exaApiKey, fetch: fetchFn })
    });
  }
  if (keys.serperApiKey) {
    providers.push({
      name: "serper",
      search: createSerperSearch({ apiKey: keys.serperApiKey, fetch: fetchFn })
    });
  }
  if (keys.tavilyApiKey) {
    providers.push({
      name: "tavily",
      search: createTavilySearch({ apiKey: keys.tavilyApiKey, fetch: fetchFn })
    });
  }
  if (keys.searxngBaseUrl && isValidServiceUrl(keys.searxngBaseUrl)) {
    providers.push({
      name: "searxng",
      search: createSearXNGFetchSearch({ baseUrl: keys.searxngBaseUrl, fetch: fetchFn })
    });
  }
  const byName = new Map(providers.map((provider) => [provider.name, provider]));
  return AGGREGATABLE_PROVIDER_NAMES.flatMap((providerName) => {
    const provider = byName.get(providerName);
    return provider ? [provider] : [];
  });
}
function createAggregateSearchTool(searchKeys, fetchFn, options = {}) {
  const providers = getConfiguredSearchProviders(searchKeys, fetchFn);
  const providerTimeoutMs = options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  return tool({
    description: "Search the web using all configured providers in parallel and merge the results. Results that appear across multiple providers are deduplicated and ranked by how many engines returned them, then by best per-engine rank. Use this when a single provider's coverage is insufficient or when cross-source corroboration matters more than latency.",
    strict: true,
    inputSchema: zodSchema(aggregateSearchInputSchema),
    execute: async ({ query }, ctx) => {
      if (providers.length === 0) {
        throw new SearchProviderConfigError(
          "Aggregate",
          "requires at least one underlying search provider to be configured"
        );
      }
      const settled = await Promise.allSettled(
        providers.map(
          (provider) => runProviderSearchWithTimeout(
            provider,
            query,
            ctx?.abortSignal,
            providerTimeoutMs
          )
        )
      );
      if (ctx?.abortSignal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      const engineResults = [];
      const errors = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          engineResults.push(result.value);
        } else {
          errors.push(result.reason);
        }
      }
      if (engineResults.length === 0 && errors.length > 0) {
        throw new AggregateSearchError(
          errors,
          `Aggregate search failed: all underlying providers failed for query "${query}"`
        );
      }
      return formatSearchResults(
        mergeResults(engineResults, DEFAULT_AGGREGATE_NUM_RESULTS)
      );
    }
  });
}
async function runProviderSearchWithTimeout(provider, query, parentSignal, timeoutMs) {
  const { signal, cleanup } = createChildSignalWithTimeout(
    parentSignal,
    timeoutMs,
    provider.name
  );
  try {
    return await Promise.race([
      provider.search(query, signal),
      rejectOnAbort(signal)
    ]);
  } finally {
    cleanup();
  }
}
function createChildSignalWithTimeout(parentSignal, timeoutMs, providerName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(
        `${providerName} search timed out after ${timeoutMs}ms.`,
        "TimeoutError"
      )
    );
  }, timeoutMs);
  const abortFromParent = () => {
    controller.abort(
      parentSignal?.reason ?? new DOMException("The operation was aborted.", "AbortError")
    );
  };
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}
function rejectOnAbort(signal) {
  if (signal.aborted) {
    return Promise.reject(getAbortReason(signal));
  }
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(getAbortReason(signal)), {
      once: true
    });
  });
}
function getAbortReason(signal) {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}
function createSearchTools(searchKeys, fetchFn) {
  const keys = normalizeSearchKeys(searchKeys);
  const tools = {};
  if (keys.braveApiKey) {
    tools.brave_search = createBraveSearchTool(keys.braveApiKey, fetchFn);
  }
  if (keys.exaApiKey) {
    tools.exa_search = createExaSearchTool(keys.exaApiKey, fetchFn);
  }
  if (keys.serperApiKey) {
    tools.serper_search = createSerperSearchTool(keys.serperApiKey, fetchFn);
  }
  if (keys.tavilyApiKey) {
    tools.tavily_search = createTavilySearchTool(keys.tavilyApiKey, fetchFn);
  }
  if (keys.searxngBaseUrl && isValidServiceUrl(keys.searxngBaseUrl)) {
    tools.searxng_search = createSearXNGSearchTool(keys.searxngBaseUrl, fetchFn);
  }
  if (keys.youtubeApiKey) {
    tools.youtube_search = createYouTubeSearchTool(keys.youtubeApiKey, fetchFn);
  }
  if (hasAggregatableSearchProviders(keys)) {
    tools.aggregate_search = createAggregateSearchTool(keys, fetchFn);
  }
  return tools;
}
function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}
function isAbortError(error) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
function throwIfAborted(abortSignal) {
  if (abortSignal?.aborted) {
    throw createAbortError();
  }
}
function abortablePromise(promise, abortSignal) {
  if (!abortSignal) return promise;
  throwIfAborted(abortSignal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError());
    abortSignal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      abortSignal.removeEventListener("abort", abort);
    });
  });
}
function abortableDelay(ms, abortSignal) {
  if (!abortSignal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  throwIfAborted(abortSignal);
  let abort;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    abort = () => {
      clearTimeout(timeout);
      reject(createAbortError());
    };
    abortSignal.addEventListener("abort", abort, { once: true });
  }).finally(() => {
    if (abort) abortSignal.removeEventListener("abort", abort);
  });
}
let _engine = null;
let _engineFetch = null;
let _enginePageLoader;
function getEngine(fetchFn, pageLoader) {
  if (!_engine || _engineFetch !== fetchFn || _enginePageLoader !== pageLoader) {
    _engine = createSearchExtractEngine({
      fetch: fetchFn,
      pageLoader,
      extractors: [
        new RedditExtractor(),
        new AmazonExtractor(),
        new ShopifyExtractor(),
        new TrustpilotExtractor(),
        new GithubExtractor(),
        new YouTubeExtractor()
      ]
    });
    _engineFetch = fetchFn;
    _enginePageLoader = pageLoader;
  }
  return _engine;
}
function shouldSummarizeContent(summarize, query, usedCustomExtractor) {
  if (query) return true;
  return summarize === true || !usedCustomExtractor && summarize !== false;
}
async function summarizeContent(model, markdown, query, abortSignal) {
  if (!markdown.trim()) return "";
  const result = streamText({
    model,
    system: "You are a research assistant. Extract and summarize the key information from this page content. Be concise but thorough. Preserve factual details, names, dates, and numbers.",
    prompt: `${markdown}${query ? `

Focus on information related to: ${query}` : ""}`,
    abortSignal
  });
  return result.text;
}
async function extractPageContent(options) {
  const {
    url,
    query,
    summarize: doSummarize,
    method = "auto",
    model,
    fetchFn = globalThis.fetch,
    pageLoader,
    abortSignal
  } = options;
  const engine = getEngine(fetchFn, pageLoader);
  const extractResult = await engine.extract(url, {
    method,
    summarize: false,
    signal: abortSignal
  });
  const { content, html: rawHtml, usedCustomExtractor, warnings } = extractResult;
  if (!rawHtml && !content) {
    return appendExtractionWarnings(
      `No content could be extracted from ${url}. The page may be empty, require JavaScript rendering, or be blocked by a paywall or captcha.`,
      warnings
    );
  }
  const shouldSummarize = shouldSummarizeContent(doSummarize, query, usedCustomExtractor);
  if (!shouldSummarize) return content;
  if (!model || !content.trim()) return content;
  try {
    return await summarizeContent(model, content, query, abortSignal) || content;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return content;
  }
}
function appendExtractionWarnings(message, warnings) {
  const usefulWarnings = (warnings ?? []).filter((warning) => warning.trim());
  if (usefulWarnings.length === 0) return message;
  return `${message}

Warnings:
${usefulWarnings.map((warning) => `- ${warning}`).join("\n")}`;
}
const extractPageContentInputSchema = z.object({
  url: z.string().describe("URL to extract content from"),
  query: z.string().optional().describe(
    'What you want from the page — focuses the summary on specific information (e.g. "price", "ingredients list", "author biography").'
  ),
  summarize: z.boolean().optional().describe(
    "Set to false to get the full page content. By default the page is summarized."
  ),
  method: z.enum(["auto", "fetch", "render"]).optional().describe(
    "Extraction method. 'auto' tries fetch then falls back to render. 'fetch' forces HTTP-only. 'render' forces browser rendering."
  )
});
function createExtractPageContentTool(model, fetchFn, pageLoader) {
  return tool({
    description: 'Extract the plain-text content of a web page with scripts, styles, hidden UI, and obvious boilerplate stripped. Use this to read the content of a URL found during research.\n\nBy default the page is summarized. Provide a `query` to focus the summary on specific information — for example `query: "price and availability"` returns a summary centered on those details. Set `summarize: false` when you need the full page content.',
    strict: true,
    inputSchema: zodSchema(extractPageContentInputSchema),
    outputSchema: zodSchema(z.string().describe("Extracted page content")),
    execute: async ({ url, query, summarize: doSummarize, method }, options) => {
      try {
        validateUrl(url);
      } catch (e) {
        if (e instanceof UrlValidationError) return `Error: ${e.message}`;
        throw e;
      }
      return extractPageContent({
        url,
        query,
        summarize: doSummarize,
        method,
        model,
        fetchFn,
        pageLoader,
        abortSignal: options?.abortSignal
      });
    }
  });
}
function createResearchCheckpointTool(model) {
  return tool({
    description: "Get plain-text research quality guidance before finalizing a researched answer. Include searches run, opened sources, verified claims, unresolved questions, confidence, and readiness. The result is advisory guidance, not an approval or rejection.",
    strict: true,
    inputSchema: zodSchema(researchCheckpointInputSchema),
    outputSchema: zodSchema(researchCheckpointResultSchema),
    execute: async (input, options) => {
      return reviewResearchCheckpoint(
        input,
        (checkpoint) => judgeResearchCheckpoint(model, checkpoint, options?.abortSignal)
      );
    }
  });
}
async function judgeResearchCheckpoint(model, checkpoint, abortSignal) {
  const { text } = await generateText({
    model,
    system: "You review whether an agent has done enough research to answer. Return concise plain text guidance only, never JSON. Do not approve or reject the work. Help the agent decide whether more research would materially improve the answer, with attention to direct relevance, source support, recency when relevant, and unresolved gaps.",
    prompt: `Review this research checkpoint.

${JSON.stringify(
      checkpoint,
      null,
      2
    )}`,
    abortSignal
  });
  return text;
}
const sequentialThinkingInputSchema = z.object({
  thought: z.string().describe("Your current thinking step")
});
function createSequentialThinkingTool() {
  return tool({
    description: "A detailed tool for dynamic and reflective problem-solving through thoughts. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights as understanding deepens. Use for: breaking down complex problems into steps, planning with room for revision, analysis that might need course correction, problems where the full scope might not be clear initially.",
    strict: true,
    inputSchema: zodSchema(sequentialThinkingInputSchema),
    execute: async () => ({ status: "ok" })
  });
}
const RESEARCH_PLANNER_PROMPT = `You are a research planner.

Create a compact research handoff for another agent.
Do not answer the user. Do not restate the original query.
Define what must be researched, why it matters, and what evidence the next agent should collect.
Classify the goal as decide, compare, verify, explain, find, or troubleshoot.

Return only this structure:

## Objective

{{one sentence describing the decision, explanation, verification, comparison, list, or troubleshooting outcome the next agent must support}}

## Context extracted

- Topic: {{main subject, normalized}}
- User intent: {{what the user is trying to achieve, not just what they asked}}
- Output shape: {{recommendation | comparison | verification | explanation | ranked list | troubleshooting path | other}}
- Freshness: {{timeless | recent | current | today-specific}}
- Constraints: {{specific limits that affect the answer: location, budget, platform, version, compatibility, time sensitivity, legal/regulatory scope, preferences, exclusions}}
- Assumptions to verify: {{claims implied by the query that may be false, outdated, ambiguous, or incomplete}}

## Must-answer questions

Create only the questions needed to satisfy the objective.

| Question     | Why it matters      | Evidence to collect                                | Best source types                                       | Suggested searches                         |
| ------------ | ------------------- | -------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| {{question}} | {{decision impact}} | {{facts/data/examples/limits/prices/quotes/specs}} | {{official/vendor/government/source/review/forum/etc.}} | {{query 1}}; {{query 2}}; ...; {{query N}} |

## Source priority

- Primary: {{official, legal, regulatory, vendor, source-code, dataset, or direct-documentation sources to prefer}}
- Secondary: {{independent analysis, reputable reporting, benchmarks, reviews, or explainers to use for context}}
- Experiential: {{forums, user reports, issue trackers, comments, and firsthand accounts to use carefully}}
- Weak: {{content farms, unsourced summaries, stale pages, marketing-only claims, or AI-generated pages to avoid or corroborate}}

## Research passes

### Map the topic

- Purpose: {{build broad context, terminology, actors, options, timelines, or competing claims}}
- Search pattern: broad
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{high-quality overview sources and source trails}}
- Extract: {{key terms, entities, claims, dates, numbers, source leads, and likely disagreements}}

### Primary evidence

- Purpose: {{collect the strongest direct evidence for the central questions}}
- Search pattern: official / source-code-level / jurisdiction-specific / pricing / availability
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{Primary sources}}
- Extract: {{exact claims, prices, dates, specs, rules, compatibility limits, quotes, and links}}

### Independent evidence

- Purpose: {{corroborate, compare, and find limitations or conflicting evidence}}
- Search pattern: comparison / failures / implementation / user reports
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{Secondary and Experiential sources}}
- Extract: {{exact fields, facts, claims, examples, conflicts, dates, numbers, links, or caveats to capture}}

### Synthesis

- Purpose: {{resolve contradictions and decide what the final answer can support}}
- Search pattern: targeted follow-up
- Suggested searches: {{query 1}}; {{query 2}}; ...; {{query N}}
- Prioritize: {{sources that settle weak or disputed claims}}
- Extract: {{remaining uncertainty, confidence level, caveats, and final evidence map}}

Repeat for as many passes as needed. Prefer 3-6 focused passes, but use more if the query requires separate subtopics.

## Confidence rules

- High: {{multiple strong sources agree, primary evidence supports key claims, and dates are appropriate for the Freshness classification}}
- Medium: {{evidence is credible but incomplete, indirect, or has minor conflicts}}
- Low: {{claims rely on weak, stale, unavailable, or contradictory evidence}}

## Stop conditions

Stop only when must-answer questions are answered, key claims have source support, contradictions are handled, and further searching is unlikely to change the answer.`;
const researchPlanInputSchema = z.object({
  query: z.string().min(1).describe("The user's research question or request")
});
function createResearchPlanTool(model) {
  return tool({
    description: "Call this after asking clarifying questions to create a research plan.",
    strict: true,
    inputSchema: zodSchema(researchPlanInputSchema),
    execute: async ({ query }, options) => {
      const result = streamText({
        model,
        system: RESEARCH_PLANNER_PROMPT,
        prompt: query,
        abortSignal: options?.abortSignal
      });
      const text = await result.text;
      if (!text || !text.trim()) {
        return "Error: Research plan was empty. Please try again with a more specific query.";
      }
      return text;
    }
  });
}
const URL_PATTERN = /https?:\/\/[^\s)\]>"')]+/g;
function extractUrls(text) {
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?>]+$/, "")))];
}
const factsCheckInputSchema = z.object({
  originalPrompt: z.string().min(1).describe(
    "The original research objective, including the user's questions and clarifications."
  ),
  finalResearch: z.string().min(1).describe(
    "The final research answer/report to fact-check. Must include the source URLs cited in the text."
  )
});
const FACTS_CHECK_SYSTEM = `You are a fact-checking assistant. You will receive:
1. A research answer that contains factual claims and source URLs.
2. The content extracted from each cited source.

Your job is to check whether the high-risk factual claims in the research answer are supported by the cited sources. Focus on:
- Exact numbers, prices, dimensions, dates, quantities, statistics
- Named entities, product availability, regulatory/legal claims
- Any claim that would materially change the answer if wrong

Ignore narrative, style, opinions, and generic explanations.

For each claim you check, state:
- The claim from the research answer
- What the source actually says (quote if possible)
- Whether the claim is confirmed, contradicted, or unverifiable from the sources

If all checked claims are confirmed, say so. If something is wrong or unsupported, state the incorrect claim, the corrected information, and the basis for the correction. If a source could not be fetched, say so explicitly.

Return plain text, not JSON.`;
function createFactsCheckTool(model, config = {}) {
  return tool({
    description: "Call this before giving the final answer. It extracts source URLs from the research text, opens each one, and checks whether the high-risk factual claims are supported by those sources.",
    strict: true,
    inputSchema: zodSchema(factsCheckInputSchema),
    outputSchema: zodSchema(
      z.string().describe("Plain-text fact-check notes")
    ),
    execute: async (input, options) => {
      const urls = extractUrls(input.finalResearch);
      if (urls.length === 0) {
        return "No source URLs found in the research text. Fact-check could not be performed.";
      }
      const fetchResults = await Promise.allSettled(
        urls.map(async (url) => {
          const content = await extractPageContent({
            url,
            summarize: false,
            fetchFn: config.fetchFn,
            pageLoader: config.pageLoader,
            abortSignal: options?.abortSignal
          });
          return { url, content };
        })
      );
      const sourceSections = [];
      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        const url = urls[i];
        if (result.status === "fulfilled" && result.value.content) {
          sourceSections.push(
            `--- Source ${i + 1}: ${url} ---
${result.value.content}`
          );
        } else {
          const reason = result.status === "rejected" ? result.reason instanceof Error ? result.reason.message : String(result.reason) : "empty content";
          sourceSections.push(
            `--- Source ${i + 1}: ${url} ---
[Could not fetch: ${reason}]`
          );
        }
      }
      const prompt = [
        "Original research objective:",
        input.originalPrompt,
        "",
        "Research answer to fact-check:",
        input.finalResearch,
        "",
        "Cited source contents:",
        ...sourceSections
      ].join("\n");
      const { text } = await generateText({
        model,
        system: FACTS_CHECK_SYSTEM,
        prompt,
        abortSignal: options?.abortSignal
      });
      return text.trim() || "Fact-check completed, but no notes were returned.";
    }
  });
}
async function createResearchTools(config) {
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
    facts_check: createFactsCheckTool(model, { fetchFn, pageLoader })
  };
  return applyToolCallRequirementSafeguards(tools);
}
const MAX_GUARD_RETRIES = 2;
const DEFAULT_MAX_RETRIES_PER_GUARD = {
  question_tool: MAX_GUARD_RETRIES,
  research_checkpoint: MAX_GUARD_RETRIES,
  tool_call_requirement: MAX_GUARD_RETRIES
};
function createGuardedStream({
  model,
  messages,
  abortSignal,
  fetchFn,
  searchKeys,
  pageLoader,
  systemPrompt,
  isHiddenText,
  tools: prebuiltTools,
  extraTools,
  evaluateStep,
  maxGuardRetries,
  getProviderOptions,
  onError,
  onEvent,
  controller
}) {
  return (async () => {
    const effectiveMaxRetries = { ...DEFAULT_MAX_RETRIES_PER_GUARD, ...maxGuardRetries };
    const retries = {};
    let currentUiMessages = messages;
    let toolChoice;
    let sendStart = true;
    let lastFinish;
    try {
      let tools;
      if (prebuiltTools) {
        tools = extraTools ? { ...prebuiltTools, ...extraTools } : prebuiltTools;
      } else {
        const baseTools = await createResearchTools({
          model,
          fetchFn: fetchFn ?? globalThis.fetch.bind(globalThis),
          searchKeys,
          pageLoader
        });
        tools = extraTools ? { ...baseTools, ...extraTools } : baseTools;
      }
      let currentModelMessages = await convertToModelMessages(
        currentUiMessages,
        { tools }
      );
      while (!abortSignal?.aborted) {
        lastFinish = await runAttempt({
          model,
          tools,
          messages: currentModelMessages,
          activeTools: getActiveToolNamesForMessages(
            tools,
            currentUiMessages
          ),
          toolChoice,
          originalMessages: currentUiMessages,
          sendStart,
          abortSignal,
          controller,
          systemPrompt,
          getProviderOptions,
          onError
        });
        if (lastFinish.usage) {
          writeTokenUsageEvent(controller, lastFinish.usage, onEvent);
        }
        const decision = evaluateStep ? evaluateStep({
          messages: currentUiMessages,
          responseMessage: lastFinish.responseMessage
        }) : evaluateAssistantStep({
          messages: currentUiMessages,
          responseMessage: lastFinish.responseMessage,
          isHiddenText
        });
        if (decision.action === "accept") {
          const diagnostic = getNoReplyDiagnostic(lastFinish, isHiddenText);
          if (diagnostic) {
            writeAgentDiagnosticEvent(controller, diagnostic, onEvent);
          }
          break;
        }
        const guardRetryCount = retries[decision.guard] ?? 0;
        const guardMaxRetries = effectiveMaxRetries[decision.guard] ?? MAX_GUARD_RETRIES;
        if (guardRetryCount >= guardMaxRetries) {
          writeGuardrailEvent(controller, maxRetryWarning(decision, guardMaxRetries), onEvent);
          break;
        }
        retries[decision.guard] = guardRetryCount + 1;
        writeGuardrailEvent(controller, {
          ...decision.event,
          attempt: retries[decision.guard]
        }, onEvent);
        currentUiMessages = lastFinish.messages;
        currentModelMessages = await buildRetryMessages({
          messages: currentUiMessages,
          tools,
          instruction: decision.retryInstruction
        });
        toolChoice = decision.toolChoice;
        sendStart = false;
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        return;
      }
      throw error;
    }
  })();
}
async function runAttempt(params) {
  try {
    return await runAttemptOnce(params);
  } catch (error) {
    if (params.toolChoice && !params.abortSignal?.aborted && isForcedToolChoiceUnsupported(error)) {
      return await runAttemptOnce({ ...params, toolChoice: void 0 });
    }
    throw error;
  }
}
function isForcedToolChoiceUnsupported(error) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (message.includes("tool_choice") || message.includes("tool choice")) && (message.includes("thinking") || message.includes("reasoning"));
}
async function runAttemptOnce({
  model,
  tools,
  messages,
  activeTools,
  toolChoice,
  originalMessages,
  sendStart,
  abortSignal,
  controller,
  systemPrompt: effectiveSystemPrompt,
  getProviderOptions,
  onError
}) {
  let finish;
  const result = streamText({
    model,
    system: effectiveSystemPrompt,
    messages,
    tools,
    activeTools: activeTools.length > 0 ? activeTools : void 0,
    toolChoice,
    abortSignal,
    providerOptions: getProviderOptions ? getProviderOptions({ model, toolChoice }) : void 0
  });
  const stream = result.toUIMessageStream({
    originalMessages,
    sendStart,
    sendFinish: false,
    onError,
    onFinish: (event) => {
      finish = {
        messages: event.messages,
        responseMessage: event.responseMessage,
        finishReason: event.finishReason
      };
    }
  });
  await pipeUIMessageStream(stream, controller, abortSignal);
  let finishReason;
  let totalUsage;
  try {
    finishReason = await result.finishReason;
    totalUsage = await result.totalUsage;
  } catch (err) {
    if (!abortSignal?.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Model attempt finished without a response message: ${message}`);
    }
  }
  if (!finish) {
    throw new Error("Model attempt finished without a response message.");
  }
  finish.finishReason = finish.finishReason ?? finishReason;
  if (totalUsage) {
    finish.usage = {
      inputTokens: totalUsage.inputTokens ?? void 0,
      outputTokens: totalUsage.outputTokens ?? void 0,
      totalTokens: totalUsage.totalTokens ?? void 0
    };
  }
  return finish;
}
async function buildRetryMessages({
  messages,
  tools,
  instruction
}) {
  return [
    ...await convertToModelMessages(messages, { tools }),
    {
      role: "user",
      content: `Internal guardrail retry. ${instruction}`
    }
  ];
}
async function pipeUIMessageStream(stream, controller, abortSignal) {
  await stream.pipeTo(
    new WritableStream({
      write(chunk) {
        controller.enqueue(chunk);
      }
    }),
    { signal: abortSignal, preventClose: true }
  );
}
function writeGuardrailEvent(controller, event, onEvent) {
  controller.enqueue({
    type: "data-guardrail_event",
    id: `guardrail-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: event
  });
  onEvent?.({ type: "guardrail", data: event });
}
function writeAgentDiagnosticEvent(controller, event, onEvent) {
  controller.enqueue({
    type: "data-agent_diagnostic",
    id: `agent-diagnostic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: event
  });
  onEvent?.({ type: "diagnostic", data: event });
}
function writeTokenUsageEvent(controller, usage, onEvent) {
  controller.enqueue({
    type: "data-token_usage",
    id: `token-usage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: usage
  });
  onEvent?.({ type: "token_usage", data: usage });
}
function getNoReplyDiagnostic(finish, isHiddenText) {
  const summary = summarizeAssistantOutput(finish.responseMessage, isHiddenText);
  if (summary.hasVisibleReply) return null;
  if (finish.finishReason === "tool-calls") {
    return null;
  }
  return {
    kind: "empty_response",
    status: "warning",
    title: "No assistant reply",
    message: getNoReplyMessage(finish.finishReason, summary),
    reason: getNoReplyReason(finish.finishReason, summary),
    ...finish.finishReason ? { finishReason: finish.finishReason } : {},
    ...summary.toolCallCount > 0 ? { toolCallCount: summary.toolCallCount } : {}
  };
}
function summarizeAssistantOutput(message, isHiddenText) {
  const hidden = isHiddenText ?? (() => false);
  let hasVisibleReply = false;
  let hasReasoning = false;
  let hasSubAgentText = false;
  let toolCallCount = 0;
  for (const part of message.parts) {
    if (part.type === "text") {
      if (!part.text.trim()) continue;
      if (hidden(part)) {
        hasSubAgentText = true;
      } else {
        hasVisibleReply = true;
      }
      continue;
    }
    if (part.type === "reasoning" && part.text.trim()) {
      hasReasoning = true;
      continue;
    }
    if (part.type === "source-url" || part.type === "source-document" || part.type === "file") {
      hasVisibleReply = true;
      continue;
    }
    if (isToolUIPart(part)) {
      toolCallCount += 1;
    }
  }
  return {
    hasVisibleReply,
    hasReasoning,
    hasSubAgentText,
    toolCallCount
  };
}
function getNoReplyMessage(finishReason, summary) {
  if (finishReason === "length") {
    return "The provider stopped at the output limit before returning visible answer text.";
  }
  if (finishReason === "content-filter") {
    return "The provider reported a content-filter stop before returning visible answer text.";
  }
  if (summary.toolCallCount > 0) {
    return "The model finished after tool work but did not return final answer text.";
  }
  if (summary.hasSubAgentText) {
    return "Only internal verification or tool-progress text was produced; no final answer text was returned.";
  }
  if (summary.hasReasoning) {
    return "The model produced reasoning but no visible answer text.";
  }
  return "The provider ended the turn without returning visible answer text.";
}
function getNoReplyReason(finishReason, summary) {
  const reason = finishReason ?? "unknown";
  if (summary.toolCallCount > 0) {
    return `Finish reason: ${reason}. Tool calls in the final step: ${summary.toolCallCount}.`;
  }
  return `Finish reason: ${reason}.`;
}
function maxRetryWarning(decision, maxRetries) {
  return {
    kind: decision.guard,
    status: "warning",
    title: "Guardrail retry limit reached",
    message: "The agent kept missing this guardrail, so the latest output is shown.",
    reason: decision.event.reason,
    attempt: maxRetries
  };
}
function streamResearch(options) {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const systemPrompt = options.systemPrompt ?? defaultSystemPrompt;
  return new ReadableStream({
    async start(controller) {
      try {
        await createGuardedStream({
          model: options.model,
          messages: options.messages,
          abortSignal: options.abortSignal,
          fetchFn,
          searchKeys: options.searchKeys,
          pageLoader: options.pageLoader,
          systemPrompt,
          isHiddenText: options.isHiddenText,
          tools: options.tools,
          extraTools: options.extraTools,
          evaluateStep: options.evaluateStep,
          maxGuardRetries: options.maxGuardRetries,
          getProviderOptions: options.getProviderOptions,
          onError: options.onError,
          onEvent: options.onEvent,
          controller
        });
        if (options.abortSignal?.aborted) {
          controller.enqueue({ type: "abort", reason: "aborted" });
        } else {
          controller.enqueue({ type: "finish", finishReason: "stop" });
        }
      } catch (error) {
        if (options.abortSignal?.aborted) {
          controller.enqueue({ type: "abort", reason: "aborted" });
        } else {
          controller.enqueue({
            type: "error",
            errorText: error instanceof Error ? error.message : "Research failed."
          });
          controller.enqueue({ type: "finish", finishReason: "error" });
        }
      } finally {
        controller.close();
      }
    }
  });
}
function createArtifactStore(config) {
  const root = normalizeTrustedRoot(config.root);
  const { storage } = config;
  function resolve(relativePath = ".") {
    const normalized = normalizeArtifactRelativePath(relativePath, {
      allowEmpty: true
    });
    return joinArtifactPaths(root, normalized);
  }
  async function exists(relativePath) {
    const resolved = resolve(relativePath);
    if (storage.exists) return storage.exists(resolved);
    return await storage.readText(resolved) !== null;
  }
  return {
    root,
    resolve,
    exists,
    async readText(relativePath) {
      return storage.readText(resolve(relativePath));
    },
    async writeText(relativePath, content, options = {}) {
      if (options.overwrite === false && await exists(relativePath)) {
        throw new Error(`Artifact already exists: ${normalizeArtifactRelativePath(relativePath)}`);
      }
      const target = resolve(relativePath);
      await storage.ensureDirectory(dirnameArtifactPath(target));
      await storage.writeText(target, content);
    },
    async writeJson(relativePath, content, options) {
      await this.writeText(
        relativePath,
        `${JSON.stringify(content, null, 2)}
`,
        options
      );
    },
    async list(relativePath = ".") {
      const normalized = normalizeArtifactRelativePath(relativePath, {
        allowEmpty: true
      });
      const entries = await storage.list(resolve(normalized));
      return entries.filter((entry) => entry.type === "file" || entry.type === "directory").map((entry) => ({
        path: joinArtifactPaths(normalized, sanitizeArtifactPathSegment(entry.name)),
        type: entry.type
      })).sort((a, b) => a.path.localeCompare(b.path));
    },
    async remove(relativePath) {
      await storage.remove(resolve(relativePath));
    },
    async rename(from, to, options = {}) {
      if (options.overwrite !== true && await exists(to)) {
        throw new Error(`Artifact already exists: ${normalizeArtifactRelativePath(to)}`);
      }
      const target = resolve(to);
      await storage.ensureDirectory(dirnameArtifactPath(target));
      await storage.rename(resolve(from), target);
    },
    async ensureDirectory(relativePath = ".") {
      await storage.ensureDirectory(resolve(relativePath));
    }
  };
}
function normalizeArtifactRelativePath(value, options = {}) {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === ".") {
    if (options.allowEmpty) return "";
    throw new Error("Artifact path must not be empty.");
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) {
    throw new Error(`Refusing absolute artifact path: ${value}`);
  }
  const parts = [];
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      throw new Error(`Refusing artifact path traversal: ${value}`);
    }
    parts.push(sanitizeArtifactPathSegment(segment));
  }
  if (parts.length === 0) {
    if (options.allowEmpty) return "";
    throw new Error("Artifact path must not be empty.");
  }
  return parts.join("/");
}
function sanitizeArtifactPathSegment(value) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  if (!sanitized || sanitized === "." || sanitized === "..") return "artifact";
  return sanitized;
}
function joinArtifactPaths(...parts) {
  const cleaned = parts.map((part) => part?.trim().replace(/\\/g, "/") ?? "").filter((part) => part.length > 0 && part !== ".").map((part, index) => {
    if (index === 0) return part.replace(/\/+$/g, "");
    return part.replace(/^\/+|\/+$/g, "");
  }).filter((part) => part.length > 0);
  if (cleaned.length === 0) return ".";
  return cleaned.join("/");
}
function normalizeTrustedRoot(root) {
  const normalized = root.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized || ".";
}
function dirnameArtifactPath(value) {
  const normalized = value.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}
const filePathSchema = z.string().min(1).describe("Path relative to the active files folder.");
const createOrUpdateFileSchema = z.object({
  path: filePathSchema,
  content: z.string()
});
const readOrDeleteFileSchema = z.object({
  path: filePathSchema
});
const moveFileSchema = z.object({
  from: filePathSchema,
  to: filePathSchema
});
const listFilesSchema = z.object({
  path: z.string().optional().describe("Optional directory relative to the active files folder.")
});
function createScopedFileTools(config) {
  const workingDirectory = normalizeArtifactRelativePath(
    config.workingDirectory ?? "files",
    { allowEmpty: true }
  );
  const allowSubdirectories = config.allowSubdirectories ?? true;
  function scopedPath(inputPath, options = {}) {
    const normalized = normalizeArtifactRelativePath(inputPath, options);
    if (!allowSubdirectories && normalized.includes("/")) {
      throw new Error(`Subdirectories are not allowed in file path: ${inputPath}`);
    }
    return joinArtifactPaths(workingDirectory, normalized);
  }
  async function emit(event) {
    await config.onMutation?.(event);
  }
  return {
    create_file: tool({
      description: "Create a model-authored working file in the active files folder. Fails if the file already exists.",
      strict: true,
      inputSchema: zodSchema(createOrUpdateFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path, content }) => {
        const target = scopedPath(path);
        await config.store.writeText(target, content, { overwrite: false });
        await emit({ operation: "created", path: normalizeArtifactRelativePath(path) });
        return `Created ${normalizeArtifactRelativePath(path)}.`;
      }
    }),
    read_file: tool({
      description: "Read a model-authored working file from the active files folder. Use list_files first when you need to discover available files.",
      strict: true,
      inputSchema: zodSchema(readOrDeleteFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path }) => {
        const content = await config.store.readText(scopedPath(path));
        if (content === null) {
          throw new Error(`Cannot read ${normalizeArtifactRelativePath(path)}: file does not exist.`);
        }
        return content;
      }
    }),
    update_file: tool({
      description: "Replace the full content of a model-authored working file in the active files folder.",
      strict: true,
      inputSchema: zodSchema(createOrUpdateFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path, content }) => {
        const target = scopedPath(path);
        if (!await config.store.exists(target)) {
          throw new Error(`Cannot update ${normalizeArtifactRelativePath(path)}: file does not exist.`);
        }
        await config.store.writeText(target, content);
        await emit({ operation: "updated", path: normalizeArtifactRelativePath(path) });
        return `Updated ${normalizeArtifactRelativePath(path)}.`;
      }
    }),
    move_file: tool({
      description: "Rename or move a model-authored working file within the active files folder.",
      strict: true,
      inputSchema: zodSchema(moveFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ from, to }) => {
        const source = scopedPath(from);
        const target = scopedPath(to);
        if (!await config.store.exists(source)) {
          throw new Error(`Cannot move ${normalizeArtifactRelativePath(from)}: file does not exist.`);
        }
        if (await config.store.exists(target)) {
          throw new Error(`Cannot move ${normalizeArtifactRelativePath(from)} to ${normalizeArtifactRelativePath(to)}: destination already exists.`);
        }
        await config.store.rename(source, target, { overwrite: false });
        await emit({
          operation: "moved",
          path: normalizeArtifactRelativePath(to),
          previousPath: normalizeArtifactRelativePath(from)
        });
        return `Moved ${normalizeArtifactRelativePath(from)} to ${normalizeArtifactRelativePath(to)}.`;
      }
    }),
    delete_file: tool({
      description: "Delete a model-authored working file from the active files folder.",
      strict: true,
      inputSchema: zodSchema(readOrDeleteFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path }) => {
        const target = scopedPath(path);
        if (!await config.store.exists(target)) {
          throw new Error(`Cannot delete ${normalizeArtifactRelativePath(path)}: file does not exist.`);
        }
        await config.store.remove(target);
        await emit({ operation: "deleted", path: normalizeArtifactRelativePath(path) });
        return `Deleted ${normalizeArtifactRelativePath(path)}.`;
      }
    }),
    list_files: tool({
      description: "List model-authored working files in the active files folder.",
      strict: true,
      inputSchema: zodSchema(listFilesSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path }) => {
        const entries = await listFilesRecursive(
          config.store,
          scopedPath(path ?? ".", { allowEmpty: true }),
          workingDirectory
        );
        return entries.length > 0 ? entries.join("\n") : "No files found.";
      }
    })
  };
}
async function listFilesRecursive(store, currentPath, rootPath, output = []) {
  const entries = await store.list(currentPath).catch(() => []);
  for (const entry of entries) {
    if (output.length >= 200) break;
    if (entry.type === "directory") {
      await listFilesRecursive(store, entry.path, rootPath, output);
    } else {
      output.push(stripRootPath(entry.path, rootPath));
    }
  }
  return output.sort();
}
function stripRootPath(value, rootPath) {
  const normalizedRoot = normalizeArtifactRelativePath(rootPath, { allowEmpty: true });
  if (!normalizedRoot) return value;
  return value.startsWith(`${normalizedRoot}/`) ? value.slice(normalizedRoot.length + 1) : value;
}
const DEFAULT_SYSTEM_PROMPT = defaultSystemPrompt;
export {
  DEFAULT_SYSTEM_PROMPT,
  RESEARCH_PLANNER_PROMPT,
  TOOL_CALL_REQUIREMENTS,
  TOOL_NAMES,
  ToolCallRequirementError,
  UrlValidationError,
  abortableDelay,
  abortablePromise,
  applyToolCallRequirementSafeguards,
  asksUserForInput,
  createAggregateSearchTool,
  createArtifactStore,
  createBraveSearchTool,
  createDisambiguateTool,
  createExaSearchTool,
  createExtractPageContentTool,
  createFactsCheckTool,
  createGuardedStream,
  createResearchCheckpointTool,
  createResearchPlanTool,
  createResearchTools,
  createScopedFileTools,
  createSearXNGSearchTool,
  createSearchTools,
  createSequentialThinkingTool,
  createSerperSearchTool,
  createTavilySearchTool,
  createYouTubeSearchTool,
  evaluateAssistantStep,
  evaluateToolCallRequirementForModelMessages,
  evaluateToolCallRequirementForResponse,
  evaluateToolCallRequirementForUIMessages,
  extractPageContent,
  formatToolCallRequirementViolation,
  getActiveToolNamesForMessages,
  getConfiguredSearchProviderIds,
  getToolCallNamesFromModelMessages,
  getToolCallNamesFromUIMessages,
  guardrailEventSchema,
  hasAggregatableSearchProviders,
  hasSearchProviders,
  isAbortError,
  isResearchLikeRequest,
  isValidServiceUrl,
  isValidUrl,
  joinArtifactPaths,
  normalizeArtifactRelativePath,
  normalizeSearchKeys,
  questionsTool,
  researchCheckpointInputSchema,
  researchCheckpointResultSchema,
  reviewResearchCheckpoint,
  sanitizeArtifactPathSegment,
  streamResearch,
  throwIfAborted,
  validateServiceUrl,
  validateUrl
};
//# sourceMappingURL=index.js.map
