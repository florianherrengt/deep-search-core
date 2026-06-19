import { type LanguageModel, type ToolSet } from "ai";
import type { SearchKeys, FetchFn, PageLoader } from "../types";
export interface CreateResearchToolsConfig {
    model: LanguageModel;
    fetchFn: FetchFn;
    searchKeys?: SearchKeys;
    pageLoader?: PageLoader;
}
export declare function createResearchTools(config: CreateResearchToolsConfig): Promise<ToolSet>;
//# sourceMappingURL=tool-registry.d.ts.map