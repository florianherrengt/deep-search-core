import { isToolUIPart, } from "ai";
import { TOOL_NAMES } from "../tool-names.js";
export const TOOL_CALL_REQUIREMENTS = {
    [TOOL_NAMES.create_research_plan]: {
        requiredPreviousTools: [TOOL_NAMES.ask_questions],
        instruction: "Call ask_questions first to clarify the research scope, then retry create_research_plan.",
    },
    [TOOL_NAMES.extract_page_content]: {
        anyOfPreviousTools: [
            TOOL_NAMES.brave_search,
            TOOL_NAMES.exa_search,
            TOOL_NAMES.serper_search,
            TOOL_NAMES.tavily_search,
            TOOL_NAMES.searxng_search,
        ],
        instruction: "Run a web search first to find URLs to extract from, then retry extract_page_content.",
    },
};
export class ToolCallRequirementError extends Error {
    violation;
    constructor(violation) {
        super(formatToolCallRequirementViolation(violation));
        this.name = "ToolCallRequirementError";
        this.violation = violation;
    }
}
export function applyToolCallRequirementSafeguards(tools) {
    return Object.fromEntries(Object.entries(tools).map(([toolName, tool]) => {
        const execute = tool.execute;
        return [
            toolName,
            {
                ...tool,
                description: appendRequirementDescription(toolName, tool.description),
                ...(execute
                    ? {
                        execute: ((input, options) => {
                            const violation = evaluateToolCallRequirementForModelMessages(toolName, options.messages);
                            if (violation) {
                                throw new ToolCallRequirementError(violation);
                            }
                            return execute.call(tool, input, options);
                        }),
                    }
                    : {}),
            },
        ];
    }));
}
export function getActiveToolNamesForMessages(tools, messages) {
    return Object.keys(tools).filter((toolName) => !evaluateToolCallRequirementForUIMessages(toolName, messages));
}
export function evaluateToolCallRequirementForResponse({ messages, responseMessage, }) {
    for (const toolName of getToolCallNamesFromUIMessage(responseMessage)) {
        const violation = evaluateToolCallRequirementForUIMessages(toolName, messages);
        if (violation)
            return violation;
    }
    return null;
}
export function evaluateToolCallRequirementForUIMessages(toolName, messages) {
    const requirement = getToolCallRequirement(toolName);
    if (!requirement)
        return null;
    return evaluateToolCallRequirement(toolName, requirement, getToolCallNamesFromUIMessages(messages));
}
export function evaluateToolCallRequirementForModelMessages(toolName, messages) {
    const requirement = getToolCallRequirement(toolName);
    if (!requirement)
        return null;
    return evaluateToolCallRequirement(toolName, requirement, getToolCallNamesFromModelMessages(messages));
}
export function getToolCallNamesFromUIMessages(messages) {
    return messages.flatMap(getToolCallNamesFromUIMessage);
}
export function getToolCallNamesFromModelMessages(messages) {
    return messages.flatMap((message) => {
        if (message.role !== "assistant" || !Array.isArray(message.content)) {
            return [];
        }
        return message.content.flatMap((part) => part.type === "tool-call" ? [part.toolName] : []);
    });
}
export function formatToolCallRequirementViolation(violation) {
    const parts = [`${violation.toolName} cannot run yet.`];
    if (violation.missingPreviousTools && violation.missingPreviousTools.length > 0) {
        parts.push(`Missing required previous tool call${violation.missingPreviousTools.length === 1 ? "" : "s"}: ${formatToolNames(violation.missingPreviousTools)}.`);
    }
    if (violation.missingAnyOfTools && violation.missingAnyOfTools.length > 0) {
        parts.push(`At least one of these tools must be called first: ${formatToolNames(violation.missingAnyOfTools)}.`);
    }
    parts.push(violation.instruction);
    return parts.join(" ");
}
function evaluateToolCallRequirement(toolName, requirement, previousToolNames) {
    const previous = new Set(previousToolNames);
    const missingPreviousTools = requirement.requiredPreviousTools?.filter((requiredTool) => !previous.has(requiredTool)) ?? [];
    const anyOfSatisfied = !requirement.anyOfPreviousTools ||
        requirement.anyOfPreviousTools.some((tool) => previous.has(tool));
    if (missingPreviousTools.length === 0 && anyOfSatisfied)
        return null;
    return {
        toolName,
        requiredPreviousTools: requirement.requiredPreviousTools,
        missingPreviousTools: missingPreviousTools.length > 0 ? missingPreviousTools : undefined,
        anyOfPreviousTools: requirement.anyOfPreviousTools,
        missingAnyOfTools: !anyOfSatisfied ? requirement.anyOfPreviousTools : undefined,
        instruction: requirement.instruction,
    };
}
function getToolCallRequirement(toolName) {
    return TOOL_CALL_REQUIREMENTS[toolName];
}
function appendRequirementDescription(toolName, description) {
    const requirement = getToolCallRequirement(toolName);
    if (!requirement)
        return description;
    const prereqParts = [];
    if (requirement.requiredPreviousTools && requirement.requiredPreviousTools.length > 0) {
        prereqParts.push(`call ${formatToolNames(requirement.requiredPreviousTools)}`);
    }
    if (requirement.anyOfPreviousTools && requirement.anyOfPreviousTools.length > 0) {
        prereqParts.push(`call at least one of ${formatToolNames(requirement.anyOfPreviousTools)}`);
    }
    return `${description ?? toolName}\n\nPrerequisite: before calling this tool, ${prereqParts.join(" and ")} first.`;
}
function getToolCallNamesFromUIMessage(message) {
    return message.parts.flatMap((part) => isToolUIPart(part) ? [part.type.slice("tool-".length)] : []);
}
function formatToolNames(toolNames) {
    return toolNames.map((toolName) => `\`${toolName}\``).join(", ");
}
//# sourceMappingURL=tool-call-requirements.js.map