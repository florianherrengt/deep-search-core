import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rawTextPlugin = {
  name: "raw-text",
  setup(esbuild) {
    esbuild.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, "")),
      namespace: "raw-text",
    }));

    esbuild.onLoad({ filter: /.*/, namespace: "raw-text" }, async (args) => {
      const { readFile } = await import("node:fs/promises");
      const text = await readFile(args.path, "utf8");
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: "js",
      };
    });
  },
};

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

await build({
  entryPoints: [
    "src/index.ts",
    "src/research-orchestrator/index.ts",
    "src/search-extract/index.ts",
    "src/search-extract/core-api.ts",
  ].map((entry) => resolve(rootDir, entry)),
  outbase: resolve(rootDir, "src"),
  outdir: resolve(rootDir, "dist"),
  entryNames: "[dir]/[name]",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  packages: "external",
  plugins: [rawTextPlugin],
  logLevel: "info",
});
