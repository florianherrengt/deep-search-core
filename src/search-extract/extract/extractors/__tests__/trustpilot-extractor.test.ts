import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TrustpilotExtractor,
  isTrustpilotChallengeHtml,
  isTrustpilotReviewPageUrl,
  isTrustpilotUrl,
  parseTrustpilotCompanyHtml,
} from "../trustpilot";
import type { ExtractorInput } from "../base";

const TRUSTPILOT_HTML = `
<html>
<head>
  <title>SchemaRabbit Reviews | Read Customer Service Reviews of schemarabbit.com</title>
  <meta property="og:title" content="SchemaRabbit Reviews | Read Customer Service Reviews of schemarabbit.com">
  <meta name="description" content="Do you agree with SchemaRabbit's 4-star rating? Check out what 7 people have written so far.">
</head>
<body>
  <nav aria-label="Breadcrumb">
    <a>Categories</a>
    <a>Electronics &amp; Technology</a>
    <a>Internet &amp; Software</a>
    <a>Software Company</a>
  </nav>

  <h1>SchemaRabbit Reviews 7</h1>
  <p>Claimed profile &bull; September 2025</p>

  <section class="trustScore">
    <p data-rating-typography>4.3</p>
    <p data-rating-label>Excellent</p>
    <img alt="TrustScore 4.5 out of 5">
    <p data-testid="review-count">7 reviews</p>
  </section>

  <section>
    <h2>Written by the company</h2>
    <p>SchemaRabbit automatically generates and deploys structured data to improve your website's search visibility.</p>
  </section>

  <section>
    <h2>Contact info</h2>
    <ul>
      <li>Canada</li>
      <li>product@schemarabbit.com</li>
      <li><a href="https://schemarabbit.com">schemarabbit.com</a></li>
    </ul>
  </section>

  <ul>
    <li data-testid="rating-filter-5">5-star 100%</li>
    <li data-testid="rating-filter-4">4-star 0%</li>
    <li data-testid="rating-filter-3">3-star 0%</li>
    <li data-testid="rating-filter-2">2-star 0%</li>
    <li data-testid="rating-filter-1">1-star 0%</li>
  </ul>

  <article data-service-review-card-paper>
    <div>
      <a data-consumer-name-typography href="/users/abc">Caleb Smiler</a>
      <span>GB - 1 review</span>
    </div>
    <time datetime="2026-01-24">Jan 24, 2026</time>
    <img alt="Rated 5 out of 5 stars">
    <a data-service-review-title-typography href="/reviews/1">Very easy to use</a>
    <p data-service-review-text-typography>Very easy to use. Automates the annoying tasks and keeps everything in sync.</p>
    <p data-service-review-date-of-experience-typography>Date of experience: January 23, 2026</p>
    <span>Unprompted review</span>
  </article>

  <div data-service-review-card-paper data-service-review-rating="4">
    <div>
      <a data-consumer-name-typography href="/users/def">Jane D.</a>
      <span>US - 2 reviews</span>
    </div>
    <time datetime="2026-01-03">Jan 3, 2026</time>
    <h2 data-service-review-title-typography>Helpful support</h2>
    <p data-service-review-text-typography>Support replied quickly and fixed my setup issue.</p>
    <p data-service-review-date-of-experience-typography>Date of experience: January 2, 2026</p>
    <span>Verified</span>
    <div data-service-review-business-reply>
      <p>Reply from SchemaRabbit</p>
      <time>Jan 5, 2026</time>
      <p>Thanks for trying us.</p>
    </div>
  </div>
</body>
</html>
`;

const JSON_LD_HTML = `
<html>
<head>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Trustpilot",
      "url": "https://www.trustpilot.com"
    }
  </script>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Acme Reviews",
      "description": "Acme helps customers do the thing.",
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.2",
        "bestRating": "5",
        "reviewCount": "42"
      },
      "review": [
        {
          "@type": "Review",
          "name": "Reliable service",
          "reviewBody": "The service worked as expected.",
          "reviewRating": { "@type": "Rating", "ratingValue": "5" },
          "author": { "@type": "Person", "name": "Mia" },
          "datePublished": "2026-02-01"
        }
      ]
    }
  </script>
</head>
<body></body>
</html>
`;

function makeInput(html: string | null): ExtractorInput {
  return {
    url: new URL("https://uk.trustpilot.com/review/schemarabbit.com"),
    loader: {
      renderHtml: vi.fn(async () => html),
    },
  };
}

describe("TrustpilotExtractor.canHandle / Trustpilot URL helpers", () => {
  const extractor = new TrustpilotExtractor();

  it("accepts Trustpilot review pages across regional subdomains", () => {
    expect(isTrustpilotReviewPageUrl(new URL("https://www.trustpilot.com/review/schemarabbit.com"))).toBe(true);
    expect(isTrustpilotReviewPageUrl(new URL("https://uk.trustpilot.com/review/schemarabbit.com"))).toBe(true);
    expect(isTrustpilotReviewPageUrl(new URL("https://de.trustpilot.com/review/example.de?page=2"))).toBe(true);
  });

  it("accepts the plural /reviews/ review-page form", () => {
    // Trustpilot links to reviews via both /review/<company> (canonical
    // company page) and /reviews/<company>, with individual reviews at
    // /reviews/<id>. The guard must accept the plural first segment too.
    expect(isTrustpilotReviewPageUrl(new URL("https://www.trustpilot.com/reviews/schemarabbit.com"))).toBe(true);
    expect(isTrustpilotReviewPageUrl(new URL("https://www.trustpilot.com/reviews/abc123"))).toBe(true);
    expect(isTrustpilotReviewPageUrl(new URL("https://uk.trustpilot.com/reviews/example.de?page=2"))).toBe(true);
  });

  it("accepts regional Trustpilot roots for extractor fallback", () => {
    expect(isTrustpilotUrl(new URL("https://uk.trustpilot.com/"))).toBe(true);
    expect(isTrustpilotReviewPageUrl(new URL("https://uk.trustpilot.com/"))).toBe(false);
    expect(extractor.canHandle(new URL("https://uk.trustpilot.com/"))).toBe(true);
  });

  it("rejects non-Trustpilot hosts", () => {
    expect(isTrustpilotUrl(new URL("https://example.com/review/schemarabbit.com"))).toBe(false);
    expect(extractor.canHandle(new URL("https://example.com/review/schemarabbit.com"))).toBe(false);
  });
});

describe("parseTrustpilotCompanyHtml", () => {
  it("extracts company summary, distribution, reviews, and replies from rendered HTML", () => {
    const parsed = parseTrustpilotCompanyHtml(
      TRUSTPILOT_HTML,
      new URL("https://uk.trustpilot.com/review/schemarabbit.com"),
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.companyName).toBe("SchemaRabbit");
    expect(parsed!.domain).toBe("schemarabbit.com");
    expect(parsed!.profileStatus).toContain("Claimed profile");
    // The status must not over-capture into the adjacent trust score: a previous
    // greedy regex swallowed "...September 2025 4" (stopping at the period in
    // "4.3"). Assert it contains the month/year but NOT the score digit.
    expect(parsed!.profileStatus).toContain("September 2025");
    expect(parsed!.profileStatus).not.toMatch(/\b[0-5]\b/);
    expect(parsed!.trustScore).toBe("4.3");
    expect(parsed!.starRating).toBe("4.5 out of 5");
    expect(parsed!.ratingLabel).toBe("Excellent");
    expect(parsed!.reviewCount).toBe("7 reviews");
    expect(parsed!.categories).toEqual([
      "Electronics & Technology",
      "Internet & Software",
      "Software Company",
    ]);
    expect(parsed!.companyDescription).toContain("automatically generates");
    expect(parsed!.contactInfo).toContain("Canada");
    expect(parsed!.contactInfo).toContain("product@schemarabbit.com");
    expect(parsed!.ratingDistribution).toContainEqual({ stars: "5-star", percent: "100%" });
    expect(parsed!.reviews).toHaveLength(2);
    expect(parsed!.reviews[0]).toMatchObject({
      title: "Very easy to use",
      body: "Very easy to use. Automates the annoying tasks and keeps everything in sync.",
      rating: "5 out of 5",
      author: "Caleb Smiler",
      authorDetails: "GB - 1 review",
      date: "Jan 24, 2026",
      experienceDate: "January 23, 2026",
      status: "Unprompted review",
    });
    expect(parsed!.reviews[1].reply).toEqual({
      company: "SchemaRabbit",
      date: "Jan 5, 2026",
      body: "Thanks for trying us.",
    });
  });

  it("falls back to JSON-LD aggregate rating and reviews", () => {
    const parsed = parseTrustpilotCompanyHtml(
      JSON_LD_HTML,
      new URL("https://uk.trustpilot.com/review/acme.com"),
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.companyName).toBe("Acme");
    expect(parsed!.trustScore).toBe("4.2");
    expect(parsed!.starRating).toBe("4.2 out of 5");
    expect(parsed!.reviewCount).toBe("42 reviews");
    expect(parsed!.reviews[0]).toMatchObject({
      title: "Reliable service",
      body: "The service worked as expected.",
      rating: "5 out of 5",
      author: "Mia",
      date: "2026-02-01",
    });
  });

  it("returns null for non-company Trustpilot pages without useful content", () => {
    expect(
      parseTrustpilotCompanyHtml(
        "<html><body><h1>Trustpilot</h1><p>Browse categories</p></body></html>",
        new URL("https://uk.trustpilot.com/"),
      ),
    ).toBeNull();
  });

  it("parses abbreviated review counts (K/M) rendered by Trustpilot", () => {
    // Popular companies display counts like "12K reviews" / "3.4M reviews".
    // A previous version's number regex ([\d,]+) dropped these to null.
    const html = `
<html>
<head><meta property="og:title" content="Bigco Reviews"></head>
<body>
  <h1>Bigco Reviews</h1>
  <section class="trustScore">
    <p data-rating-typography>4.5</p>
    <p data-testid="review-count">12K reviews</p>
  </section>
</body>
</html>`;
    const parsed = parseTrustpilotCompanyHtml(
      html,
      new URL("https://www.trustpilot.com/review/bigco.com"),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.reviewCount).toBe("12K reviews");
  });

  it("parses review count from the og:description 'what N people' form", () => {
    const html = `
<html>
<head>
  <meta property="og:title" content="Bigco Reviews">
  <meta name="description" content="Do you agree with Bigco's 4-star rating? Check out what 3.4M people have written so far.">
</head>
<body><h1>Bigco</h1></body>
</html>`;
    const parsed = parseTrustpilotCompanyHtml(
      html,
      new URL("https://www.trustpilot.com/review/bigco.com"),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.reviewCount).toBe("3.4M reviews");
  });
});

describe("TrustpilotExtractor.extract", () => {
  let extractor: TrustpilotExtractor;

  beforeEach(() => {
    extractor = new TrustpilotExtractor();
  });

  it("returns formatted markdown from rendered HTML", async () => {
    const input = makeInput(TRUSTPILOT_HTML);

    const result = await extractor.extract(input);

    expect(result).not.toBeNull();
    expect(result!.content).toContain("# SchemaRabbit Reviews");
    expect(result!.content).toContain("**TrustScore:** 4.3");
    expect(result!.content).toContain("**Stars:** 4.5 out of 5");
    expect(result!.content).toContain("## Rating Distribution");
    expect(result!.content).toContain("- **5-star:** 100%");
    expect(result!.content).toContain("### Very easy to use");
    expect(result!.content).toContain("Rating: 5 out of 5");
    expect(result!.content).toContain("Date of experience: January 23, 2026");
    expect(result!.content).toContain("**Reply from SchemaRabbit | Jan 5, 2026:** Thanks for trying us.");
    expect(result!.html).toBe(TRUSTPILOT_HTML);
  });

  it("passes the abort signal to renderHtml", async () => {
    const controller = new AbortController();
    const renderHtml = vi.fn(async () => TRUSTPILOT_HTML);
    const input: ExtractorInput = {
      url: new URL("https://uk.trustpilot.com/review/schemarabbit.com"),
      loader: { renderHtml },
      signal: controller.signal,
    };

    await extractor.extract(input);

    expect(renderHtml).toHaveBeenCalledWith(
      "https://uk.trustpilot.com/review/schemarabbit.com",
      { signal: controller.signal },
    );
  });

  it("returns null when renderHtml is missing or empty", async () => {
    await expect(
      extractor.extract({
        url: new URL("https://uk.trustpilot.com/review/schemarabbit.com"),
        loader: {},
      }),
    ).resolves.toBeNull();

    await expect(extractor.extract(makeInput(null))).resolves.toBeNull();
  });
});

describe("isTrustpilotChallengeHtml", () => {
  it("detects a challenge page", () => {
    expect(
      isTrustpilotChallengeHtml("<html><body><div id=\"challenge-form\">verify you are human</div></body></html>"),
    ).toBe(true);
  });

  it("does not flag a real review page that includes footer anti-bot wording", () => {
    expect(
      isTrustpilotChallengeHtml(`${TRUSTPILOT_HTML}<footer>are you human?</footer>`),
    ).toBe(false);
  });
});
