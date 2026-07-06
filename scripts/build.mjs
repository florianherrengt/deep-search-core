import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await rm(resolve(rootDir, "dist"), { recursive: true, force: true });

await execFileAsync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "-p",
    "tsconfig.build.json",
    "--emitDeclarationOnly",
  ],
  { cwd: rootDir, stdio: "inherit" },
);

await execFileAsync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  { cwd: rootDir, stdio: "inherit" },
);
