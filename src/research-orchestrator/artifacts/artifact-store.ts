export type ArtifactEntryType = "file" | "directory";

export interface ArtifactStorageEntry {
  name: string;
  type: ArtifactEntryType;
}

export interface ArtifactListEntry {
  path: string;
  type: ArtifactEntryType;
}

export interface ArtifactStorage {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  list(path: string): Promise<ArtifactStorageEntry[]>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
  exists?(path: string): Promise<boolean>;
}

export interface ArtifactStore {
  root: string;
  resolve(relativePath?: string): string;
  exists(relativePath: string): Promise<boolean>;
  readText(relativePath: string): Promise<string | null>;
  writeText(
    relativePath: string,
    content: string,
    options?: { overwrite?: boolean },
  ): Promise<void>;
  writeJson(
    relativePath: string,
    content: unknown,
    options?: { overwrite?: boolean },
  ): Promise<void>;
  list(relativePath?: string): Promise<ArtifactListEntry[]>;
  remove(relativePath: string): Promise<void>;
  rename(
    from: string,
    to: string,
    options?: { overwrite?: boolean },
  ): Promise<void>;
  ensureDirectory(relativePath?: string): Promise<void>;
}

export interface CreateArtifactStoreConfig {
  /**
   * Trusted storage root. This may be an absolute filesystem path, a Tauri
   * app-storage subfolder, or any other path token understood by `storage`.
   */
  root: string;
  storage: ArtifactStorage;
}

export function createArtifactStore(
  config: CreateArtifactStoreConfig,
): ArtifactStore {
  const root = normalizeTrustedRoot(config.root);
  const { storage } = config;

  function resolve(relativePath = "."): string {
    const normalized = normalizeArtifactRelativePath(relativePath, {
      allowEmpty: true,
    });
    return joinArtifactPaths(root, normalized);
  }

  async function exists(relativePath: string): Promise<boolean> {
    const resolved = resolve(relativePath);
    if (storage.exists) return storage.exists(resolved);
    return (await storage.readText(resolved)) !== null;
  }

  return {
    root,
    resolve,
    exists,
    async readText(relativePath: string): Promise<string | null> {
      return storage.readText(resolve(relativePath));
    },
    async writeText(
      relativePath: string,
      content: string,
      options: { overwrite?: boolean } = {},
    ): Promise<void> {
      if (options.overwrite === false && await exists(relativePath)) {
        throw new Error(`Artifact already exists: ${normalizeArtifactRelativePath(relativePath)}`);
      }
      const target = resolve(relativePath);
      await storage.ensureDirectory(dirnameArtifactPath(target));
      await storage.writeText(target, content);
    },
    async writeJson(
      relativePath: string,
      content: unknown,
      options?: { overwrite?: boolean },
    ): Promise<void> {
      await this.writeText(
        relativePath,
        `${JSON.stringify(content, null, 2)}\n`,
        options,
      );
    },
    async list(relativePath = "."): Promise<ArtifactListEntry[]> {
      const normalized = normalizeArtifactRelativePath(relativePath, {
        allowEmpty: true,
      });
      const entries = await storage.list(resolve(normalized));
      return entries
        .filter((entry) => entry.type === "file" || entry.type === "directory")
        .map((entry) => ({
          path: joinArtifactPaths(normalized, sanitizeArtifactPathSegment(entry.name)),
          type: entry.type,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
    },
    async remove(relativePath: string): Promise<void> {
      await storage.remove(resolve(relativePath));
    },
    async rename(
      from: string,
      to: string,
      options: { overwrite?: boolean } = {},
    ): Promise<void> {
      if (options.overwrite !== true && await exists(to)) {
        throw new Error(`Artifact already exists: ${normalizeArtifactRelativePath(to)}`);
      }
      const target = resolve(to);
      await storage.ensureDirectory(dirnameArtifactPath(target));
      await storage.rename(resolve(from), target);
    },
    async ensureDirectory(relativePath = "."): Promise<void> {
      await storage.ensureDirectory(resolve(relativePath));
    },
  };
}

export function normalizeArtifactRelativePath(
  value: string,
  options: { allowEmpty?: boolean } = {},
): string {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === ".") {
    if (options.allowEmpty) return "";
    throw new Error("Artifact path must not be empty.");
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) {
    throw new Error(`Refusing absolute artifact path: ${value}`);
  }

  const parts: string[] = [];
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      throw new Error(`Refusing artifact path traversal: ${value}`);
    }
    parts.push(sanitizeArtifactPathSegment(segment));
  }

  if (parts.length === 0) {
    if (options.allowEmpty) return "";
    throw new Error("Artifact path must not be empty.");
  }

  return parts.join("/");
}

export function sanitizeArtifactPathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (!sanitized || sanitized === "." || sanitized === "..") return "artifact";
  return sanitized;
}

export function joinArtifactPaths(...parts: Array<string | undefined>): string {
  const cleaned = parts
    .map((part) => part?.trim().replace(/\\/g, "/") ?? "")
    .filter((part) => part.length > 0 && part !== ".")
    .map((part, index) => {
      if (index === 0) return part.replace(/\/+$/g, "");
      return part.replace(/^\/+|\/+$/g, "");
    })
    .filter((part) => part.length > 0);
  if (cleaned.length === 0) return ".";
  return cleaned.join("/");
}

function normalizeTrustedRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized || ".";
}

function dirnameArtifactPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}
