import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
export declare function isGithubRepoOverviewUrl(url: URL): boolean;
export declare function isGithubNotFoundHtml(html: string): boolean;
interface Counter {
    label: string;
    value: string;
}
interface LanguageEntry {
    name: string;
    percent: string;
}
interface ContributorInfo {
    count: string | null;
    topNames: string[];
}
interface CommitInfo {
    count: string | null;
    lastCommitDate: string | null;
}
interface RepoFlags {
    archived: boolean;
    fork: boolean;
    disabled: boolean;
}
export interface ParsedGithubRepo {
    fullName: string;
    description: string | null;
    counters: Counter[];
    topics: string[];
    homepage: string | null;
    license: string | null;
    languages: LanguageEntry[];
    contributors: ContributorInfo;
    commits: CommitInfo;
    flags: RepoFlags;
    readme: string | null;
}
export declare function parseGithubRepoHtml(html: string): ParsedGithubRepo | null;
export declare class GithubExtractor extends PageExtractor {
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
export {};
//# sourceMappingURL=github.d.ts.map