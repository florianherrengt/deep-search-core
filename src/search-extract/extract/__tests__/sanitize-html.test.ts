import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../sanitize-html";

describe("sanitizeHtml", () => {
  it("extracts compact visible text while preserving product page details", () => {
    const result = sanitizeHtml(`
      <html>
        <head>
          <title>Ignored title chrome</title>
          <meta name="description" content="metadata should not leak" />
          <style>.price { color: red; }</style>
          <script>{"price":"wrong"}</script>
        </head>
        <body>
          <header>Store navigation</header>
          <nav>Deals Departments Account</nav>
          <main>
            <section class="product-detail">
              <h1>ErgoEdge Low Profile Keyboard Tray</h1>
              <div class="rating">4.6 out of 5 stars</div>
              <div class="price">$39.95</div>
              <p>Soft beveled front edge reduces wrist pressure.</p>
              <table>
                <tr><th>Feature</th><th>Value</th></tr>
                <tr><td>Height</td><td>0.75 in</td></tr>
                <tr><td>Material</td><td>Dense foam</td></tr>
              </table>
            </section>
            <section class="recommendations">
              <h2>Similar items</h2>
              <article>
                <h3>Wrist Rest Pro</h3>
                <span>$24.99</span>
                <span>4.4 stars</span>
              </article>
            </section>
          </main>
          <div aria-hidden="true">Hidden modal price $0.01</div>
          <div class="cookie-banner">Accept cookies to continue</div>
          <div id="newsletter-popup">Join our list</div>
          <footer>Footer links</footer>
        </body>
      </html>
    `);

    expect(result).toContain("ErgoEdge Low Profile Keyboard Tray");
    expect(result).toContain("4.6 out of 5 stars");
    expect(result).toContain("$39.95");
    expect(result).toContain("Feature | Value");
    expect(result).toContain("Height | 0.75 in");
    expect(result).toContain("Similar items");
    expect(result).toContain("Wrist Rest Pro");
    expect(result).toContain("$24.99");
    expect(result).not.toContain("<");
    expect(result).not.toContain("metadata should not leak");
    expect(result).not.toContain("wrong");
    expect(result).not.toContain("Store navigation");
    expect(result).not.toContain("Accept cookies");
    expect(result).not.toContain("Hidden modal price");
    expect(result).not.toContain("Join our list");
  });

  it("prunes scripts, styles, and structural tags", () => {
    const result = sanitizeHtml(`
      <html>
        <head><title>Test</title><script>alert(1)</script><style>div{}</style></head>
        <body><p>Hello</p></body>
      </html>
    `);

    expect(result).toBe("Hello");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("Test");
  });

  it("prunes hidden elements via aria-hidden and hidden attribute", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <p>Visible</p>
          <div aria-hidden="true">Hidden by aria</div>
          <div hidden>Hidden by attribute</div>
          <div type="hidden">Hidden by type</div>
        </body>
      </html>
    `);

    expect(result).toContain("Visible");
    expect(result).not.toContain("Hidden by aria");
    expect(result).not.toContain("Hidden by attribute");
    expect(result).not.toContain("Hidden by type");
  });

  it("prunes elements with display:none style", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <p>Visible</p>
          <div style="display:none">Hidden</div>
          <div style="  display :  none  ">Also hidden</div>
          <div style="visibility:hidden">Gone</div>
          <div style="visibility:collapse">Collapsed</div>
          <div style="opacity:0">Transparent</div>
        </body>
      </html>
    `);

    expect(result).toContain("Visible");
    expect(result).not.toContain("Hidden");
    expect(result).not.toContain("Also hidden");
    expect(result).not.toContain("Gone");
    expect(result).not.toContain("Collapsed");
    expect(result).not.toContain("Transparent");
  });

  it("prunes cookie and consent banners", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <p>Content</p>
          <div class="cookie-banner">Accept cookies</div>
          <div id="gdpr-consent">Consent popup</div>
          <div class="newsletter-overlay">Subscribe</div>
          <div data-testid="modal">Modal content</div>
        </body>
      </html>
    `);

    expect(result).toContain("Content");
    expect(result).not.toContain("Accept cookies");
    expect(result).not.toContain("Consent popup");
    expect(result).not.toContain("Subscribe");
    expect(result).not.toContain("Modal content");
  });

  it("caps repeated lines at MAX_REPEATED_LINE_OCCURRENCES", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <main>
            <p>Free returns</p>
            <p>Free returns</p>
            <p>Free returns</p>
            <p>Product A $10</p>
            <p>Product B $12</p>
            <p>Product A $10</p>
          </main>
        </body>
      </html>
    `);

    expect(result.match(/Free returns/g)).toHaveLength(2);
    expect(result.match(/Product A \$10/g)).toHaveLength(2);
    expect(result).toContain("Product B $12");
  });

  it("renders table cells with pipe separators", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <table>
            <thead><tr><th>Name</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>Alpha</td><td>1</td></tr>
              <tr><td>Beta</td><td>2</td></tr>
            </tbody>
          </table>
        </body>
      </html>
    `);

    expect(result).toContain("Name | Value");
    expect(result).toContain("Alpha | 1");
    expect(result).toContain("Beta | 2");
  });

  it("normalizes whitespace", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <p>   Too   many   spaces   </p>
          <p>Line\u00a0with\u00a0nbsp</p>
        </body>
      </html>
    `);

    expect(result).toContain("Too many spaces");
    expect(result).toContain("Line with nbsp");
    expect(result).not.toContain("\u00a0");
  });

  it("returns empty string for empty HTML", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml("<html><body></body></html>")).toBe("");
  });

  it("handles HTML without body tag", () => {
    const result = sanitizeHtml("<div><p>Just a fragment</p></div>");

    expect(result).toContain("Just a fragment");
  });

  it("prunes navigation role elements", () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <div role="navigation">Nav content</div>
          <div role="banner">Banner ad</div>
          <div role="dialog">Dialog</div>
          <div role="complementary">Sidebar</div>
          <div role="contentinfo">Footer</div>
          <div role="alertdialog">Alert</div>
          <p>Main content</p>
        </body>
      </html>
    `);

    expect(result).toContain("Main content");
    expect(result).not.toContain("Nav content");
    expect(result).not.toContain("Banner ad");
    expect(result).not.toContain("Dialog");
    expect(result).not.toContain("Sidebar");
    expect(result).not.toContain("Footer");
    expect(result).not.toContain("Alert");
  });
});
