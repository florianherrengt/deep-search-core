import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";
import type { ArtifactStore } from "../artifacts/artifact-store";
import {
  joinArtifactPaths,
  normalizeArtifactRelativePath,
} from "../artifacts/artifact-store";

const filePathSchema = z.string().min(1).describe("Path relative to the active files folder.");
const createOrUpdateFileSchema = z.object({
  path: filePathSchema,
  content: z.string(),
});
const readOrDeleteFileSchema = z.object({
  path: filePathSchema,
});
const moveFileSchema = z.object({
  from: filePathSchema,
  to: filePathSchema,
});
const listFilesSchema = z.object({
  path: z.string().optional().describe("Optional directory relative to the active files folder."),
});

export interface ScopedFileMutationEvent {
  operation: "created" | "updated" | "moved" | "deleted";
  path: string;
  previousPath?: string;
}

export interface CreateScopedFileToolsConfig {
  store: ArtifactStore;
  /**
   * Folder inside the store root that the tools can access.
   * Defaults to `files`.
   */
  workingDirectory?: string;
  /**
   * Set false for filename-only tools. Defaults to true.
   */
  allowSubdirectories?: boolean;
  onMutation?: (event: ScopedFileMutationEvent) => void | Promise<void>;
}

export function createScopedFileTools(
  config: CreateScopedFileToolsConfig,
): ToolSet {
  const workingDirectory = normalizeArtifactRelativePath(
    config.workingDirectory ?? "files",
    { allowEmpty: true },
  );
  const allowSubdirectories = config.allowSubdirectories ?? true;

  function scopedPath(inputPath: string, options: { allowEmpty?: boolean } = {}): string {
    const normalized = normalizeArtifactRelativePath(inputPath, options);
    if (!allowSubdirectories && normalized.includes("/")) {
      throw new Error(`Subdirectories are not allowed in file path: ${inputPath}`);
    }
    return joinArtifactPaths(workingDirectory, normalized);
  }

  async function emit(event: ScopedFileMutationEvent): Promise<void> {
    await config.onMutation?.(event);
  }

  return {
    create_file: tool({
      description:
        "Create a model-authored working file in the active files folder. Fails if the file already exists.",
      strict: true,
      inputSchema: zodSchema(createOrUpdateFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path, content }) => {
        const target = scopedPath(path);
        await config.store.writeText(target, content, { overwrite: false });
        await emit({ operation: "created", path: normalizeArtifactRelativePath(path) });
        return `Created ${normalizeArtifactRelativePath(path)}.`;
      },
    }),
    read_file: tool({
      description:
        "Read a model-authored working file from the active files folder. Use list_files first when you need to discover available files.",
      strict: true,
      inputSchema: zodSchema(readOrDeleteFileSchema),
      outputSchema: zodSchema(z.string()),
      execute: async ({ path }) => {
        const content = await config.store.readText(scopedPath(path));
        if (content === null) {
          throw new Error(`Cannot read ${normalizeArtifactRelativePath(path)}: file does not exist.`);
        }
        return content;
      },
    }),
    update_file: tool({
      description:
        "Replace the full content of a model-authored working file in the active files folder.",
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
      },
    }),
    move_file: tool({
      description:
        "Rename or move a model-authored working file within the active files folder.",
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
          previousPath: normalizeArtifactRelativePath(from),
        });
        return `Moved ${normalizeArtifactRelativePath(from)} to ${normalizeArtifactRelativePath(to)}.`;
      },
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
      },
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
          workingDirectory,
        );
        return entries.length > 0 ? entries.join("\n") : "No files found.";
      },
    }),
  };
}

async function listFilesRecursive(
  store: ArtifactStore,
  currentPath: string,
  rootPath: string,
  output: string[] = [],
): Promise<string[]> {
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

function stripRootPath(value: string, rootPath: string): string {
  const normalizedRoot = normalizeArtifactRelativePath(rootPath, { allowEmpty: true });
  if (!normalizedRoot) return value;
  return value.startsWith(`${normalizedRoot}/`)
    ? value.slice(normalizedRoot.length + 1)
    : value;
}
