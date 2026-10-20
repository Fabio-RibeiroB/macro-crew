import test from "node:test";
import assert from "node:assert/strict";
import {
  PAGES,
  resolvePage,
  legacyDestination,
} from "../../src/app/data/pages.mjs";

test("plain-English pages have stable direct URLs and unique navigation identities", () => {
  assert.equal(new Set(PAGES.map((p) => p.path)).size, PAGES.length);
  assert.deepEqual(
    PAGES.map((p) => p.label),
    ["Overview", "Prices", "The Economy", "Government & Budget", "Sources"],
  );
  for (const page of PAGES) {
    assert.equal(resolvePage(page.path).id, page.id);
    if (page.path !== "/")
      assert.equal(resolvePage(page.path + "/").id, page.id);
  }
  assert.equal(resolvePage("/unknown-page").id, "missing");
});

test("old section links preserve access without redirect loops", () => {
  assert.equal(legacyDestination("/", "#decisions"), "/economy#interest-rates");
  assert.equal(legacyDestination("/", "#reports"), "/economy#publications");
  assert.equal(legacyDestination("/", "#sources"), "/sources");
  assert.equal(legacyDestination("/", "#trends"), "/economy#trends");
  assert.equal(legacyDestination("/", "#everyday"), null);
  assert.equal(legacyDestination("/economy", "#interest-rates"), null);
});

test("every page renders its own heading, navigation and missing-data content", async () => {
  // Vite's existing TSX transform avoids a second compiler/test framework dependency.
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    for (const page of PAGES) {
      const html = renderToStaticMarkup(
        createElement(App, { pathname: page.path }),
      );
      assert.match(html, /<main id="main-content"/);
      assert.match(html, /aria-current="page"/);
      assert.equal((html.match(/<h1>/g) || []).length, 1);
      assert.ok(
        html.includes(
          page.id === "overview"
            ? "Big economic news."
            : page.title.replaceAll("&", "&amp;"),
        ),
      );
      assert.doesNotMatch(html, /class="fs-number">0%/);
      if (["prices", "economy"].includes(page.id))
        assert.match(
          html,
          /Charts will appear when verified figures are available/,
        );
      if (page.id === "government")
        assert.match(html, /not available here yet/);
      if (page.id === "overview") {
        assert.doesNotMatch(html, /id="trends"/);
        assert.doesNotMatch(html, /Earlier AI report summaries/);
      }
    }
    const emptyMetric = {
      definition: {
        dataset: "MM23",
        series: "L55O",
        frequency: "monthly",
        source_url: "https://www.ons.gov.uk/",
      },
      latest: null,
      history: [],
      collection_status: "degraded",
    };
    const noReading = renderToStaticMarkup(
      createElement(App, {
        pathname: "/prices",
        initialData: {
          published_at: "2026-10-20T12:00:00Z",
          metrics: { cpih: emptyMetric },
        },
      }),
    );
    assert.match(noReading, /A verified reading is not available yet/);
    assert.match(noReading, />Not available<\/p>/);
    assert.doesNotMatch(noReading, /class="fs-number">0%/);
    const missing = renderToStaticMarkup(
      createElement(App, { pathname: "/does-not-exist" }),
    );
    assert.match(missing, /Page not found/);
    assert.match(missing, /Go to the overview/);
    assert.doesNotMatch(missing, /aria-current="page"/);
  } finally {
    await server.close();
  }
});
