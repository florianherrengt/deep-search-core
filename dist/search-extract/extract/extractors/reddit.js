import { load } from "cheerio";
import { PageExtractor } from "./base.js";
import { parseRedditJson } from "./reddit-json-parser.js";
function isRedditUrl(url) {
    const host = url.hostname;
    return host === "reddit.com" || host.endsWith(".reddit.com");
}
function toOldRedditUrl(url) {
    const u = new URL(url);
    u.hostname = "old.reddit.com";
    return u.toString();
}
function normalizeText(text) {
    return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function parseScore(text, fallback = 0) {
    if (!text)
        return fallback;
    const score = Number.parseInt(text, 10);
    return Number.isFinite(score) ? score : fallback;
}
function directCommentElements($, el) {
    return $(el).children(".child").children(".sitetable").children(".thing.comment");
}
function findPostElement($) {
    return $(".thing.link, .thing.self, .thing[data-fullname^='t3_'], .thing[id^='thing_t3_']").first();
}
function findPostTitle($, postEl = findPostElement($)) {
    return normalizeText(postEl.find("p.title a.title, a.title").first().text() ||
        $("p.title a.title, a.title").first().text() ||
        $("meta[property='og:title']").attr("content") ||
        $("title").first().text().replace(/\s*:\s*.+$/, ""));
}
function hasOldRedditPostContent(html) {
    const $ = load(html);
    return findPostTitle($).length > 0 && $(".commentarea, .thing.comment").length > 0;
}
export function isRedditChallengeHtml(html) {
    if (hasOldRedditPostContent(html))
        return false;
    const $ = load(html);
    const bodyText = normalizeText($("body").text()).toLowerCase();
    const hasChallengeElement = $("#challenge-form").length > 0 ||
        $(".g-recaptcha, .h-captcha").length > 0 ||
        $("[class*='cf-challenge']").length > 0 ||
        $("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").length > 0;
    if (hasChallengeElement)
        return true;
    return [
        "captcha challenge",
        "captcha required",
        "verify you are human",
        "checking if the site connection is secure",
        "checking your browser",
        "are you a robot",
        "security check",
    ].some((marker) => bodyText.includes(marker));
}
export function parseOldRedditHtml(html) {
    const $ = load(html);
    const postEl = findPostElement($);
    const title = findPostTitle($, postEl);
    if (!title)
        return null;
    const author = postEl.attr("data-author") ||
        normalizeText(postEl.find(".tagline .author").first().text());
    const score = parseScore(postEl.attr("data-score") ||
        normalizeText(postEl.find(".score.unvoted").first().text()));
    const selftext = normalizeText(postEl.find(".expando .usertext-body, .entry .usertext-body, .usertext-body").first().text());
    function parseComment(el) {
        const commentEl = $(el);
        const entry = commentEl.children(".entry").first();
        const cAuthor = commentEl.attr("data-author") ||
            normalizeText(entry.find(".tagline .author").first().text());
        const cBody = normalizeText(entry.find(".usertext-body .md, .usertext-body").first().text());
        const cScore = parseScore(commentEl.attr("data-score") ||
            normalizeText(entry.find(".score.unvoted").first().text()));
        const replies = [];
        directCommentElements($, el).each((_, child) => {
            replies.push(parseComment(child));
        });
        return {
            author: cAuthor || "[deleted]",
            body: cBody || "[deleted]",
            score: cScore,
            created_utc: 0,
            replies,
        };
    }
    const directTopLevelComments = $(".commentarea > .sitetable > .thing.comment");
    const topLevelComments = directTopLevelComments.length > 0
        ? directTopLevelComments
        : $(".thing.comment").filter((_, el) => $(el).parents(".thing.comment").length === 0);
    const comments = [];
    topLevelComments.each((_, el) => {
        comments.push(parseComment(el));
    });
    const post = {
        title,
        selftext,
        author: author || "[unknown]",
        score,
        created_utc: 0,
        num_comments: comments.length,
    };
    return parseRedditJson(post, comments);
}
export class RedditExtractor extends PageExtractor {
    canHandle(url) {
        return isRedditUrl(url);
    }
    async extract(input) {
        if (input.url.pathname.endsWith(".json"))
            return null;
        if (!input.loader.renderHtml)
            return null;
        const html = await input.loader.renderHtml(toOldRedditUrl(input.url.href), {});
        if (!html)
            return null;
        const content = parseOldRedditHtml(html);
        if (!content)
            return null;
        return { content };
    }
}
//# sourceMappingURL=reddit.js.map