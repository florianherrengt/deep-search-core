const MAX_BODY_LENGTH = 500;
function truncate(text) {
    if (text.length <= MAX_BODY_LENGTH)
        return text;
    return text.slice(0, MAX_BODY_LENGTH) + " [...]";
}
function scoreStr(n) {
    return n === 1 ? "1 pt" : `${n} pts`;
}
function renderCommentTree(comments, prefix) {
    const last = comments.length - 1;
    return comments
        .flatMap((comment, index) => {
        const isLast = index === last;
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";
        const body = truncate(comment.body.replace(/\n/g, " "));
        const lines = [
            `${prefix}${connector}**${comment.author}** · ${scoreStr(comment.score)}: ${body}`,
        ];
        if (comment.replies.length > 0) {
            lines.push(renderCommentTree(comment.replies, prefix + childPrefix));
        }
        return lines;
    })
        .join("\n");
}
export function parseRedditJson(post, comments) {
    const parts = [];
    parts.push(`# ${post.title}`);
    parts.push("");
    const commentCount = post.num_comments === 1 ? "1 comment" : `${post.num_comments} comments`;
    parts.push(`> **${post.author}** · ${scoreStr(post.score)} · ${commentCount}`);
    parts.push("");
    if (post.selftext.trim()) {
        parts.push(post.selftext.trim());
        parts.push("");
    }
    if (comments.length > 0) {
        parts.push("## Comments");
        parts.push("");
        parts.push(renderCommentTree(comments, ""));
    }
    return parts.join("\n").trim();
}
//# sourceMappingURL=reddit-json-parser.js.map