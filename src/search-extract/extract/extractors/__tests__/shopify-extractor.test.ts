import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShopifyExtractor } from "../shopify";
import type { ExtractorInput } from "../base";

const MOCK_JS_PRODUCT = {
  id: 8584853750098,
  title: "LT 01 Court Lite Premium Nappa White",
  description:
    '<p><span style="font-weight: 400;">This lean low top features all the basics for a perfect white sneaker.</span></p>',
  vendor: "ETQ Amsterdam",
  type: "Footwear",
  handle: "lt-01-court-lite-premium-nappa-white",
  tags: [
    "bestsellers",
    "category-shoes",
    "color-white",
    "pri-color-white",
    "leather-nappa",
    "low-top",
  ],
  price: 14100,
  price_min: 14100,
  price_max: 14100,
  compare_at_price: 19400,
  compare_at_price_min: 19400,
  compare_at_price_max: 19400,
  variants: [
    {
      id: 1,
      title: "EU 39 | US 6 | UK 5",
      option1: "EU 39 | US 6 | UK 5",
      price: 14100,
      compare_at_price: 19400,
    },
    {
      id: 2,
      title: "EU 44 | US 11 | UK 10",
      option1: "EU 44 | US 11 | UK 10",
      price: 14100,
      compare_at_price: 19400,
    },
  ],
  options: [
    {
      name: "Size",
      values: ["EU 39 | US 6 | UK 5", "EU 44 | US 11 | UK 10"],
    },
  ],
};

const MOCK_JSON_PRODUCT = {
  product: {
    id: 8584853750098,
    title: "LT 01 Court Lite Premium Nappa White",
    body_html:
      '<p><span style="font-weight: 400;">This lean low top features all the basics.</span></p>',
    vendor: "ETQ Amsterdam",
    product_type: "Footwear",
    tags: "bestsellers, category-shoes, leather-nappa",
    variants: [
      {
        id: 1,
        title: "EU 39",
        price: "141.00",
        compare_at_price: "194.00",
        sku: "161539",
        option1: "EU 39",
        price_currency: "GBP",
      },
    ],
    options: [{ name: "Size", values: ["EU 39"] }],
  },
};

function wrapJsonInHtml(json: unknown): string {
  return `<html><body><pre>${JSON.stringify(json)}</pre></body></html>`;
}

function makeInput(renderHtml: (url: string) => Promise<string | null>): ExtractorInput {
  return {
    url: new URL("https://mystore.myshopify.com/en-gb/products/lt-01-court-lite-premium-nappa-white"),
    loader: { renderHtml },
  };
}

describe("ShopifyExtractor", () => {
  let extractor: ShopifyExtractor;

  beforeEach(() => {
    extractor = new ShopifyExtractor();
  });

  describe("canHandle", () => {
    it("matches product page URLs on myshopify.com domains", () => {
      expect(
        extractor.canHandle(new URL("https://mystore.myshopify.com/products/sneaker-name")),
      ).toBe(true);
      expect(
        extractor.canHandle(new URL("https://mystore.myshopify.com/en-gb/products/lt-01-court")),
      ).toBe(true);
    });

    it("rejects product page URLs on non-Shopify domains", () => {
      expect(
        extractor.canHandle(new URL("https://example.com/products/sneaker-name")),
      ).toBe(false);
      expect(
        extractor.canHandle(new URL("https://docs.github.com/en/products/copilot")),
      ).toBe(false);
      expect(
        extractor.canHandle(new URL("https://stripe.com/products/pricing")),
      ).toBe(false);
    });

    it("rejects non-product URLs even on myshopify.com", () => {
      expect(extractor.canHandle(new URL("https://mystore.myshopify.com/products.json"))).toBe(false);
      expect(extractor.canHandle(new URL("https://mystore.myshopify.com/products/"))).toBe(false);
      expect(
        extractor.canHandle(new URL("https://mystore.myshopify.com/collections/shoes")),
      ).toBe(false);
      expect(extractor.canHandle(new URL("https://mystore.myshopify.com/"))).toBe(false);
    });

    it("rejects singular /product/ paths", () => {
      expect(
        extractor.canHandle(new URL("https://mystore.myshopify.com/product/sneaker-name")),
      ).toBe(false);
    });

    it("handles URLs with query parameters on myshopify.com", () => {
      expect(
        extractor.canHandle(
          new URL("https://mystore.myshopify.com/products/sneaker?variant=123"),
        ),
      ).toBe(true);
    });
  });

  describe("extract", () => {
    it("extracts and formats a Shopify product from .js endpoint", async () => {
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(MOCK_JS_PRODUCT));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(renderHtml).toHaveBeenCalledWith(
        "https://mystore.myshopify.com/en-gb/products/lt-01-court-lite-premium-nappa-white.js",
        {},
      );
      expect(renderHtml).toHaveBeenCalledWith(
        "https://mystore.myshopify.com/en-gb/products/lt-01-court-lite-premium-nappa-white.json",
        {},
      );

      expect(result).not.toBeNull();
      expect(result!.content).toContain("# LT 01 Court Lite Premium Nappa White");
      expect(result!.content).toContain("**Vendor:** ETQ Amsterdam");
      expect(result!.content).toContain("**Type:** Footwear");
      expect(result!.content).toContain("**Price:** 141.00");
      expect(result!.content).toContain("**Was:** 194.00");
      expect(result!.content).toContain("This lean low top features all the basics");
      expect(result!.content).toContain("## Options");
      expect(result!.content).toContain("**Size:**");
    });

    it("enriches .js output with currency from .json", async () => {
      const renderHtml = vi.fn()
        .mockResolvedValueOnce(wrapJsonInHtml(MOCK_JS_PRODUCT))
        .mockResolvedValueOnce(wrapJsonInHtml(MOCK_JSON_PRODUCT));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Price:** £141.00");
      expect(result!.content).toContain("**Was:** £194.00");
    });

    it("falls back to .json-only when .js fails", async () => {
      const renderHtml = vi.fn()
        .mockResolvedValueOnce("<html><body>Not found</body></html>")
        .mockResolvedValueOnce(wrapJsonInHtml(MOCK_JSON_PRODUCT));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);

      expect(result).not.toBeNull();
      expect(result!.content).toContain("# LT 01 Court Lite Premium Nappa White");
      expect(result!.content).toContain("**Price:** £141.00");
      expect(result!.content).toContain("**Was:** £194.00");
    });

    it("handles price range across variants", async () => {
      const product = {
        ...MOCK_JS_PRODUCT,
        price_min: 9900,
        price_max: 14900,
        compare_at_price_min: 19400,
        compare_at_price_max: 19400,
        variants: [
          { ...MOCK_JS_PRODUCT.variants[0], price: 9900 },
          { ...MOCK_JS_PRODUCT.variants[1], price: 14900 },
        ],
      };
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Price:** 99.00 – 149.00");
    });

    it("handles product with no compare_at_price", async () => {
      const product = {
        ...MOCK_JS_PRODUCT,
        compare_at_price_min: 0,
        compare_at_price_max: 0,
      };
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).toContain("**Price:** 141.00");
      expect(result!.content).not.toContain("**Was:**");
    });

    it("handles product with tags as array", async () => {
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(MOCK_JS_PRODUCT));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).toContain("bestsellers");
      expect(result!.content).toContain("leather-nappa");
      expect(result!.content).not.toContain("category-shoes");
      expect(result!.content).not.toContain("pri-color-white");
    });

    it("handles product with no vendor or type", async () => {
      const product = { ...MOCK_JS_PRODUCT, vendor: "", type: "" };
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).not.toContain("**Vendor:**");
      expect(result!.content).not.toContain("**Type:**");
      expect(result!.content).toContain("# LT 01");
    });

    it("handles product with no options", async () => {
      const product = { ...MOCK_JS_PRODUCT, options: [] };
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).not.toContain("## Options");
    });

    it("strips HTML tags from description", async () => {
      const product = {
        ...MOCK_JS_PRODUCT,
        description: "<p><strong>Bold</strong> and <em>italic</em> text</p>",
      };
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).toContain("Bold and italic text");
      expect(result!.content).not.toContain("<strong>");
    });

    it("returns null when both endpoints fail", async () => {
      const renderHtml = vi.fn().mockResolvedValue(null);
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).toBeNull();
    });

    it("returns null when renderHtml is not available", async () => {
      const input: ExtractorInput = { url: new URL("https://mystore.myshopify.com/products/test"), loader: {} };

      const result = await extractor.extract(input);
      expect(result).toBeNull();
    });

    it("returns null when JSON is not valid Shopify data", async () => {
      const renderHtml = vi.fn().mockResolvedValue(
        wrapJsonInHtml({ error: "Not found" }),
      );
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).toBeNull();
    });

    it("strips query params and hash from API URLs", async () => {
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(MOCK_JS_PRODUCT));
      const input: ExtractorInput = {
        url: new URL("https://mystore.myshopify.com/products/test?variant=123#reviews"),
        loader: { renderHtml },
      };

      await extractor.extract(input);

      expect(renderHtml).toHaveBeenCalledWith(
        "https://mystore.myshopify.com/products/test.js",
        {},
      );
      expect(renderHtml).toHaveBeenCalledWith(
        "https://mystore.myshopify.com/products/test.json",
        {},
      );
    });

    it("decodes HTML entities in description text", async () => {
      const product = {
        ...MOCK_JS_PRODUCT,
        description: 'Tom &amp;Jerry&#39;s &lt;best&gt; &amp;quot;shoes&amp;quot;',
      };
      const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).not.toBeNull();
      expect(result!.content).toContain("Tom &Jerry's");
    });

    it("returns null when .js endpoint returns non-object JSON", async () => {
      const renderHtml = vi.fn()
        .mockResolvedValueOnce("<pre>404</pre>")
        .mockResolvedValueOnce("<pre>null</pre>");
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).toBeNull();
    });

    it("returns null when .js endpoint returns a JSON array", async () => {
      const renderHtml = vi.fn()
        .mockResolvedValueOnce("<pre>[1, 2, 3]</pre>")
        .mockResolvedValueOnce("<pre>[]</pre>");
      const input = makeInput(renderHtml);

      const result = await extractor.extract(input);
      expect(result).toBeNull();
    });

    describe("malformed external data", () => {
      it("does not crash when options is a string instead of array (.js)", async () => {
        const product = { ...MOCK_JS_PRODUCT, options: "Size" };
        const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).toContain("# LT 01 Court Lite Premium Nappa White");
        expect(result!.content).not.toContain("## Options");
      });

      it("does not crash when options contain entries without values (.json)", async () => {
        const product = {
          product: {
            id: 1,
            title: "Test",
            variants: [{ id: 1, price: "10.00" }],
            options: [{ name: "Size" }],
          },
        };
        const renderHtml = vi.fn()
          .mockResolvedValueOnce("<html><body>bad</body></html>")
          .mockResolvedValueOnce(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).toContain("# Test");
        expect(result!.content).not.toContain("## Options");
      });

      it("does not crash when tags is an array of numbers (.js)", async () => {
        const product = { ...MOCK_JS_PRODUCT, tags: [1, 2, 3] };
        const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).toContain("# LT 01");
      });

      it("does not produce NaN when price_min is a string (.js)", async () => {
        const product = { ...MOCK_JS_PRODUCT, price_min: "14.99" as unknown as number, price_max: "14.99" as unknown as number };
        const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).not.toContain("NaN");
      });

      it("does not produce NaN when variants have non-numeric prices (.json)", async () => {
        const product = {
          product: {
            id: 1,
            title: "Test",
            variants: [{ id: 1, price: "not-a-number" }],
            options: [],
          },
        };
        const renderHtml = vi.fn()
          .mockResolvedValueOnce("<html><body>bad</body></html>")
          .mockResolvedValueOnce(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).not.toContain("NaN");
      });

      it("does not crash when variants is a string instead of array (.json)", async () => {
        const product = {
          product: {
            id: 1,
            title: "Test",
            variants: "garbage",
            options: [],
          },
        };
        const renderHtml = vi.fn()
          .mockResolvedValueOnce("<html><body>bad</body></html>")
          .mockResolvedValueOnce(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).not.toContain("NaN");
        expect(result!.content).toContain("# Test");
      });

      it("does not crash when options is null (.js)", async () => {
        const product = { ...MOCK_JS_PRODUCT, options: null };
        const renderHtml = vi.fn().mockResolvedValue(wrapJsonInHtml(product));
        const input = makeInput(renderHtml);

        const result = await extractor.extract(input);
        expect(result).not.toBeNull();
        expect(result!.content).toContain("# LT 01");
        expect(result!.content).not.toContain("## Options");
      });
    });
  });
});
