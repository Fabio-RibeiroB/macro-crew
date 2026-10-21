import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PAGES,
  NAV_PAGES,
  FOOTER_PAGES,
  UNPUBLISHED_PATHS,
  documentTitle,
  resolvePage,
  legacyDestination,
  canonicalDestination,
} from "../../src/app/data/pages.mjs";
import { NAV_COLLAPSE_QUERY } from "../../src/app/data/interactions.mjs";

test("plain-English pages have stable direct URLs and unique navigation identities", () => {
  assert.equal(new Set(PAGES.map((p) => p.path)).size, PAGES.length);
  assert.deepEqual(
    NAV_PAGES.map((p) => p.label),
    ["Overview", "Prices", "Economy", "Government"],
  );
  assert.deepEqual(
    FOOTER_PAGES.map((p) => [p.path, p.label]),
    [
      ["/about", "About"],
      ["/sources", "Sources"],
    ],
  );
  assert.deepEqual(
    PAGES.map((p) => p.path),
    ["/", "/prices", "/economy", "/government-budget", "/about", "/sources"],
  );
  for (const page of PAGES) {
    assert.equal(resolvePage(page.path).id, page.id);
    if (page.path !== "/")
      assert.equal(resolvePage(page.path + "/").id, page.id);
    assert.equal(documentTitle(page), `${page.title} | finstats UK`);
  }
  assert.equal(resolvePage("/about").id, "about");
  assert.equal(canonicalDestination("/about/"), "/about");
  assert.equal(canonicalDestination("/government-budget/"), "/government-budget");
  assert.equal(resolvePage("/unknown-page").id, "missing");
});

test("old section links preserve access without redirect loops", () => {
  assert.equal(legacyDestination("/", "#decisions"), "/economy#interest-rates");
  assert.equal(legacyDestination("/", "#reports"), "/economy#publications");
  assert.equal(legacyDestination("/", "#sources"), "/sources");
  assert.equal(legacyDestination("/", "#Sources"), "/sources");
  assert.equal(canonicalDestination("/prices/"), "/prices");
  assert.equal(canonicalDestination("/unknown/"), null);
  assert.equal(legacyDestination("/", "#trends"), "/economy#trends");
  assert.equal(legacyDestination("/", "#everyday"), null);
  assert.equal(legacyDestination("/economy", "#interest-rates"), null);
  assert.equal(legacyDestination("/about", "#sources"), null);
  for (const path of UNPUBLISHED_PATHS) {
    assert.equal(resolvePage(path).id, "missing");
    assert.equal(legacyDestination(path, "#trends"), null);
    assert.equal(canonicalDestination(path + "/"), null);
  }
});

test("header collapse breakpoint matches the stylesheet", () => {
  const css = readFileSync(
    new URL("../../src/styles/friendly.css", import.meta.url),
    "utf8",
  );
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(css, new RegExp(`@media ${NAV_COLLAPSE_QUERY.replace("(", "\\(").replace(")", "\\)")}`));
  assert.match(html, /<title>[^<]*finstats UK/);
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
    const rendered = new Map();
    for (const page of PAGES) {
      const html = renderToStaticMarkup(
        createElement(App, { pathname: page.path }),
      );
      rendered.set(page.path, html);
      assert.match(html, /<main id="main-content"/);
      assert.match(html, /aria-current="page"/);
      assert.match(html, /finstats UK/);
      assert.match(html, /class="fs-flag"/);
      assert.doesNotMatch(html, /fs-brand-mark/);
      assert.doesNotMatch(html, /aria-label="FinStats home"/);
      assert.match(html, /General economic information, not individual financial advice/);
      assert.match(html, /<button type="button" class="fs-menu-button"/);
      assert.match(html, /aria-controls="main-navigation"/);
      assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.ok(
        html.includes(
          page.id === "overview"
            ? "Latest verified figures"
            : page.title.replaceAll("&", "&amp;"),
        ),
      );
      assert.doesNotMatch(html, /class="fs-number">0%/);
      const header = html.match(
        /<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/,
      )[0];
      const footer = html.match(
        /<nav[^>]*aria-label="Footer"[\s\S]*?<\/nav>/,
      )[0];
      assert.deepEqual(
        [...header.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
        NAV_PAGES.map((item) => item.path),
      );
      assert.deepEqual(
        [...footer.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
        FOOTER_PAGES.map((item) => item.path),
      );
      for (const path of UNPUBLISHED_PATHS)
        assert.equal(html.includes(`href="${path}`), false);
      if (NAV_PAGES.some((item) => item.id === page.id))
        assert.match(header, /aria-current="page"/);
      else assert.match(footer, /aria-current="page"/);
      if (["prices", "economy"].includes(page.id))
        assert.match(
          html,
          /Charts will appear when verified figures are available/,
        );
      if (page.id === "government")
        assert.match(html, /not available here yet/);
      if (page.id === "overview") {
        assert.doesNotMatch(html, /Big economic news|The quick read|Your everyday economy/);
        assert.match(html, /<h1[^>]*>Latest verified figures<\/h1>/);
        assert.doesNotMatch(html, /id="trends"/);
        assert.doesNotMatch(html, /Earlier AI report summaries/);
      }
      if (page.id === "about") {
        assert.match(html, /Office for National Statistics/);
        assert.match(html, /Bank of England/);
        assert.match(html, /labelled as commentary/);
        assert.match(html, /not a government website/);
        assert.match(html, /does not produce official statistics/);
        assert.match(html, /UK-wide/);
        assert.doesNotMatch(html, /independent|endorsed|unbiased|official partner/i);
      }
    }
    for (const [path, html] of rendered) {
      for (const href of html.match(/href="([^"]+)"/g).map((item) => item.slice(6, -1))) {
        if (/^(https?:|mailto:)/.test(href)) continue;
        const url = new URL(href, `https://finstats.example${path}`);
        const legacy = legacyDestination(url.pathname, url.hash);
        const target = legacy
          ? new URL(legacy, "https://finstats.example")
          : url;
        const destination = resolvePage(target.pathname);
        assert.notEqual(destination.id, "missing", `${path} links to ${href}`);
        assert.equal(UNPUBLISHED_PATHS.includes(target.pathname), false, href);
        if (!target.hash) continue;
        const id = decodeURIComponent(target.hash.slice(1));
        assert.match(
          rendered.get(destination.path),
          new RegExp(`id="${id}"`),
          `${path} -> ${href}`,
        );
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
    const overviewData = {
      published_at: "2026-10-20T12:00:00Z",
      metrics: Object.fromEntries(
        ["cpih", "bank_rate", "gdp"].map((kind, index) => {
          const period = kind === "bank_rate" ? "2026-10-20" : "2026-09";
          const metric = {
            definition: {
              dataset: kind === "cpih" ? "MM23" : kind === "gdp" ? "MGDP" : "IUDBEDR",
              series: kind === "cpih" ? "L55O" : kind === "gdp" ? "ECYX" : "IUDBEDR",
              source_url: "https://www.ons.gov.uk/",
            },
            history: [
              { period: kind === "bank_rate" ? "2026-10-19" : "2026-08", value: "3.4", status: "observed" },
              { period, value: String(3.5 + index), status: "observed" },
            ],
            latest: null,
            collection_status: "ok",
            validation_status: "verified",
            last_successful_check_at: "2026-10-20T12:00:00Z",
          };
          metric.latest = metric.history.at(-1);
          return [kind, metric];
        }),
      ),
    };
    const overview = renderToStaticMarkup(
      createElement(App, { pathname: "/", initialData: overviewData }),
    );
    assert.match(overview, /class="fs-number">3\.5%/);
    assert.match(overview, /class="fs-number">4\.5%/);
    assert.match(overview, /Changed by \+1\.1 percentage points on 20 October 2026/);
    assert.match(overview, /About Inflation/);
    assert.match(overview, /See Inflation details/);
    assert.match(overview, /href="\/economy#interest-rates"/);
    assert.match(overview, /href="\/economy#gdp"/);
    assert.match(overview, /href="\/prices#figures"/);
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
