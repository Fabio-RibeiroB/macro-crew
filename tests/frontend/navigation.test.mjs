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
    ["Overview", "Prices", "Economy", "Jobs & Pay", "Housing", "Government"],
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
    ["/", "/prices", "/economy", "/jobs-pay", "/housing", "/government-budget", "/about", "/sources"],
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
    const visibleOverviewCards = [...overview.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
      .map(([card]) => card.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, ""))
      .join("\n");
    assert.match(overview, /class="fs-number">3\.5%/);
    assert.match(overview, /class="fs-number">4\.5%/);
    assert.match(visibleOverviewCards, /Latest evidenced change: \+1\.1 percentage points at the 20 October 2026 observation/);
    assert.match(overview, /About Inflation \(CPIH\)/);
    assert.match(overview, /See Inflation \(CPIH\) details/);
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
    server: { middlewareMode: true },
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
    assert.match(prices, /<h3>CPI inflation<\/h3>/);
    assert.match(prices, /<h3>Inflation \(CPIH\)<\/h3>/);
    assert.match(prices, /CPI · change over 12 months/);
    assert.match(prices, /CPIH · change over 12 months/);
    assert.match(prices, /\+0\.4 percentage points/);
    assert.match(prices, /compared with August 2026/);
    assert.match(prices, /MM23 \/ D7G7/);
    assert.match(prices, /MM23 \/ L55O/);
    assert.match(prices, /<h3>CPI and CPIH<\/h3>/);
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
    assert.match(overview, /<h2>CPI inflation<\/h2>/);
    assert.match(overview, /About CPI inflation/);
    assert.match(overview, /See CPI inflation details/);
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
    assert.doesNotMatch(fallback, /<h3>CPI inflation<\/h3>/);
    assert.match(fallback, /<h3>Inflation \(CPIH\)<\/h3>/);
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
    assert.match(degradedPrices, /<h3>CPI inflation<\/h3>/);
    assert.match(degradedPrices, /Update delayed · showing last verified figure/);
  } finally {
    await server.close();
  }
});

test("Jobs & Pay renders official nominal and independently dated CPIH real pay", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const data = JSON.parse(readFileSync(new URL("../fixtures/verified/v1-with-optional.json", import.meta.url), "utf8"));
    const page = renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData: data }));
    assert.match(page, /href="\/jobs-pay"[^>]*aria-current="page"/);
    const wagesStart = page.indexOf('id="wages"');
    const nominalValue = page.indexOf('class="fs-number">3.7%', wagesStart);
    const realValue = page.indexOf('class="fs-number">0.6%', wagesStart);
    assert.ok(wagesStart >= 0 && nominalValue > wagesStart && realValue > nominalValue,
      "the #wages target contains the primary nominal figure before the real-pay detail");
    assert.match(page, /id="figures" class="fs-anchor-alias"/);
    const wagesSection = page.slice(wagesStart, page.indexOf('id="unemployment"'));
    const unemploymentSection = page.slice(page.indexOf('id="unemployment"'));
    assert.match(wagesSection, /id="wages-title"/);
    assert.match(wagesSection, /aria-labelledby="wages-title"/);
    assert.match(unemploymentSection, /id="unemployment-title"/);
    assert.match(unemploymentSection, /aria-labelledby="unemployment-title"/);
    assert.match(page, /3\.7%/);
    assert.match(page, /0\.6%/);
    assert.match(page, /Official annual growth, adjusted using CPIH/);
    assert.match(page, /June 2026 to August 2026/);
    assert.match(page, /Unchanged \(0 percentage points\) compared with May 2026 to July 2026; current window June 2026 to August 2026\. These published three-month windows overlap\./);
    assert.match(page, /Secondary context for the same nominal-pay window/);
    assert.match(page, /KAI9 \/ LMS/);
    assert.match(page, /A2FA \/ LMS/);
    assert.match(page, /Average weekly earnings in Great Britain bulletin/);
    const mismatched = structuredClone(data);
    mismatched.metrics.regular_pay_real_growth.latest.reference.start_month = "2026-05";
    const mismatchPage = renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData: mismatched }));
    assert.match(mismatchPage, /Its window differs from nominal pay/);

    const missingPrior = structuredClone(data);
    missingPrior.metrics.regular_pay_real_growth.history.at(-2).period = "2026-06";
    const missingPriorPage = renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData: missingPrior }));
    assert.match(missingPriorPage, /A directly comparable previous CPIH-adjusted published window is not available/);

    const overview = (source) => renderToStaticMarkup(
      createElement(App, { pathname: "/", initialData: source }),
    );
    const home = overview(data);
    const homeVisibleCards = [...home.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
      .map(([card]) => card.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, ""));
    const homeVisible = homeVisibleCards.join("\n");
    const payCardAt = homeVisible.indexOf("<h2>Regular pay growth</h2>");
    const realContextAt = homeVisible.indexOf("Official CPIH-adjusted regular pay: 0.6%", payCardAt);
    assert.ok(realContextAt > payCardAt);
    assert.match(homeVisible.slice(realContextAt, realContextAt + 260), /Great Britain|same published window/);
    assert.match(homeVisible, /The last rate change cannot be established from the available history/);
    assert.ok(home.indexOf("Regular pay growth") < home.indexOf(">GDP</h2>"),
      "the Wages card precedes GDP in the homepage subset");
    const unemploymentAt = home.indexOf(">Unemployment</h2>");
    const gdpAt = home.indexOf(">GDP</h2>");
    assert.ok(unemploymentAt > payCardAt && gdpAt > unemploymentAt,
      "the homepage subset orders Wages, Unemployment, then GDP");
    assert.match(home, /href="\/jobs-pay#unemployment"/);

    const unemploymentStart = page.indexOf('id="unemployment"');
    assert.ok(unemploymentStart >= 0);
    const unemploymentValue = page.indexOf('class="fs-number">4.7%', unemploymentStart);
    const unemploymentChart = page.indexOf("Loading chart…", unemploymentStart);
    const qualityLink = page.indexOf("Labour Force Survey quality update, October 2026", unemploymentStart);
    const sourceDetails = page.indexOf("ONS unemployment rate series, MGSX / LMS", unemploymentStart);
    assert.ok(unemploymentValue > unemploymentStart && unemploymentChart > unemploymentValue && qualityLink > unemploymentChart && sourceDetails > qualityLink,
      "the direct anchor contains the value, chart, dated quality caution and source");
    assert.match(page, /June 2026 to August 2026/);
    assert.match(page, /compared with May 2026 to July 2026/);
    assert.match(page, /UK residents aged 16 and over · seasonally adjusted/);

    const mismatchedHomeData = structuredClone(data);
    mismatchedHomeData.metrics.regular_pay_real_growth.latest.reference.start_month = "2026-05";
    const mismatchedHome = overview(mismatchedHomeData);
    assert.match(mismatchedHome, /Official CPIH-adjusted regular pay: 0\.6%[\s\S]{0,200}separate window, not directly matched/);

    const absentRealData = structuredClone(data);
    absentRealData.metrics.regular_pay_real_growth.latest = null;
    assert.match(overview(absentRealData), /Official CPIH-adjusted regular pay is currently unavailable/);
  } finally {
    await server.close();
  }
});
