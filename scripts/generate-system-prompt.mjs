import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const promptMarkdownPath = join(
  rootDir,
  "src/research-orchestrator/prompts/system-prompt.md",
);
const promptModulePath = join(
  rootDir,
  "src/research-orchestrator/prompts/system-prompt.ts",
);

const markdown = await readFile(promptMarkdownPath, "utf8");
const moduleSource = `// Generated from ./system-prompt.md. Do not edit by hand.
export const DEFAULT_SYSTEM_PROMPT = ${JSON.stringify(markdown)};
`;

await writeFile(promptModulePath, moduleSource);
