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
    writeText(relativePath: string, content: string, options?: {
        overwrite?: boolean;
    }): Promise<void>;
    writeJson(relativePath: string, content: unknown, options?: {
        overwrite?: boolean;
    }): Promise<void>;
    list(relativePath?: string): Promise<ArtifactListEntry[]>;
    remove(relativePath: string): Promise<void>;
    rename(from: string, to: string, options?: {
        overwrite?: boolean;
    }): Promise<void>;
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
export declare function createArtifactStore(config: CreateArtifactStoreConfig): ArtifactStore;
export declare function normalizeArtifactRelativePath(value: string, options?: {
    allowEmpty?: boolean;
}): string;
export declare function sanitizeArtifactPathSegment(value: string): string;
export declare function joinArtifactPaths(...parts: Array<string | undefined>): string;
//# sourceMappingURL=artifact-store.d.ts.map