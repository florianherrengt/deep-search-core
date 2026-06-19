import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(path));
    else if (entry.name.endsWith(".js")) results.push(path);
  }
  return results;
}

function resolveImport(fromFile, importPath) {
  if (!importPath.startsWith(".")) return null;
  if (importPath.endsWith(".js")) return null;

  const baseDir = dirname(fromFile);
  const asFile = join(baseDir, `${importPath}.js`);
  const asIndex = join(baseDir, importPath, "index.js");

  if (existsSync(asFile)) return `${importPath}.js`;
  if (existsSync(asIndex)) return `${importPath}/index.js`;
  return null;
}

for (const file of walk(distDir)) {
  let content = readFileSync(file, "utf-8");
  let modified = false;

  content = content.replace(
    /from\s+"(\.\.?\/[^"]+?)"/g,
    (match, p) => {
      const resolved = resolveImport(file, p);
      if (resolved) {
        modified = true;
        return `from "${resolved}"`;
      }
      return match;
    },
  );

  if (modified) writeFileSync(file, content);
}
