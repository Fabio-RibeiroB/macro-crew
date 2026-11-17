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
import { overviewRowsOf, textOf } from "./overview-helpers.mjs";

test("plain-English pages have stable direct URLs and unique navigation identities", () => {
  assert.equal(new Set(PAGES.map((p) => p.path)).size, PAGES.length);
  assert.deepEqual(
    NAV_PAGES.map((p) => p.label),
    ["Overview", "Calendar", "Prices", "Economy", "Jobs & Pay", "Housing", "Government"],
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
    ["/", "/calendar", "/prices", "/economy", "/jobs-pay", "/housing", "/government-budget", "/about", "/sources"],
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
    server: { middlewareMode: true, hmr: false, ws: false },
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
            ? "Latest figures"
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
        {
          assert.match(html, /Public sector net debt/);
          assert.match(html, /not available here yet/);
          assert.ok(html.indexOf("Public sector net debt") < html.indexOf("Start with who is affected"));
          assert.match(html, /Next release dates/);
        }
      if (page.id === "overview") {
        assert.doesNotMatch(html, /Big economic news|The quick read|Your everyday economy/);
        assert.match(html, /<h1[^>]*>Latest figures<\/h1>/);
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
    assert.match(rendered.get("/housing"), /id="rent"/);
    assert.match(readFileSync(new URL("../../src/app/App.tsx", import.meta.url), "utf8"), /detailHref: "\/housing#rent"/);
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
    const overviewRows = overviewRowsOf(overview);
    assert.deepEqual(Object.keys(overviewRows), ["inflation", "bank-rate", "wages", "unemployment", "rent", "house-prices", "energy", "fuel", "gdp"]);
    assert.match(textOf(overviewRows.inflation), /^Inflation \(CPIH\) .*\b3\.5%/);
    assert.match(textOf(overviewRows["bank-rate"]), /4\.50%/);
    assert.match(textOf(overviewRows["bank-rate"]), /3\.40% Before 20 Oct 2026/);
    assert.match(textOf(overviewRows["bank-rate"]), /\+1\.1 pp/);
    assert.match(overview, /Inflation \(CPIH\)/);
    assert.match(overview, /href="\/economy#interest-rates"/);
    assert.match(overview, /href="\/economy#gdp"/);
    assert.match(overview, /href="\/prices#figures"/);
    assert.match(overview, /href="\/jobs-pay#wages"/);
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

test("CPI headlines inflation while CPIH stays labelled supporting data", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const inflationMetric = (series, latestPeriod, latestValue, previousValue) => {
      const metric = {
        definition: {
          metric_id: "uk.cpi.annual_rate",
          dataset: "MM23",
          series,
          frequency: "monthly",
          comparison: "year_on_year",
          adjustment: "not_seasonally_adjusted",
          unit: "percent",
          version: 1,
          geography: "United Kingdom",
          source_url: `https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/${series.toLowerCase()}/mm23`,
        },
        history: [
          { period: "2026-08", value: previousValue, status: "observed" },
          { period: latestPeriod, value: latestValue, status: "observed" },
        ],
        latest: null,
        collection_status: "ok",
        validation_status: "verified",
        snapshot_evidence_kind: "official_download",
        last_successful_check_at: "2026-10-21T12:00:00Z",
      };
      metric.latest = metric.history.at(-1);
      return metric;
    };
    const withBoth = {
      published_at: "2026-10-21T12:00:00Z",
      metrics: {
        cpi: inflationMetric("D7G7", "2026-09", "3.5", "3.1"),
        cpih: inflationMetric("L55O", "2026-08", "3.3", "3.5"),
      },
    };
    const prices = renderToStaticMarkup(
      createElement(App, { pathname: "/prices", initialData: withBoth }),
    );
    assert.match(prices, /<h4 class="fs-fig-name">CPI inflation<\/h4>/);
    assert.match(prices, /<h4 class="fs-fig-name">Inflation \(CPIH\) · secondary measure<\/h4>/);
    assert.match(prices, /CPI · change over 12 months/);
    assert.match(prices, /CPIH · change over 12 months/);
    assert.match(prices, /\+0\.4 pp/);
    assert.match(prices, /3\.1%[\s\S]{0,200}Aug 2026/);
    assert.match(prices, /MM23 \/ D7G7/);
    assert.match(prices, /MM23 \/ L55O/);
    assert.match(prices, /CPIH also includes owner occupiers/);
    assert.match(prices, /Annual CPI inflation was 3\.5% in September 2026/);
    assert.doesNotMatch(prices, /Annual CPIH inflation/);
    const overviewData = {
      published_at: "2026-10-21T12:00:00Z",
      metrics: {
        ...withBoth.metrics,
        bank_rate: {
          definition: {
            dataset: "IADB",
            series: "IUDBEDR",
            frequency: "daily",
            source_url: "https://www.bankofengland.co.uk/",
          },
          history: [{ period: "2026-10-20", value: "3.75", status: "observed" }],
          latest: null,
          collection_status: "ok",
          validation_status: "verified",
          last_successful_check_at: "2026-10-21T12:00:00Z",
        },
        gdp: {
          definition: {
            dataset: "MGDP",
            series: "ECYX",
            frequency: "monthly",
            source_url: "https://www.ons.gov.uk/",
          },
          history: [{ period: "2026-08", value: "0.1", status: "observed" }],
          latest: null,
          collection_status: "ok",
          validation_status: "verified",
          last_successful_check_at: "2026-10-21T12:00:00Z",
        },
      },
    };
    for (const key of ["bank_rate", "gdp"])
      overviewData.metrics[key].latest = overviewData.metrics[key].history.at(-1);
    const overview = renderToStaticMarkup(
      createElement(App, { pathname: "/", initialData: overviewData }),
    );
    assert.match(overviewRowsOf(overview).inflation, /<a class="fs-ledger-link" href="\/prices#figures">Inflation<svg[^>]*aria-hidden="true"><path d="[^"]*"><\/path><\/svg><\/a>/);
    assert.doesNotMatch(overview, /Inflation \(CPIH\)/);
    const cpihOnly = {
      published_at: "2026-10-21T12:00:00Z",
      metrics: {
        cpi: {
          definition: inflationMetric("D7G7", "2026-09", "3.5", "3.1").definition,
          history: [],
          latest: null,
          collection_status: "unavailable",
          validation_status: "unavailable",
        },
        cpih: inflationMetric("L55O", "2026-08", "3.3", "3.5"),
      },
    };
    const fallback = renderToStaticMarkup(
      createElement(App, { pathname: "/prices", initialData: cpihOnly }),
    );
    assert.doesNotMatch(fallback, /<h4 class="fs-fig-name">CPI inflation<\/h4>/);
    assert.match(fallback, /<h4 class="fs-fig-name">Inflation \(CPIH\)<\/h4>/);
    assert.match(fallback, /Annual CPIH inflation was 3\.3% in August 2026/);
    const degraded = {
      published_at: "2026-10-21T12:00:00Z",
      metrics: {
        cpi: {
          ...inflationMetric("D7G7", "2026-09", "3.5", "3.1"),
          collection_status: "degraded",
        },
        cpih: inflationMetric("L55O", "2026-08", "3.3", "3.5"),
      },
    };
    const degradedPrices = renderToStaticMarkup(
      createElement(App, { pathname: "/prices", initialData: degraded }),
    );
    assert.match(degradedPrices, /<h4 class="fs-fig-name">CPI inflation<\/h4>/);
    assert.match(degradedPrices, /Update delayed · showing last verified figure/);
  } finally {
    await server.close();
  }
});

test("Jobs & Pay renders official nominal and independently dated CPIH real pay", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const data = JSON.parse(readFileSync(new URL("../fixtures/verified/v1-with-optional.json", import.meta.url), "utf8"));
    const page = renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData: data }));
    assert.match(page, /href="\/jobs-pay"[^>]*aria-current="page"/);
    assert.ok(page.indexOf('id="wages"') >= 0 && page.indexOf('id="wages"') < page.indexOf('id="unemployment"'));
    assert.match(page, /id="figures"/);
    assert.match(page, /id="wages-title"/);
    assert.match(page, /id="unemployment-title"/);
    assert.match(textOf(page), /Key figure 3\.7 ?%/);
    assert.match(textOf(page), /0\.6% for Jun to Aug 2026/);
    assert.match(page, /After inflation \(CPIH-adjusted\)/);
    assert.match(page, /Jun to Aug 2026/);
    assert.match(page, /No change vs May to Jul 2026 \(windows overlap\)/);
    assert.match(page, /Same published window as nominal pay/);
    assert.match(page, /LMS \/ KAI9/);
    assert.match(page, /LMS \/ A2FA/);
    assert.match(page, /Average weekly earnings in Great Britain/);
    const mismatched = structuredClone(data);
    mismatched.metrics.regular_pay_real_growth.latest.reference.start_month = "2026-05";
    const mismatchPage = renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData: mismatched }));
    assert.match(mismatchPage, /Separate window, not directly matched to nominal pay/);

    const missingPrior = structuredClone(data);
    missingPrior.metrics.regular_pay_real_growth.history.at(-2).period = "2026-06";
    const missingPriorPage = renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData: missingPrior }));
    assert.match(missingPriorPage, /A directly comparable previous window is not available/);

    const overview = (source) => renderToStaticMarkup(
      createElement(App, { pathname: "/", initialData: source }),
    );
    const home = overview(data);
    const homeRows = overviewRowsOf(home);
    assert.match(textOf(homeRows.wages), /0\.6% after inflation/);
    assert.doesNotMatch(homeRows.wages, /separate window/);
    assert.match(textOf(homeRows["bank-rate"]), /Not available/);
    assert.deepEqual(Object.keys(homeRows).slice(2, 4).concat(Object.keys(homeRows).at(-1)), ["wages", "unemployment", "gdp"],
      "the homepage subset orders Wages, Unemployment, then GDP");
    assert.match(home, /href="\/jobs-pay#unemployment"/);

    const unemploymentSection = page.slice(page.indexOf('id="unemployment"'));
    assert.match(textOf(unemploymentSection), /Key figure 4\.7 ?%/);
    assert.match(unemploymentSection, /Jun to Aug 2026/);
    assert.match(unemploymentSection, /Labour Force Survey quality update, October 2026/);
    assert.match(unemploymentSection, /LMS \/ MGSX/);
    assert.match(page, /UK residents aged 16 and over, seasonally adjusted/);

    const mismatchedHomeData = structuredClone(data);
    mismatchedHomeData.metrics.regular_pay_real_growth.latest.reference.start_month = "2026-05";
    const mismatchedHome = overview(mismatchedHomeData);
    assert.match(textOf(overviewRowsOf(mismatchedHome).wages), /0\.6% after inflation \(CPIH-adjusted, [A-Za-z]+ to [A-Za-z]+ 2026; separate window, not directly matched to nominal pay\)/);

    const absentRealData = structuredClone(data);
    absentRealData.metrics.regular_pay_real_growth.latest = null;
    assert.match(textOf(overviewRowsOf(overview(absentRealData)).wages), /After inflation: Not available/);
  } finally {
    await server.close();
  }
});
