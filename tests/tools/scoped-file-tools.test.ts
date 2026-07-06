import { describe, expect, it } from "vitest";
import {
  createArtifactStore,
  createScopedFileTools,
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

describe("createScopedFileTools", () => {
  it("scopes file CRUD to the configured working directory", async () => {
    const mutations: string[] = [];
    const store = createArtifactStore({
      root: "search-results/run-1",
      storage: createMemoryStorage(),
    });
    const tools = createScopedFileTools({
      store,
      onMutation: (event) => mutations.push(`${event.operation}:${event.path}`),
    });

    await tools.create_file.execute?.({ path: "notes/a.md", content: "draft" }, {} as never);
    expect(await tools.read_file.execute?.({ path: "notes/a.md" }, {} as never)).toBe("draft");
    await tools.update_file.execute?.({ path: "notes/a.md", content: "final" }, {} as never);
    await tools.move_file.execute?.({ from: "notes/a.md", to: "notes/b.md" }, {} as never);

    expect(await tools.list_files.execute?.({}, {} as never)).toBe("notes/b.md");
    expect(await store.readText("files/notes/b.md")).toBe("final");
    expect(mutations).toEqual([
      "created:notes/a.md",
      "updated:notes/a.md",
      "moved:notes/b.md",
    ]);
  });

  it("rejects path traversal before storage sees it", async () => {
    const store = createArtifactStore({
      root: "search-results/run-1",
      storage: createMemoryStorage(),
    });
    const tools = createScopedFileTools({ store });

    await expect(
      tools.create_file.execute?.({ path: "../escape.md", content: "bad" }, {} as never),
    ).rejects.toThrow(/traversal/);
  });

  it("rejects moves that would overwrite an existing file", async () => {
    const store = createArtifactStore({
      root: "search-results/run-1",
      storage: createMemoryStorage(),
    });
    const tools = createScopedFileTools({ store });

    await tools.create_file.execute?.({ path: "source.md", content: "source" }, {} as never);
    await tools.create_file.execute?.({ path: "target.md", content: "target" }, {} as never);

    await expect(
      tools.move_file.execute?.({ from: "source.md", to: "target.md" }, {} as never),
    ).rejects.toThrow(/destination already exists/);
  });
});
