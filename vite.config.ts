import { builtinModules, createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json") as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const rootDir = dirname(fileURLToPath(import.meta.url));
const externalPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
]);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

export default defineConfig({
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    minify: false,
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    lib: {
      entry: {
        index: resolve(rootDir, "src/index.ts"),
        "research-orchestrator/index": resolve(rootDir, "src/research-orchestrator/index.ts"),
        "search-extract/index": resolve(rootDir, "src/search-extract/index.ts"),
        "search-extract/core-api": resolve(rootDir, "src/search-extract/core-api.ts"),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) => {
        if (id.startsWith(".") || id.startsWith("/") || id.startsWith("\0")) {
          return false;
        }

        if (nodeBuiltins.has(id)) {
          return true;
        }

        const packageName = id.startsWith("@")
          ? id.split("/").slice(0, 2).join("/")
          : id.split("/")[0];

        return externalPackages.has(packageName);
      },
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
