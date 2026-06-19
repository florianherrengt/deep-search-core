export interface RedditPost {
    title: string;
    selftext: string;
    author: string;
    score: number;
    created_utc: number;
    num_comments: number;
}
export interface RedditComment {
    author: string;
    body: string;
    score: number;
    created_utc: number;
    replies: RedditComment[];
}
export declare function parseRedditJson(post: RedditPost, comments: RedditComment[]): string;
//# sourceMappingURL=reddit-json-parser.d.ts.map