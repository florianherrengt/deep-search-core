import { isToolUIPart, } from "ai";
import { z } from "zod";
import { evaluateToolCallRequirementForResponse, } from "./tool-call-requirements.js";
import { TOOL_NAMES } from "../tool-names.js";
export const guardrailEventSchema = z.object({
    kind: z.enum([
        "question_tool",
        "research_checkpoint",
        "tool_call_requirement",
    ]),
    status: z.enum(["retrying", "warning", "passed"]),
    title: z.string(),
    message: z.string(),
    reason: z.string().optional(),
    attempt: z.number().optional(),
});
const researchSourceSchema = z.object({
    url: z.string().min(1),
    title: z.string().optional(),
    sourceType: z.enum(["primary", "secondary", "forum", "unknown"]).optional(),
    date: z.string().optional(),
});
export const researchCheckpointInputSchema = z.object({
    originalQuestion: z.string().min(1),
    searchesRun: z.array(z.string().min(1)),
    sourcesOpened: z.array(researchSourceSchema),
    claimsVerified: z.array(z.string().min(1)),
    unresolvedQuestions: z.array(z.string().min(1)),
    confidence: z.enum(["low", "medium", "high"]),
    readyToAnswer: z.boolean(),
});
export const researchCheckpointResultSchema = z.string().min(1);
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
    "may i",
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
    /\bsend me\b/i,
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
    "directions",
];
const RESEARCH_TOOL_NAMES = new Set([
    TOOL_NAMES.brave_search,
    TOOL_NAMES.exa_search,
    TOOL_NAMES.serper_search,
    TOOL_NAMES.tavily_search,
    TOOL_NAMES.searxng_search,
    TOOL_NAMES.extract_page_content,
]);
const RESEARCH_CHECKPOINT_TOOL = TOOL_NAMES.research_checkpoint;
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripCodeBlocksAndQuotes(text) {
    return text
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`[^`]*`/g, " ")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith(">"))
        .join("\n");
}
function normalizeForDetection(text) {
    return stripCodeBlocksAndQuotes(text)
        .replace(/\bwhy\?\s+because\b/gi, "because")
        .split("\n")
        .filter((line) => !/^\s*(open\s+)?questions?\s*:/i.test(line))
        .join("\n")
        .toLowerCase();
}
export function asksUserForInput(text) {
    const normalized = normalizeForDetection(text);
    if (!normalized.trim())
        return false;
    if (/\bthe question is\b/.test(normalized))
        return false;
    const userDirected = /\b(you|your|you'd|you'll|yourself)\b/i.test(normalized);
    const questionSentences = normalized.match(/(?:^|[.!?]\s+|\n\s*)[^.!?\n]{1,260}\?/g);
    const starterPattern = new RegExp(`^\\s*(${QUESTION_STARTERS.map(escapeRegex).join("|")})\\b`, "i");
    const startsLikeQuestion = (questionSentences ?? []).some((sentence) => {
        const trimmed = sentence.replace(/^[.!?]\s+/, "").trim();
        return (starterPattern.test(trimmed) &&
            (/\b(you|your|you'd|you'll|yourself)\b/i.test(trimmed) ||
                /\b(should|could|can|may)\s+i\b/i.test(trimmed) ||
                /\bshould\s+we\b/i.test(trimmed)));
    });
    if (startsLikeQuestion)
        return true;
    const requestsInput = REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
    const choiceNeedsReply = /(?:^|[.!?]\s+|\n\s*)(?:please\s+)?(?:choose|pick)\b[\s\S]{0,120}\b(?:before i continue|to proceed|so i can|then i can|and i(?:'ll| will| can))\b/i.test(normalized);
    const strongImperativeRequest = /\bplease\s+(provide|confirm)\b/i.test(normalized) ||
        /\b(let me know|tell me|before i continue|to proceed)\b/i.test(normalized);
    return (choiceNeedsReply ||
        (requestsInput && (userDirected || strongImperativeRequest)));
}
function getMessageText(message, isHidden) {
    if (!message)
        return "";
    const hidden = isHidden ?? (() => false);
    return message.parts
        .filter((part) => part.type === "text")
        .filter((part) => !hidden(part))
        .map((part) => part.text)
        .join("\n")
        .trim();
}
function getLatestUserText(messages, isHidden) {
    const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");
    return getMessageText(latestUserMessage, isHidden);
}
export function isResearchLikeRequest(text) {
    const normalized = text.trim().toLowerCase();
    if (!normalized)
        return false;
    if (/^(hi|hello|thanks|thank you|ok|okay)\b/.test(normalized))
        return false;
    if (RESEARCH_KEYWORDS.some((word) => normalized.includes(word)))
        return true;
    return (normalized.length >= 40 &&
        /^(what|who|when|where|why|how|which)\b/.test(normalized));
}
function getToolNameFromPart(part) {
    if (!isToolUIPart(part))
        return null;
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
export function evaluateAssistantStep({ messages, responseMessage, isHiddenText, }) {
    const hiddenPredicate = isHiddenText ?? (() => false);
    const toolRequirementViolation = evaluateToolCallRequirementForResponse({
        messages,
        responseMessage,
    });
    if (toolRequirementViolation) {
        return toolRequirementRetry(toolRequirementViolation);
    }
    const text = getMessageText(responseMessage, hiddenPredicate);
    if (!text)
        return { action: "accept" };
    const userText = getLatestUserText(messages, hiddenPredicate);
    const currentTurnMessages = getCurrentTurnMessages(messages, responseMessage);
    if (!hasToolCall(responseMessage, TOOL_NAMES.ask_questions) &&
        asksUserForInput(text)) {
        return {
            action: "retry",
            guard: "question_tool",
            event: {
                kind: "question_tool",
                status: "retrying",
                title: "Question tool enforced",
                message: "Prompted the agent to ask this with the question tool.",
                reason: "The agent asked for user input in plain text.",
            },
            retryInstruction: "Your previous response asked the user for input in plain text. Convert that request into an ask_questions tool call now. Do not answer in plain text.",
            toolChoice: {
                type: "tool",
                toolName: TOOL_NAMES.ask_questions,
            },
        };
    }
    if (shouldContinueFromLatestTool(responseMessage, hiddenPredicate)) {
        return { action: "accept" };
    }
    if (!isResearchLikeRequest(userText))
        return { action: "accept" };
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
                reason: "The answer did not show enough research tool use.",
            },
            retryInstruction: "Your previous response answered a research-like request without showing research. Reconsider whether you searched deeply enough. If more evidence would materially improve the answer, use search and page-reading tools before answering. You may call research_checkpoint for plain-text guidance when ready.",
            toolChoice: "required",
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
                reason: "The answer did not include a research checkpoint.",
            },
            retryInstruction: "Before finalizing this research answer, call research_checkpoint once for plain-text guidance. Use the guidance to decide whether further research would materially improve the answer; do not wait for an approval status.",
            toolChoice: {
                type: "tool",
                toolName: RESEARCH_CHECKPOINT_TOOL,
            },
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
            reason: `The agent tried to call ${violation.toolName} before required previous tool calls: ${missingTools.join(", ")}.`,
        },
        retryInstruction: `Your previous response tried to call ${violation.toolName} too early. ${violation.instruction}`,
        toolChoice: {
            type: "tool",
            toolName: nextTool,
        },
    };
}
function getCurrentTurnMessages(messages, responseMessage) {
    const latestUserIndex = messages.reduce((latest, message, index) => (message.role === "user" ? index : latest), -1);
    return [
        ...(latestUserIndex === -1 ? messages : messages.slice(latestUserIndex)),
        responseMessage,
    ];
}
function validateResearchCheckpoint(input) {
    const guidance = [];
    if (!input.readyToAnswer) {
        guidance.push("You marked the research as not ready to answer.");
    }
    if (input.searchesRun.length === 0) {
        guidance.push("Run at least one real search query before relying on the answer.");
    }
    if (input.sourcesOpened.length < 2) {
        guidance.push("Open and inspect more than one relevant source when the topic depends on external facts.");
    }
    if (input.claimsVerified.length < 2) {
        guidance.push("List the key claims you verified, especially dates, prices, numbers, and source-specific facts.");
    }
    if (input.unresolvedQuestions.length > 0) {
        guidance.push(`Resolve or explicitly disclose these open questions: ${input.unresolvedQuestions.join("; ")}.`);
    }
    if (input.confidence === "low") {
        guidance.push("Confidence is low; do more research or make the uncertainty prominent in the final answer.");
    }
    if (guidance.length === 0) {
        return "Research checkpoint guidance: You appear ready to answer. Synthesize the verified claims, cite the sources you opened, and state any residual uncertainty.";
    }
    return `Research checkpoint guidance:\n${guidance.map((item) => `- ${item}`).join("\n")}`;
}
function shouldContinueFromLatestTool(message, isHidden) {
    const hidden = isHidden ?? (() => false);
    const lastToolIndex = message.parts.reduce((latest, part, index) => (isToolUIPart(part) ? index : latest), -1);
    if (lastToolIndex === -1)
        return false;
    return !message.parts
        .slice(lastToolIndex + 1)
        .some((part) => part.type === "text" &&
        part.text.trim().length > 0 &&
        !hidden(part));
}
export async function reviewResearchCheckpoint(input, judge) {
    const fallbackGuidance = validateResearchCheckpoint(input);
    if (!judge)
        return fallbackGuidance;
    try {
        const guidance = researchCheckpointResultSchema.parse(await judge(input));
        return guidance.trim() || fallbackGuidance;
    }
    catch (error) {
        console.warn("[reviewResearchCheckpoint] Judge failed, falling back to local guidance:", error instanceof Error ? error.message : error);
        return fallbackGuidance;
    }
}
//# sourceMappingURL=agent-guards.js.map