import { PageExtractor, type ExtractorInput, type ExtractorResult } from "./base.js";
export interface TrustpilotReview {
    title: string | null;
    body: string | null;
    rating: string | null;
    author: string | null;
    authorDetails: string | null;
    date: string | null;
    experienceDate: string | null;
    status: string | null;
    reply: TrustpilotReply | null;
}
export interface TrustpilotReply {
    company: string | null;
    date: string | null;
    body: string;
}
export interface TrustpilotRatingDistributionEntry {
    stars: string;
    percent: string;
}
export interface ParsedTrustpilotPage {
    companyName: string;
    domain: string | null;
    profileStatus: string | null;
    trustScore: string | null;
    starRating: string | null;
    ratingLabel: string | null;
    reviewCount: string | null;
    categories: string[];
    companyDescription: string | null;
    contactInfo: string[];
    ratingDistribution: TrustpilotRatingDistributionEntry[];
    reviews: TrustpilotReview[];
}
export declare function isTrustpilotUrl(url: URL): boolean;
export declare function isTrustpilotReviewPageUrl(url: URL): boolean;
export declare function isTrustpilotChallengeHtml(html: string): boolean;
export declare function parseTrustpilotCompanyHtml(html: string, sourceUrl?: URL): ParsedTrustpilotPage | null;
export declare class TrustpilotExtractor extends PageExtractor {
    canHandle(url: URL): boolean;
    extract(input: ExtractorInput): Promise<ExtractorResult | null>;
}
//# sourceMappingURL=trustpilot.d.ts.map