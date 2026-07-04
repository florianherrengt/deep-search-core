import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
import { type YouTubeSubtitlesResult } from "../../youtube-subtitles.js";
export interface YouTubeSubtitleDownloadInput {
    url: string;
    videoId: string;
    reason: string;
    signal?: AbortSignal;
}
export type YouTubeSubtitleDownloader = (input: YouTubeSubtitleDownloadInput) => Promise<YouTubeSubtitlesResult>;
export interface YouTubeExtractorConfig {
    subtitleDownloader?: YouTubeSubtitleDownloader;
}
export declare function isYouTubeVideoUrl(url: URL): boolean;
export declare function formatYouTubeTranscript(subtitles: YouTubeSubtitlesResult, sourceUrl: string): string;
export declare class YouTubeExtractor extends PageExtractor {
    private readonly config;
    constructor(config?: YouTubeExtractorConfig);
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
    private extractWithSubtitleFallback;
}
//# sourceMappingURL=youtube.d.ts.map