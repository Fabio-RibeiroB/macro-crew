// The checked-in generation is actual producer output (collect → publish →
// deliver over recorded official fixtures), accepted by the live reader.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  loadVerified,
  parseManifest,
  chartPoints,
  freshness,
  previousReading,
  percent,
} from "../../src/app/data/verified.mjs";
import {
  parseManifest as parseM1Manifest,
  parseDataset as parseM1Dataset,
} from "../fixtures/verified/m1-reader.mjs";

const WIRE = new URL("../fixtures/verified/", import.meta.url);
const bytes = readFileSync(new URL("producer-pay-v1.json", WIRE));
const manifest = JSON.parse(
  readFileSync(new URL("producer-pay-v1.manifest.json", WIRE), "utf8"),
);

function fileFetcher(data, selectedManifest = manifest) {
  return async (url) =>
    url.endsWith("current.json")
      ? { ok: true, json: async () => selectedManifest }
      : {
          ok: true,
          arrayBuffer: async () => data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ),
        };
}

test("DESNZ petrol and diesel render as two weekly UK prices with direct history and source", async () => {
  const fuelBytes = readFileSync(new URL("producer-fuel-v1.json", WIRE));
  const fuelManifest = JSON.parse(readFileSync(new URL("producer-fuel-v1.manifest.json", WIRE), "utf8"));
  const producer = await loadVerified("/", fileFetcher(fuelBytes, fuelManifest));
  const petrol = producer.metrics.petrol_price;
  const diesel = producer.metrics.diesel_price;
  assert.equal(petrol.latest.value, "174.57");
  assert.equal(diesel.latest.value, "199.33");
  assert.equal(petrol.definition.unit, "pence_per_litre");
  assert.equal(petrol.latest.period, "2026-10-19");
  assert.equal(previousReading(petrol).period, "2026-10-12");
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const home = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: producer }));
    const card = [...home.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
      .map(([markup]) => markup).find((markup) => markup.includes("<h2>Petrol &amp; Diesel</h2>"));
    assert.ok(card);
    assert.match(card, /Unleaded petrol/);
    assert.match(card, /174\.57p/);
    assert.match(card, /Change −0\.71p per litre compared with 12 October 2026/);
    assert.match(card, /Diesel/);
    assert.match(card, /199\.33p/);
    assert.match(card, /Change −0\.71p per litre compared with 12 October 2026/);
    assert.match(card, /href="\/prices#petrol-diesel"/);
    const delayed = renderToStaticMarkup(createElement(App, {
      pathname: "/", initialData: { ...producer, metrics: {
        ...producer.metrics,
        petrol_price: { ...petrol, collection_status: "degraded" },
      } },
    }));
    const delayedCard = [...delayed.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
      .map(([markup]) => markup).find((markup) => markup.includes("<h2>Petrol &amp; Diesel</h2>"));
    assert.match(delayedCard, /Update delayed · showing last verified figure/);
    const prices = renderToStaticMarkup(createElement(App, { pathname: "/prices", initialData: producer }));
    assert.match(prices, /id="petrol-diesel"/);
    assert.ok(prices.indexOf('id="petrol-diesel"') < prices.indexOf("<h3>CPI inflation</h3>"),
      "the direct fuel fragment precedes asynchronously populated Prices cards");
    assert.match(prices, /DESNZ Weekly road fuel prices CSV/);
    assert.match(prices, /Monday morning, or the next working morning on a bank holiday/);
    assert.match(prices, /UK average, not a local forecourt quote/);
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const chart = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "UK average unleaded petrol pump price", label: "Unleaded petrol · pence per litre",
      unit: "p", unitDescription: "pence per litre", data: chartPoints(petrol).slice(-3),
    }));
    assert.match(chart, /Exact values in pence per litre/);
    assert.match(chart, /UK average unleaded petrol pump price/);
  } finally { await server.close(); }
});

test("producer output passes the manifest checksum and the full reader contract", async () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
  const data = await loadVerified("/", fileFetcher(bytes));
  assert.deepEqual(
    Object.keys(data.metrics).sort(),
    ["bank_rate", "cpi", "cpih", "gdp", "house_price_growth", "house_price_level", "private_rent_growth", "private_rent_level", "regular_pay_nominal_growth", "regular_pay_real_growth", "unemployment"],
  );
});

test("producer pay-v1 output remains accepted by the deployed M1 reader", () => {
  const deployedView = parseM1Dataset(
    JSON.parse(bytes.toString("utf8")),
    parseM1Manifest(manifest),
  );
  assert.deepEqual(Object.keys(deployedView.metrics).sort(), [
    "bank_rate", "cpi", "cpih", "gdp",
    "house_price_growth", "house_price_level", "private_rent_growth", "private_rent_level",
    "regular_pay_nominal_growth", "regular_pay_real_growth", "unemployment",
  ]);
  assert.equal(deployedView.metrics.bank_rate.latest.value, "3.75");
  assert.equal(deployedView.metrics.cpi.latest.value, "3.5");
  assert.equal(deployedView.metrics.cpih.latest.value, "3.3");
  assert.equal(deployedView.metrics.gdp.latest.value, "0.1");
  assert.equal(deployedView.metrics.unemployment.latest.value, "4.7");
});

test("producer output carries MGSX's labelled window through to the verified reader", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const metric = data.metrics.unemployment;
  assert.equal(metric.latest.period, "2026-08");
  assert.equal(metric.latest.value, "4.7");
  assert.equal(metric.definition.geography, "United Kingdom");
  assert.equal(metric.definition.age_group, "16 and over");
  assert.equal(metric.definition.adjustment, "seasonally_adjusted");
  assert.match(metric.quality_note, /95% confidence intervals remain wider than before the pandemic/);
  assert.equal(metric.quality_source_url, "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/labourforcesurveyqualityupdate/october2026");
  assert.deepEqual(metric.latest.reference, {
    kind: "rolling_months", start_month: "2026-06", end_month: "2026-08",
  });
});

test("producer pay measures preserve exact official identities and full rolling windows", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const nominal = data.metrics.regular_pay_nominal_growth;
  const real = data.metrics.regular_pay_real_growth;
  assert.equal(nominal.definition.series, "KAI9");
  assert.equal(real.definition.series, "A2FA");
  assert.equal(real.definition.deflator, "CPIH");
  assert.deepEqual(nominal.latest.reference, {
    kind: "rolling_months", start_month: "2026-06", end_month: "2026-08",
  });
  assert.deepEqual(nominal.latest.reference, real.latest.reference);
  assert.equal(nominal.latest.value, "3.7");
  assert.equal(real.latest.value, "0.6");
});

test("validated CPI carries its exact definition, release date and history", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const cpi = data.metrics.cpi;
  assert.equal(cpi.latest.value, "3.5");
  assert.equal(cpi.latest.period, "2026-09");
  assert.equal(cpi.definition.series, "D7G7");
  assert.equal(cpi.definition.dataset, "MM23");
  assert.equal(cpi.definition.geography, "United Kingdom");
  assert.equal(cpi.source_published_date, "2026-10-21");
  assert.equal(cpi.next_release_date, "2026-11-18");
  assert.equal(cpi.source_download_url.endsWith("/timeseries/d7g7/mm23/data"), true);
  assert.equal(cpi.history.length, 17);
  assert.equal(percent(cpi.latest.value), "3.5%");
});

test("producer PIPR data preserves UK geography, workbook identity and distinct units", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const growth = data.metrics.private_rent_growth;
  const level = data.metrics.private_rent_level;
  assert.equal(growth.latest.period, "2026-09");
  assert.equal(growth.latest.value, "3.8");
  assert.equal(level.latest.value, "1406");
  assert.equal(growth.source_published_date, "2026-10-21");
  assert.equal(level.source_published_date, "2026-10-21");
  assert.equal(growth.definition.area_code, "K02000001");
  assert.equal(level.definition.geography, "United Kingdom");
  assert.equal(growth.definition.unit, "percent");
  assert.equal(level.definition.unit, "GBP_per_month");
  assert.match(growth.source_download_url, /21october2026/);
  assert.equal(growth.definition.release_caveat, "UK latest two months provisional; Northern Ireland latest two months imputed");
  assert.deepEqual(chartPoints(growth).slice(-2).map((point) => point.value), [3.8, 3.8]);
  assert.equal(chartPoints(level).at(-1).value, 1406);
});

test("producer UK HPI output carries release, reference, geography and independent chart units", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const level = data.metrics.house_price_level;
  const growth = data.metrics.house_price_growth;
  assert.equal(level.latest.period, "2026-08");
  assert.equal(level.latest.value, "273037");
  assert.equal(growth.latest.period, level.latest.period);
  assert.equal(growth.latest.value, "0.9");
  assert.equal(level.source_published_date, "2026-10-21");
  assert.equal(growth.source_download_url, level.source_download_url);
  assert.equal(level.definition.geography, "United Kingdom");
  assert.equal(level.definition.area_code, "K02000001");
  assert.equal(level.definition.unit, "GBP");
  assert.equal(growth.definition.unit, "percent");
  assert.equal(level.history.length, growth.history.length);
  assert.ok(level.history.length >= 60);
});

test("Housing renders a national house-price card and separate pounds and percentage charts", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const producer = await loadVerified("/", fileFetcher(bytes));
    const html = renderToStaticMarkup(createElement(App, { pathname: "/housing", initialData: producer }));
    assert.match(html, /id="house-prices"/);
    assert.match(html, /House prices/);
    assert.match(html, /£273,037/);
    assert.match(html, /Annual change in average house prices/);
    assert.match(html, /class="fs-number">0\.9%/);
    assert.match(html, /Source release date: 2026-10-21/);
    assert.equal((html.match(/class="fs-number">£273,037/g) || []).length, 1);
    assert.doesNotMatch(html, /Annual change: 0\.9%/);
    assert.doesNotMatch(html, /percentage points compared with July 2026/);
    assert.match(html, /Recent observations are provisional and subject to revision/);
    const home = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: producer }));
    const visibleCards = [...home.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
      .map(([card]) => card.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, ""));
    const houseCard = visibleCards.find((card) => card.includes("<h2>House prices</h2>"));
    assert.ok(houseCard, "the house-price homepage card is present");
    assert.match(houseCard, /Annual change: 0\.9% for August 2026/);
    assert.doesNotMatch(houseCard, /<details/);
    const rentCard = visibleCards.find((card) => card.includes("<h2>Rent</h2>"));
    assert.match(rentCard, /Average monthly rent: £1,406 in September 2026/);
    assert.match(rentCard, /<span>Unchanged<\/span> compared with August 2026/);
    const delayedGrowth = { ...producer.metrics.house_price_growth, collection_status: "degraded" };
    const missingLevelHome = renderToStaticMarkup(createElement(App, {
      pathname: "/",
      initialData: { ...producer, metrics: { ...producer.metrics, house_price_level: null, house_price_growth: delayedGrowth } },
    }));
    const missingLevelCard = [...missingLevelHome.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
      .map(([card]) => card.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, ""))
      .find((card) => card.includes("<h2>House prices</h2>"));
    assert.match(missingLevelCard, /Not available/);
    assert.match(missingLevelCard, /Annual change: 0\.9% for August 2026 · update delayed; last verified figure shown/);
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const pounds = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "Average house price", label: "Average house price", unit: "£",
      unitDescription: "pounds",
      data: chartPoints(producer.metrics.house_price_level).slice(-2),
    }));
    const percentChart = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "Annual change", label: "Annual change", unit: "%",
      data: chartPoints(producer.metrics.house_price_growth).slice(-2),
    }));
    assert.match(pounds, /Exact values in pounds\./);
    assert.doesNotMatch(pounds, /Exact values in pounds per month/);
    assert.match(percentChart, /Exact values in percent/);
    assert.doesNotMatch(pounds, /0\.9%/);
    assert.doesNotMatch(percentChart, /£273,037/);

    const levelUnavailable = { ...producer.metrics.house_price_level, latest: null, history: [], collection_status: "unavailable" };
    const growthDelayed = { ...producer.metrics.house_price_growth, collection_status: "degraded" };
    const partial = renderToStaticMarkup(createElement(App, {
      pathname: "/housing",
      initialData: { ...producer, metrics: { ...producer.metrics, house_price_level: levelUnavailable, house_price_growth: growthDelayed } },
    }));
    assert.match(partial, /House prices/);
    assert.match(partial, /class="fs-number">Not available/);
    assert.match(partial, /class="fs-number">0\.9%/);
    assert.match(partial, /Source release date: 2026-10-21/);
    assert.match(partial, /delayed/i);
  } finally { await server.close(); }
});

test("Housing renders real producer rent values and keeps growth visible through level failures", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const producer = await loadVerified("/", fileFetcher(bytes));
    const html = (metrics) => renderToStaticMarkup(createElement(App, {
      pathname: "/housing",
      initialData: { ...producer, metrics },
    }));

    const current = html(producer.metrics);
    assert.match(current, /id="rent"/);
    assert.match(current, /UK private rent · annual growth/);
    assert.match(current, /class="fs-number">3\.8%/);
    assert.match(current, /<span>Unchanged<\/span> compared with August 2026/);
    assert.match(current, /Average monthly private rent/);
    assert.match(current, /class="fs-number">£1,406/);

    const { HistoricalTrendCard } = await server.ssrLoadModule(
      "/src/app/components/HistoricalTrendCard.tsx",
    );
    const growthChart = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "Annual private-rent growth", label: "Annual rent growth", unit: "%",
      data: chartPoints(producer.metrics.private_rent_growth).slice(-2),
    }));
    assert.match(growthChart, /Exact values in percent/);
    assert.equal((growthChart.match(/<td>3\.8%<\/td>/g) || []).length, 2);

    const delayed = html({
      ...producer.metrics,
      private_rent_level: {
        ...producer.metrics.private_rent_level,
        collection_status: "degraded",
      },
    });
    assert.match(delayed, /id="rent"/);
    assert.match(delayed, /class="fs-number">3\.8%/);
    assert.match(delayed, /class="fs-number">£1,406/);
    assert.match(delayed, /Update delayed/);

    const absent = html({
      ...producer.metrics,
      private_rent_level: {
        ...producer.metrics.private_rent_level,
        latest: null,
        history: [],
        validation_status: "unavailable",
        collection_status: "unavailable",
      },
    });
    assert.match(absent, /id="rent"/);
    assert.match(absent, /class="fs-number">3\.8%/);
    assert.match(absent, /class="fs-number">Not available/);
  } finally {
    await server.close();
  }
});

test("the previous-reference-month comparison is a percentage-point change", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const cpi = data.metrics.cpi;
  const previous = previousReading(cpi);
  assert.equal(previous.period, "2026-08");
  assert.equal(previous.value, "3.1");
  assert.ok(
    Math.abs(Number(cpi.latest.value) - Number(previous.value) - 0.4) < 1e-9,
  );
});

test("recorded CPI gaps stay visible and never become zeros", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  const points = chartPoints(data.metrics.cpi);
  const byDate = Object.fromEntries(points.map((p) => [p.date, p.value]));
  assert.equal(byDate["2025-01"], 3.0);
  assert.equal(byDate["2025-02"], null); // Absent month stays a gap.
  assert.equal(byDate["2025-03"], 2.6);
  assert.equal(byDate["2026-09"], 3.5);
  assert.ok(!points.some((p) => p.value === 0));
});

test("CPIH and the core metrics are retained unchanged alongside CPI", async () => {
  const data = await loadVerified("/", fileFetcher(bytes));
  assert.equal(data.metrics.cpih.latest.value, "3.3");
  assert.equal(data.metrics.cpih.definition.series, "L55O");
  assert.equal(data.metrics.gdp.latest.value, "0.1");
  assert.equal(data.metrics.bank_rate.latest.value, "3.75");
  assert.notEqual(data.metrics.cpih.definition.series, data.metrics.cpi.definition.series);
});

test("a produced generation with unavailable CPI stays a valid absence", async () => {
  const produced = JSON.parse(bytes.toString());
  produced.metrics.cpi = {
    ...produced.metrics.cpi,
    validation_status: "unavailable",
    latest: null,
    history: [],
  };
  const { parseDataset } = await import("../../src/app/data/verified.mjs");
  const parsed = parseDataset(produced, parseManifest(manifest));
  assert.equal(parsed.metrics.cpi.latest, null);
  assert.deepEqual(parsed.metrics.cpi.history, []);
  assert.equal(freshness(parsed.metrics.cpi).label, "Unavailable");
  assert.equal(parsed.metrics.cpih.latest.value, "3.3");
});
