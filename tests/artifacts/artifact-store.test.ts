import { describe, expect, it } from "vitest";
import {
  createArtifactStore,
  normalizeArtifactRelativePath,
  sanitizeArtifactPathSegment,
  type ArtifactStorage,
} from "../../src/research-orchestrator/index";

function createMemoryStorage(): ArtifactStorage {
  const files = new Map<string, string>();
  const directories = new Set<string>(["."]);

  return {
    async readText(path) {
      return files.get(path) ?? null;
    },
    async writeText(path, content) {
      files.set(path, content);
    },
    async list(path) {
      const prefix = path === "." ? "" : `${path}/`;
      const entries = new Map<string, "file" | "directory">();
      for (const directory of directories) {
        if (directory === path || !directory.startsWith(prefix)) continue;
        const rest = directory.slice(prefix.length);
        const [name] = rest.split("/");
        if (name) entries.set(name, "directory");
      }
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const [name, ...tail] = rest.split("/");
        if (!name) continue;
        entries.set(name, tail.length > 0 ? "directory" : "file");
      }
      return [...entries.entries()].map(([name, type]) => ({ name, type }));
    },
    async remove(path) {
      files.delete(path);
    },
    async rename(from, to) {
      const value = files.get(from);
      if (value === undefined) throw new Error(`Missing file: ${from}`);
      files.delete(from);
      files.set(to, value);
    },
    async ensureDirectory(path) {
      directories.add(path);
    },
    async exists(path) {
      return files.has(path) || directories.has(path);
    },
  };
}

describe("artifact store", () => {
  it("normalizes safe relative paths and rejects traversal", () => {
    expect(normalizeArtifactRelativePath("notes//source.md")).toBe("notes/source.md");
    expect(sanitizeArtifactPathSegment(" ../bad value ")).toBe("bad-value");
    expect(() => normalizeArtifactRelativePath("../secret")).toThrow(/traversal/);
    expect(() => normalizeArtifactRelativePath("/secret")).toThrow(/absolute/);
  });

  it("writes, lists, and renames files under the trusted root", async () => {
    const store = createArtifactStore({
      root: "search-results/run-1",
      storage: createMemoryStorage(),
    });

    await store.writeText("files/notes.md", "hello", { overwrite: false });
    await expect(store.writeText("files/notes.md", "again", { overwrite: false }))
      .rejects
      .toThrow(/already exists/);

    expect(await store.readText("files/notes.md")).toBe("hello");
    expect(await store.list("files")).toEqual([
      { path: "files/notes.md", type: "file" },
    ]);

    await store.rename("files/notes.md", "files/final.md");
    expect(await store.readText("files/final.md")).toBe("hello");
    expect(await store.readText("files/notes.md")).toBeNull();
  });
});
