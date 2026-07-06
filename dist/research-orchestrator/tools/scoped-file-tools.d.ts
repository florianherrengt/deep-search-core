import { type ToolSet } from "ai";
import type { ArtifactStore } from "../artifacts/artifact-store";
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
export declare function createScopedFileTools(config: CreateScopedFileToolsConfig): ToolSet;
//# sourceMappingURL=scoped-file-tools.d.ts.map