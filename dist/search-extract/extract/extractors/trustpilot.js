import { load } from "cheerio";
import { PageExtractor } from "./base.js";
const REVIEW_CARD_SELECTORS = [
    "article[data-service-review-card-paper]",
    "section[data-service-review-card-paper]",
    "div[data-service-review-card-paper]",
    "article[data-review-id]",
    "section[data-review-id]",
    "div[data-review-id]",
    "[data-testid='review-card']",
    "article[class*='reviewCard']",
    "section[class*='reviewCard']",
    "div[class*='reviewCard']",
];
const COMPANY_NAME_SUFFIX = /\s+Reviews?(?:\s+[\d,]+)?$/i;
function isTrustpilotHost(hostname) {
    return hostname === "trustpilot.com" || hostname.endsWith(".trustpilot.com");
}
export function isTrustpilotUrl(url) {
    return isTrustpilotHost(url.hostname);
}
export function isTrustpilotReviewPageUrl(url) {
    if (!isTrustpilotUrl(url))
        return false;
    const segments = url.pathname.split("/").filter(Boolean);
    // Trustpilot exposes the company review page at both /review/<company>
    // (canonical) and /reviews/<company>, and individual reviews at
    // /reviews/<id>. Accept both the singular and plural first segments.
    return segments.length >= 2 && (segments[0] === "review" || segments[0] === "reviews");
}
function normalizeText(text) {
    return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeMarkdown(text) {
    return text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\s+|\s+$/g, "");
}
function firstNonEmpty(...values) {
    for (const value of values) {
        if (value && value.trim())
            return normalizeText(value);
    }
    return null;
}
function unique(values) {
    return [...new Set(values.map(normalizeText).filter(Boolean))];
}
function metaContent($, names) {
    for (const name of names) {
        const attr = name.startsWith("og:") ? "property" : "name";
        const value = $(`meta[${attr}="${name}"]`).attr("content");
        if (value && value.trim())
            return normalizeText(value);
    }
    return null;
}
function domainFromUrl(url) {
    if (!url)
        return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] !== "review" || !segments[1])
        return null;
    try {
        return decodeURIComponent(segments[1]);
    }
    catch {
        return segments[1];
    }
}
function cleanCompanyName(value) {
    if (!value)
        return null;
    return normalizeText(value)
        .replace(/\s+\|\s+Read Customer Service Reviews.*$/i, "")
        .replace(COMPANY_NAME_SUFFIX, "")
        .trim() || null;
}
function extractCompanyName($, url) {
    const ogTitle = cleanCompanyName(metaContent($, ["og:title", "twitter:title"]));
    if (ogTitle)
        return ogTitle;
    const h1 = cleanCompanyName($("h1").first().text());
    if (h1)
        return h1;
    return domainFromUrl(url);
}
function extractProfileStatus($) {
    // `normalizeText` collapses the whole body to a single line, so the capture
    // must be explicitly bounded: a greedy `[^.|\n]+` would run past the status
    // into the adjacent trust score (e.g. swallow "...September 2025 4" up to the
    // period in "4.3"). We only keep an optional "• <month name> <year>" suffix
    // and stop before any trailing numeric content.
    const bodyText = normalizeText($("body").text());
    const claimed = bodyText.match(/Claimed profile(?:\s*[\u2022\u2013-]\s*[A-Za-z][A-Za-z\s]*?\d{4})?(?=\s+(?:[0-5]\.\d|\d+\s+reviews?|TrustScore|Based\s+on)|$)/i)?.[0];
    if (claimed)
        return normalizeText(claimed);
    if (/Unclaimed profile/i.test(bodyText))
        return "Unclaimed profile";
    return null;
}
function extractTrustScore($, jsonLd) {
    const selectorValue = firstNonEmpty($("[data-rating-typography]").first().text(), $("[data-testid='trustscore']").first().text(), $("[data-testid='trust-score']").first().text(), $("[class*='trustScore'] [class*='typography']").first().text());
    const selectorScore = selectorValue?.match(/\b([0-5](?:\.\d+)?)\b/)?.[1];
    if (selectorScore)
        return selectorScore;
    const ldScore = jsonLd.trustScore?.match(/\b([0-5](?:\.\d+)?)\b/)?.[1];
    if (ldScore)
        return ldScore;
    const bodyText = normalizeText($("body").text());
    return bodyText.match(/\bTrustScore\s+([0-5](?:\.\d+)?)\b/i)?.[1] ?? null;
}
function extractStarRating($, jsonLd) {
    const imgAlt = $("img[alt*='TrustScore' i], img[alt*='out of 5' i]")
        .toArray()
        .map((el) => normalizeText($(el).attr("alt") || ""))
        .find((text) => /TrustScore|out of 5/i.test(text));
    if (imgAlt) {
        const match = imgAlt.match(/([0-5](?:\.\d+)?)\s+out of\s+5/i);
        if (match)
            return `${match[1]} out of 5`;
    }
    if (jsonLd.starRating)
        return jsonLd.starRating;
    return null;
}
function extractRatingLabel($) {
    const candidates = $("[data-rating-label], [data-testid='trustscore-label'], [class*='trustScore'] p, [class*='trustScore'] span")
        .toArray()
        .map((el) => normalizeText($(el).text()))
        .filter((text) => /^(Excellent|Great|Average|Poor|Bad)$/i.test(text));
    if (candidates.length > 0)
        return candidates[0];
    const lines = normalizeText($("body").text()).split(/\s*\n\s*|\s{2,}/);
    return lines.find((line) => /^(Excellent|Great|Average|Poor|Bad)$/i.test(line)) ?? null;
}
function extractReviewCount($, jsonLd) {
    // Trustpilot renders large counts in abbreviated form ("12K reviews",
    // "3.4M reviews") in addition to full comma-separated form ("12,345").
    // Match either so popular companies' review counts are not dropped.
    const COUNT = String.raw `[\d,]+(?:\.\d+)?\s?[kKmM]?`;
    const selectors = [
        "[data-business-unit-review-count]",
        "[data-testid='review-count']",
        "[data-testid='reviews-count']",
        "[class*='reviewCount']",
    ];
    for (const selector of selectors) {
        const text = normalizeText($(selector).first().text());
        const match = text.match(new RegExp(`(${COUNT})\\s+reviews?`, "i"));
        if (match)
            return `${normalizeText(match[1])} reviews`;
    }
    const h1Match = normalizeText($("h1").first().text()).match(new RegExp(`Reviews?\\s+(${COUNT})`, "i"));
    if (h1Match)
        return `${normalizeText(h1Match[1])} reviews`;
    if (jsonLd.reviewCount)
        return `${jsonLd.reviewCount} reviews`;
    const metaDescription = metaContent($, ["og:description", "description"]);
    const metaMatch = metaDescription?.match(new RegExp(`what\\s+(${COUNT})\\s+people`, "i"));
    if (metaMatch)
        return `${normalizeText(metaMatch[1])} reviews`;
    const bodyMatch = normalizeText($("body").text()).match(new RegExp(`\\b(${COUNT})\\s+reviews?\\b`, "i"));
    return bodyMatch ? `${normalizeText(bodyMatch[1])} reviews` : null;
}
function extractCategories($) {
    const breadcrumbCategories = $("nav a, [aria-label*='breadcrumb' i] a")
        .toArray()
        .map((el) => normalizeText($(el).text()))
        .filter((text) => text && !/^(categories|blog|log in|for businesses)$/i.test(text));
    if (breadcrumbCategories.length > 0)
        return unique(breadcrumbCategories);
    const categoryLinks = $("a[href^='/categories/'], a[href*='/categories/']")
        .toArray()
        .map((el) => normalizeText($(el).text()));
    return unique(categoryLinks);
}
function textAfterHeading($, headingPattern) {
    const heading = $("h2, h3")
        .filter((_, el) => headingPattern.test(normalizeText($(el).text())))
        .first();
    if (!heading.length)
        return null;
    const container = heading.closest("section, aside, div");
    const text = normalizeText(container.text());
    return text.replace(headingPattern, "").replace(/\bSee more\b.*$/i, "").trim() || null;
}
function extractCompanyDescription($, jsonLd) {
    const explicit = firstNonEmpty($("[data-testid='business-description']").first().text(), $("[data-business-unit-description]").first().text(), textAfterHeading($, /Written by the company/i));
    if (explicit)
        return explicit;
    return jsonLd.description;
}
function extractContactInfo($) {
    const heading = $("h2, h3")
        .filter((_, el) => /Contact info/i.test(normalizeText($(el).text())))
        .first();
    if (!heading.length)
        return [];
    const container = heading.closest("section, aside, div");
    const items = container.find("li, a[href^='mailto:'], a[href^='http']")
        .toArray()
        .map((el) => normalizeText($(el).text() || $(el).attr("href") || ""))
        .filter((text) => text && !/Contact info/i.test(text));
    return unique(items).slice(0, 8);
}
function extractRatingDistribution($) {
    const entries = [];
    $("[data-testid*='rating-filter'], [class*='ratingFilter'], [class*='filter'] li").each((_, el) => {
        const text = normalizeText($(el).text());
        const match = text.match(/\b([1-5])-star\b.*?(\d+%)/i);
        if (match)
            entries.push({ stars: `${match[1]}-star`, percent: match[2] });
    });
    if (entries.length > 0)
        return dedupeRatingDistribution(entries);
    const bodyText = normalizeText($("body").text());
    const matches = [...bodyText.matchAll(/\b([1-5])-star\s+(\d+%)/gi)];
    return dedupeRatingDistribution(matches.map((match) => ({ stars: `${match[1]}-star`, percent: match[2] })));
}
function dedupeRatingDistribution(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
        const key = entry.stars;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function extractRatingFromCard($, card) {
    const explicit = firstNonEmpty(card.attr("data-service-review-rating"), card.find("[data-service-review-rating]").first().attr("data-service-review-rating"), card.find("[data-rating]").first().attr("data-rating"));
    if (explicit) {
        const match = explicit.match(/\b([1-5](?:\.\d+)?)\b/);
        if (match)
            return `${match[1]} out of 5`;
    }
    const alt = card
        .find("img[alt*='Rated' i], img[alt*='out of 5' i]")
        .toArray()
        .map((el) => normalizeText($(el).attr("alt") || ""))
        .find(Boolean);
    if (!alt)
        return null;
    const match = alt.match(/Rated\s+([1-5](?:\.\d+)?)\s+out of\s+5/i) ??
        alt.match(/([1-5](?:\.\d+)?)\s+out of\s+5/i);
    return match ? `${match[1]} out of 5` : alt;
}
function extractAuthor($, card) {
    const authorEl = card
        .find("[data-consumer-name-typography], [data-consumer-name], a[href*='/users/']")
        .first();
    const author = normalizeText(authorEl.text());
    const authorContainer = authorEl.closest("aside, div, section");
    const authorText = normalizeText(authorContainer.text());
    const details = author && authorText.startsWith(author)
        ? normalizeText(authorText.slice(author.length))
        : null;
    return {
        author: author || null,
        authorDetails: details || null,
    };
}
function extractDate($, card) {
    const explicitDate = firstNonEmpty(card.find("time[datetime]").first().text(), card.find("time[datetime]").first().attr("datetime"), card.find("[data-service-review-date-time-ago]").first().text());
    const experienceText = firstNonEmpty(card.find("[data-service-review-date-of-experience-typography]").first().text(), card.find("[data-testid='review-date-of-experience']").first().text());
    const experienceDate = experienceText?.replace(/^Date of experience:\s*/i, "").trim() || null;
    return {
        date: explicitDate,
        experienceDate,
    };
}
function extractStatus(card) {
    const text = normalizeText(card.text());
    const status = text.match(/\b(Verified|Invited|Redirected|Unprompted review)\b/i)?.[1];
    return status ?? null;
}
function extractReply($, card) {
    const replyEl = card
        .find("[data-service-review-business-reply], [data-company-reply], section[class*='reply'], div[class*='reply']")
        .filter((_, el) => /Reply from/i.test(normalizeText($(el).text())))
        .first();
    if (!replyEl.length)
        return null;
    const text = normalizeText(replyEl.text());
    const company = text.match(/Reply from\s+(.+?)(?:\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|$)/i)?.[1] ?? null;
    const date = firstNonEmpty(replyEl.find("time").first().text(), replyEl.find("time").first().attr("datetime"), text.match(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/)?.[0]);
    const textParts = replyEl
        .find("p, [data-service-review-business-reply-text-typography], [data-company-reply-text]")
        .toArray()
        .map((el) => normalizeText($(el).text()))
        .filter(Boolean)
        .filter((part) => !/^Reply from\b/i.test(part))
        .filter((part) => !date || part !== date)
        .filter((part) => !company || part !== company);
    const body = firstNonEmpty(...textParts, text
        .replace(/Reply from\s+.+?(?=\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b|$)/i, "")
        .replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/, "")
        .trim());
    if (!body)
        return null;
    return {
        company: company ? normalizeText(company) : null,
        date,
        body,
    };
}
function extractReviewCards($) {
    const selector = REVIEW_CARD_SELECTORS.join(", ");
    const seen = new Set();
    const cards = [];
    $(selector).each((_, el) => {
        if (el.type !== "tag")
            return;
        const element = el;
        if (seen.has(element))
            return;
        seen.add(element);
        const card = $(element);
        const text = normalizeText(card.text());
        if (!text || !/(Rated\s+[1-5]|out of 5|Date of experience|Verified|Unprompted review)/i.test(text)) {
            return;
        }
        cards.push(card);
    });
    return cards;
}
function parseReviewCard($, card) {
    const title = firstNonEmpty(card.find("[data-service-review-title-typography]").first().text(), card.find("[data-testid='review-title']").first().text(), card.find("h2, h3").first().text(), card.find("a[href*='/reviews/']").first().text());
    const body = firstNonEmpty(card.find("[data-service-review-text-typography]").first().text(), card.find("[data-testid='review-text']").first().text(), card.find("p[data-service-review-text], p").filter((_, el) => {
        const text = normalizeText($(el).text());
        return text.length > 20 && !/^Date of experience:/i.test(text);
    }).first().text());
    const rating = extractRatingFromCard($, card);
    const { author, authorDetails } = extractAuthor($, card);
    const { date, experienceDate } = extractDate($, card);
    const status = extractStatus(card);
    const reply = extractReply($, card);
    if (!title && !body && !rating)
        return null;
    return {
        title,
        body,
        rating,
        author,
        authorDetails,
        date,
        experienceDate,
        status,
        reply,
    };
}
function parseHtmlReviews($) {
    const reviews = [];
    for (const card of extractReviewCards($)) {
        const parsed = parseReviewCard($, card);
        if (parsed)
            reviews.push(parsed);
    }
    return dedupeReviews(reviews);
}
function dedupeReviews(reviews) {
    const seen = new Set();
    return reviews.filter((review) => {
        const key = [review.author, review.title, review.body, review.date].join("|");
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asString(value) {
    if (typeof value === "string" && value.trim())
        return normalizeText(value);
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return null;
}
function asArray(value) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
}
function parseJsonScript(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function extractJsonLdNodes(value) {
    if (Array.isArray(value))
        return value.flatMap(extractJsonLdNodes);
    if (!isRecord(value))
        return [];
    const graph = value["@graph"];
    const nested = graph ? extractJsonLdNodes(graph) : [];
    return [value, ...nested];
}
function parseRatingValue(value) {
    if (isRecord(value)) {
        return asString(value.ratingValue ?? value.value ?? value.score);
    }
    return asString(value);
}
function parseReviewFromJson(value) {
    if (!isRecord(value))
        return null;
    const rating = parseRatingValue(value.reviewRating ?? value.rating);
    const authorValue = value.author;
    const author = isRecord(authorValue)
        ? asString(authorValue.name)
        : asString(authorValue);
    const body = firstNonEmpty(asString(value.reviewBody), asString(value.text), asString(value.description));
    const title = firstNonEmpty(asString(value.name), asString(value.headline), asString(value.title));
    if (!title && !body && !rating)
        return null;
    return {
        title,
        body,
        rating: rating ? `${rating} out of 5` : null,
        author,
        authorDetails: null,
        date: asString(value.datePublished ?? value.publishedDate ?? value.createdAt),
        experienceDate: asString(value.dateCreated ?? value.experiencedDate),
        status: null,
        reply: null,
    };
}
function parseJsonLd($) {
    const parsed = {
        companyName: null,
        domain: null,
        description: null,
        trustScore: null,
        starRating: null,
        reviewCount: null,
        reviews: [],
    };
    const nodes = $("script[type='application/ld+json']")
        .toArray()
        .flatMap((el) => {
        const json = parseJsonScript($(el).text());
        return extractJsonLdNodes(json);
    });
    for (const node of nodes) {
        const aggregateRating = node.aggregateRating;
        const reviewValues = asArray(node.review);
        const hasReviewSubjectData = Boolean(aggregateRating) || reviewValues.length > 0;
        if (aggregateRating && isRecord(aggregateRating)) {
            const ratingValue = asString(aggregateRating.ratingValue);
            parsed.trustScore ??= ratingValue;
            parsed.reviewCount ??= asString(aggregateRating.reviewCount ?? aggregateRating.ratingCount);
            const bestRating = asString(aggregateRating.bestRating);
            const starRating = ratingValue && bestRating
                ? `${ratingValue} out of ${bestRating}`
                : null;
            parsed.starRating ??= starRating;
        }
        if (hasReviewSubjectData) {
            parsed.companyName ??= cleanCompanyName(asString(node.name));
            parsed.description ??= asString(node.description);
            parsed.domain ??= asString(node.url);
        }
        for (const reviewValue of reviewValues) {
            const review = parseReviewFromJson(reviewValue);
            if (review)
                parsed.reviews.push(review);
        }
    }
    parsed.reviews = dedupeReviews(parsed.reviews);
    return parsed;
}
function parseNextData($) {
    const json = parseJsonScript($("#__NEXT_DATA__").first().text());
    if (!json)
        return {};
    const objects = collectObjects(json, 5000);
    const business = objects.find((obj) => {
        const hasName = typeof obj.displayName === "string" || typeof obj.name === "string";
        const hasTrustpilotFields = "trustScore" in obj ||
            "numberOfReviews" in obj ||
            "identifyingName" in obj ||
            "stars" in obj;
        return hasName && hasTrustpilotFields;
    });
    const reviewArrays = collectArrays(json, 300)
        .filter((arr) => arr.some((value) => parseNextReview(value) !== null))
        .sort((a, b) => b.length - a.length);
    const reviews = reviewArrays[0]
        ? dedupeReviews(reviewArrays[0].map(parseNextReview).filter((r) => r !== null))
        : [];
    return {
        companyName: firstNonEmpty(asString(business?.displayName), asString(business?.name)) ?? undefined,
        domain: firstNonEmpty(asString(business?.identifyingName), asString(business?.websiteUrl), asString(business?.website)) ?? undefined,
        trustScore: parseBusinessScore(business),
        starRating: parseBusinessStars(business),
        reviewCount: parseBusinessReviewCount(business),
        reviews,
    };
}
function collectObjects(value, limit) {
    const result = [];
    const stack = [value];
    while (stack.length && result.length < limit) {
        const current = stack.pop();
        if (Array.isArray(current)) {
            stack.push(...current);
        }
        else if (isRecord(current)) {
            result.push(current);
            stack.push(...Object.values(current));
        }
    }
    return result;
}
function collectArrays(value, limit) {
    const result = [];
    const stack = [value];
    while (stack.length && result.length < limit) {
        const current = stack.pop();
        if (Array.isArray(current)) {
            result.push(current);
            stack.push(...current);
        }
        else if (isRecord(current)) {
            stack.push(...Object.values(current));
        }
    }
    return result;
}
function parseBusinessScore(business) {
    if (!business)
        return undefined;
    const trustScore = business.trustScore;
    if (isRecord(trustScore)) {
        return asString(trustScore.score ?? trustScore.value) ?? undefined;
    }
    return asString(trustScore ?? business.score) ?? undefined;
}
function parseBusinessStars(business) {
    if (!business)
        return undefined;
    const stars = asString(business.stars ?? business.starRating);
    return stars ? `${stars} out of 5` : undefined;
}
function parseBusinessReviewCount(business) {
    if (!business)
        return undefined;
    const count = asString(business.numberOfReviews ?? business.reviewCount);
    return count ? `${count} reviews` : undefined;
}
function parseNextReview(value) {
    if (!isRecord(value))
        return null;
    const hasReviewShape = "rating" in value &&
        ("title" in value || "text" in value || "consumer" in value || "dates" in value);
    if (!hasReviewShape)
        return null;
    const consumer = isRecord(value.consumer) ? value.consumer : undefined;
    const dates = isRecord(value.dates) ? value.dates : undefined;
    const labels = isRecord(value.labels) ? value.labels : undefined;
    const replyValue = isRecord(value.reply)
        ? value.reply
        : isRecord(value.businessReply)
            ? value.businessReply
            : undefined;
    const rating = asString(value.rating);
    return {
        title: asString(value.title),
        body: firstNonEmpty(asString(value.text), asString(value.body)),
        rating: rating ? `${rating} out of 5` : null,
        author: firstNonEmpty(asString(consumer?.displayName), asString(consumer?.name)),
        authorDetails: null,
        date: asString(dates?.publishedDate ?? value.publishedDate),
        experienceDate: asString(dates?.experiencedDate ?? value.experiencedDate),
        status: parseNextStatus(value, labels),
        reply: parseNextReply(replyValue),
    };
}
function parseNextStatus(review, labels) {
    if (review.isVerified === true)
        return "Verified";
    const verification = labels?.verification;
    if (isRecord(verification) && verification.isVerified === true)
        return "Verified";
    return asString(review.source) ?? asString(review.reviewSource);
}
function parseNextReply(reply) {
    if (!reply)
        return null;
    const body = firstNonEmpty(asString(reply.message), asString(reply.text), asString(reply.body));
    if (!body)
        return null;
    return {
        company: asString(reply.companyName),
        date: asString(reply.publishedDate ?? reply.createdAt),
        body,
    };
}
export function isTrustpilotChallengeHtml(html) {
    const $ = load(html);
    const hasReviewContent = $("h1").text().includes("Reviews") ||
        extractReviewCards($).length > 0 ||
        $("script[type='application/ld+json']").length > 0;
    if (hasReviewContent)
        return false;
    const bodyText = normalizeText($("body").text()).toLowerCase();
    const hasChallengeElement = $("#challenge-form").length > 0 ||
        $(".g-recaptcha, .h-captcha").length > 0 ||
        $("[class*='cf-challenge']").length > 0 ||
        $("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").length > 0;
    if (hasChallengeElement)
        return true;
    return [
        "verify you are human",
        "checking if the site connection is secure",
        "checking your browser",
        "security check",
        "are you a robot",
    ].some((marker) => bodyText.includes(marker));
}
export function parseTrustpilotCompanyHtml(html, sourceUrl) {
    const $ = load(html);
    if (isTrustpilotChallengeHtml(html))
        return null;
    const jsonLd = parseJsonLd($);
    const nextData = parseNextData($);
    const companyName = firstNonEmpty(nextData.companyName, jsonLd.companyName, extractCompanyName($, null), domainFromUrl(sourceUrl ?? null));
    if (!companyName)
        return null;
    const parsed = {
        companyName,
        domain: firstNonEmpty(nextData.domain, domainFromUrl(sourceUrl ?? null), jsonLd.domain),
        profileStatus: extractProfileStatus($),
        trustScore: firstNonEmpty(nextData.trustScore, extractTrustScore($, jsonLd)),
        starRating: firstNonEmpty(nextData.starRating, extractStarRating($, jsonLd)),
        ratingLabel: extractRatingLabel($),
        reviewCount: firstNonEmpty(nextData.reviewCount, extractReviewCount($, jsonLd)),
        categories: extractCategories($),
        companyDescription: extractCompanyDescription($, jsonLd),
        contactInfo: extractContactInfo($),
        ratingDistribution: extractRatingDistribution($),
        reviews: dedupeReviews([
            ...(nextData.reviews ?? []),
            ...parseHtmlReviews($),
            ...jsonLd.reviews,
        ]),
    };
    const hasUsefulContent = parsed.trustScore ||
        parsed.reviewCount ||
        parsed.companyDescription ||
        parsed.reviews.length > 0;
    return hasUsefulContent ? parsed : null;
}
function formatParsedTrustpilotPage(page) {
    const lines = [];
    lines.push(`# ${page.companyName} Reviews`);
    lines.push("");
    if (page.domain)
        lines.push(`**Domain:** ${page.domain}`);
    if (page.profileStatus)
        lines.push(`**Profile:** ${page.profileStatus}`);
    if (page.trustScore)
        lines.push(`**TrustScore:** ${page.trustScore}`);
    if (page.starRating)
        lines.push(`**Stars:** ${page.starRating}`);
    if (page.ratingLabel)
        lines.push(`**Rating:** ${page.ratingLabel}`);
    if (page.reviewCount)
        lines.push(`**Reviews:** ${page.reviewCount}`);
    if (page.categories.length > 0)
        lines.push(`**Categories:** ${page.categories.join(" > ")}`);
    lines.push("");
    if (page.companyDescription) {
        lines.push("## Company Details");
        lines.push("");
        lines.push(page.companyDescription);
        lines.push("");
    }
    if (page.contactInfo.length > 0) {
        lines.push(`**Contact:** ${page.contactInfo.join(" | ")}`);
        lines.push("");
    }
    if (page.ratingDistribution.length > 0) {
        lines.push("## Rating Distribution");
        lines.push("");
        for (const entry of page.ratingDistribution) {
            lines.push(`- **${entry.stars}:** ${entry.percent}`);
        }
        lines.push("");
    }
    if (page.reviews.length > 0) {
        lines.push("## Reviews");
        lines.push("");
        for (const review of page.reviews.slice(0, 20)) {
            if (review.title)
                lines.push(`### ${review.title}`);
            const meta = [];
            if (review.rating)
                meta.push(`Rating: ${review.rating}`);
            if (review.author)
                meta.push(`Author: ${review.author}`);
            if (review.authorDetails)
                meta.push(`Author details: ${review.authorDetails}`);
            if (review.date)
                meta.push(`Date: ${review.date}`);
            if (review.experienceDate)
                meta.push(`Date of experience: ${review.experienceDate}`);
            if (review.status)
                meta.push(`Status: ${review.status}`);
            if (meta.length > 0) {
                lines.push(meta.join(" | "));
                lines.push("");
            }
            if (review.body) {
                lines.push(review.body);
                lines.push("");
            }
            if (review.reply) {
                const replyMeta = [
                    review.reply.company ? `Reply from ${review.reply.company}` : "Company reply",
                    review.reply.date,
                ].filter(Boolean).join(" | ");
                lines.push(`**${replyMeta}:** ${review.reply.body}`);
                lines.push("");
            }
            lines.push("---");
            lines.push("");
        }
    }
    return normalizeMarkdown(lines.join("\n"));
}
export class TrustpilotExtractor extends PageExtractor {
    canHandle(url) {
        return isTrustpilotUrl(url);
    }
    async extract(input) {
        if (!input.loader.renderHtml)
            return null;
        const html = await input.loader.renderHtml(input.url.href, {
            signal: input.signal,
        });
        if (!html)
            return null;
        const parsed = parseTrustpilotCompanyHtml(html, input.url);
        if (!parsed)
            return null;
        const content = formatParsedTrustpilotPage(parsed);
        if (!content.trim())
            return null;
        return { content, html };
    }
}
//# sourceMappingURL=trustpilot.js.map