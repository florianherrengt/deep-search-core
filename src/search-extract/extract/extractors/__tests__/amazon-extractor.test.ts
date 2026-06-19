import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmazonExtractor, isAmazonChallengePage, parseAmazonProductHtml } from "../amazon";
import type { ExtractorInput } from "../base";

const AMAZON_PRODUCT_HTML = `
<html>
<body>
<div id="wayfinding-breadcrumbs_container">
  <ul>
    <li><a>Sports &amp; Outdoors</a></li>
    <li><a>Fitness</a></li>
    <li><a>Strength Training Equipment</a></li>
  </ul>
</div>

<span id="productTitle">Sportneer Pull Up Bar: Adjustable Width Locking Mechanism</span>

<a id="bylineInfo">Visit the Sportneer Store</a>

<span id="acrPopover"><span class="a-icon-alt">4.3 out of 5 stars</span></span>
<span id="acrCustomerReviewText">527 ratings</span>

<div id="corePrice_feature_div">
  <span class="a-price">
    <span class="a-offscreen">£29.99</span>
  </span>
</div>

<div id="productOverview_feature_div">
  <table>
    <tr><td>Brand</td><td>Sportneer</td></tr>
    <tr><td>Colour</td><td>Black</td></tr>
    <tr><td>Material</td><td>Alloy Steel</td></tr>
  </table>
</div>

<div id="feature-bullets">
  <ul class="a-unordered-list">
    <li><span class="a-list-item">No drilling required</span></li>
    <li><span class="a-list-item">Easy installation in four steps</span></li>
    <li><span class="a-list-item">Adjustable from 76cm to 95cm</span></li>
  </ul>
</div>

<div data-hook="review">
  <span class="a-profile-name">Jane D.</span>
  <i data-hook="review-star-rating"><span class="a-icon-alt">5 out of 5 stars</span></i>
  <h5 data-hook="reviewTitle">Excellent product</h5>
  <span data-hook="review-date">Reviewed in the United Kingdom on 14 October 2025</span>
            <div data-hook="reviewText">Solid build quality, easy to install. Brief content visible, double tap to read full content.Full content visible, double tap to read brief content.Highly recommended!Read moreRead less</div>
  <span data-hook="helpful-vote-statement">3 people found this helpful</span>
</div>

<div data-hook="review">
  <span class="a-profile-name">John S.</span>
  <i data-hook="review-star-rating"><span class="a-icon-alt">4 out of 5 stars</span></i>
  <h5 data-hook="reviewTitle">Good but heavy</h5>
  <span data-hook="review-date">Reviewed in the United Kingdom on 1 May 2025</span>
  <div data-hook="reviewText">Works well for pull ups</div>
</div>
</body>
</html>
`;

function makeInput(renderHtml: (url: string) => Promise<string | null>): ExtractorInput {
  return {
    url: new URL("https://www.amazon.co.uk/dp/B0CR19B55Y"),
    loader: {
      renderHtml,
    },
  };
}

describe("AmazonExtractor", () => {
  let extractor: AmazonExtractor;

  beforeEach(() => {
    extractor = new AmazonExtractor();
  });

  describe("canHandle", () => {
    it("matches amazon.com product URLs", () => {
      expect(extractor.canHandle(new URL("https://www.amazon.com/dp/B0CR19B55Y"))).toBe(true);
    });

    it("matches amazon.co.uk product URLs", () => {
      expect(
        extractor.canHandle(
          new URL("https://www.amazon.co.uk/Sportneer-Pull-Bar/dp/B0CR19B55Y"),
        ),
      ).toBe(true);
    });

    it("matches amazon.de product URLs", () => {
      expect(extractor.canHandle(new URL("https://www.amazon.de/dp/B0CR19B55Y"))).toBe(true);
    });

    it("matches amazon.co.jp product URLs", () => {
      expect(extractor.canHandle(new URL("https://www.amazon.co.jp/dp/B0CR19B55Y"))).toBe(true);
    });

    it("does not match non-Amazon URLs", () => {
      expect(extractor.canHandle(new URL("https://example.com/dp/B0CR19B55Y"))).toBe(false);
    });

    it("does not match Amazon non-product pages", () => {
      expect(extractor.canHandle(new URL("https://www.amazon.com/gp/cart/view.html"))).toBe(false);
    });

    it("does not match Amazon search pages", () => {
      expect(extractor.canHandle(new URL("https://www.amazon.com/s?k=pull+up+bar"))).toBe(false);
    });
  });

  describe("extract", () => {
    it("extracts product info as markdown", async () => {
      const renderHtml = vi.fn().mockResolvedValue(AMAZON_PRODUCT_HTML);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("# Sportneer Pull Up Bar: Adjustable Width Locking Mechanism");
      expect(result!.content).toContain("**Brand:** Sportneer");
      expect(result!.content).toContain("**Price:** £29.99");
      expect(result!.content).toContain("**Rating:** 4.3 out of 5 stars");
      expect(result!.content).toContain("**Reviews:** 527 ratings");
      expect(result!.content).toContain("**Category:** Sports & Outdoors > Fitness > Strength Training Equipment");
      expect(result!.content).toContain("## Specifications");
      expect(result!.content).toContain("- **Brand** Sportneer");
      expect(result!.content).toContain("- **Colour** Black");
      expect(result!.content).toContain("- **Material** Alloy Steel");
      expect(result!.content).toContain("## About This Item");
      expect(result!.content).toContain("- No drilling required");
      expect(result!.content).toContain("- Easy installation in four steps");
      expect(result!.content).toContain("- Adjustable from 76cm to 95cm");
      expect(result!.content).toContain("## Customer Reviews");
      expect(result!.content).toContain("Highly recommended!");
      expect(result!.content).toContain("*3 people found this helpful*");
      expect(result!.content).toContain("Works well for pull ups");
    });

    it("returns null when renderHtml returns null", async () => {
      const renderHtml = vi.fn().mockResolvedValue(null);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).toBeNull();
    });

    it("returns null when HTML has no product title", async () => {
      const renderHtml = vi.fn().mockResolvedValue("<html><body>Some random page without product info</body></html>");
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).toBeNull();
    });

    it("returns null when renderHtml is not available", async () => {
      const input: ExtractorInput = { url: new URL("https://www.amazon.co.uk/dp/B0CR19B55Y"), loader: {} };

      const result = await extractor.extract(input);

      expect(result).toBeNull();
    });

    it("handles missing optional fields gracefully", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Minimal Product</span>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toBe("# Minimal Product\n\n");
    });

    it("extracts price from split whole/fraction spans", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Test Product</span>
          <span class="a-price-whole">29.</span>
          <span class="a-price-fraction">99</span>
          <span class="a-price-symbol">£</span>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Price:** £29.99");
    });

    it("strips 'Visit the' and 'Store' from brand name", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Product</span>
          <a id="bylineInfo">Visit the ACME Store</a>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Brand:** ACME");
    });

    it("strips Amazon expander noise from review bodies", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Product</span>
          <div data-hook="review">
            <span class="a-profile-name">A.</span>
            <i data-hook="review-star-rating"><span class="a-icon-alt">5 out of 5 stars</span></i>
            <h5 data-hook="reviewTitle">Great</h5>
            <div data-hook="reviewText">Brief content visible, double tap to read full content.Full content visible, double tap to read brief content.Actual review text here.</div>
          </div>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("Actual review text here.");
      expect(result!.content).not.toContain("Brief content visible");
      expect(result!.content).not.toContain("double tap to read");
    });

    it("returns 'Currently unavailable.' for out-of-stock products", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Some Product</span>
          <div id="outOfStock"><div class="a-box-inner">
            <span class="a-color-base a-text-bold">Currently unavailable.</span>
          </div></div>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toBe("Currently unavailable.");
    });

    it("extracts price from #priceblock_dealprice", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Deal Product</span>
          <span id="priceblock_dealprice" class="a-price"><span class="a-offscreen">$29.99</span></span>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Price:** $29.99");
    });

    it("strips 'Brand: ' prefix from brand name", async () => {
      const renderHtml = vi.fn().mockResolvedValue(`
        <html><body>
          <span id="productTitle">Product</span>
          <a id="bylineInfo">Brand: Nike</a>
        </body></html>
      `);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Brand:** Nike");
    });
  });

  describe("isAmazonChallengePage", () => {
    it("returns false when product title is present", () => {
      expect(isAmazonChallengePage(AMAZON_PRODUCT_HTML)).toBe(false);
    });

    it("detects 'enter the characters you see below'", () => {
      expect(isAmazonChallengePage("<html><body>enter the characters you see below</body></html>")).toBe(true);
    });

    it("detects 'sorry, we just need to make sure you're not a robot'", () => {
      expect(isAmazonChallengePage("<html><body>sorry, we just need to make sure you're not a robot</body></html>")).toBe(true);
    });

    it("detects 'type the characters you see in this image'", () => {
      expect(isAmazonChallengePage("<html><body>type the characters you see in this image</body></html>")).toBe(true);
    });

    it("detects 'captcha'", () => {
      expect(isAmazonChallengePage("<html><body>captcha</body></html>")).toBe(true);
    });

    it("detects 'are you a robot'", () => {
      expect(isAmazonChallengePage("<html><body>are you a robot</body></html>")).toBe(true);
    });

    it("detects 'sorry, something went wrong'", () => {
      expect(isAmazonChallengePage("<html><body>sorry, something went wrong</body></html>")).toBe(true);
    });

    it("does not flag captcha when product title is present", () => {
      const htmlWithCaptchaAndProduct = `
        <html><body>
          <span id="productTitle">Real Product</span>
          <div class="captcha">captcha challenge</div>
        </body></html>
      `;
      expect(isAmazonChallengePage(htmlWithCaptchaAndProduct)).toBe(false);
    });
  });

  describe("parseAmazonProductHtml", () => {
    it("parses product HTML into markdown", () => {
      const result = parseAmazonProductHtml(AMAZON_PRODUCT_HTML);
      expect(result).toContain("# Sportneer Pull Up Bar");
      expect(result).toContain("**Price:** £29.99");
    });

    it("returns null for HTML without title", () => {
      expect(parseAmazonProductHtml("<html><body>No title</body></html>")).toBeNull();
    });

    it("returns 'Currently unavailable.' for out-of-stock", () => {
      const html = `
        <html><body>
          <span id="productTitle">Some Product</span>
          <div id="outOfStock"></div>
        </body></html>
      `;
      expect(parseAmazonProductHtml(html)).toBe("Currently unavailable.");
    });
  });
});
