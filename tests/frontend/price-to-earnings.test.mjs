// ONS house price to workplace-based earnings ratio (spec M11 slice 2, issue #135):
// annual, England and Wales. Optional: absent or unavailable means the section is hidden.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fullFixture, textOf } from "./overview-helpers.mjs";
import { OPTIONAL_METRICS, chartPoints, formatPeriod, parseDataset, parseManifest, previousReading } from "../../src/app/data/verified.mjs";
import { filterChartRange } from "../../src/app/data/chartRange.mjs";

const WIRE = new URL("../fixtures/verified/", import.meta.url);
const producer = () => JSON.parse(readFileSync(new URL("producer-fuel-v1.json", WIRE), "utf8"));
const manifest = () => parseManifest(JSON.parse(readFileSync(new URL("producer-fuel-v1.manifest.json", WIRE), "utf8")));
const clone = (value) => structuredClone(value);

function housingData() {
  const data = fullFixture();
  data.metrics.price_to_earnings = producer().metrics.price_to_earnings;
  return data;
}

async function renderHousing(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/housing", initialData }));
  } finally { await server.close(); }
}
const section = (html, id) => {
  const start = html.indexOf(`<section class="fs-block" id="${id}"`);
  assert.ok(start >= 0, `${id} section exists`);
  return html.slice(start, html.indexOf("</section>", start));
};

test("the reader accepts the producer's annual England and Wales ratio and keeps it optional", () => {
  const data = producer();
  parseDataset(data, manifest());
  const ratio = data.metrics.price_to_earnings;
  assert.equal(ratio.definition.geography, "England and Wales");
  assert.equal(ratio.definition.frequency, "annual");
  assert.equal(ratio.definition.unit, "ratio");
  assert.equal(ratio.latest.period, "2025");
  assert.equal(ratio.latest.value, "7.55");
  assert.equal(ratio.history.length, 29);
  assert.equal(ratio.history[0].period, "1997");
  assert.equal(ratio.source_published_date, "2026-03-26");
  assert.ok("price_to_earnings" in OPTIONAL_METRICS);
  delete data.metrics.price_to_earnings;
  parseDataset(data, manifest());
});

test("the reader isolates a ratio that drifts from its registered definition or provenance", () => {
  const cases = {
    "wrong geography": (d) => { d.definition.geography = "United Kingdom"; },
    "wrong unit": (d) => { d.definition.unit = "percent"; },
    "lower quartile series": (d) => { d.definition.series = "Table 2c"; },
    "monthly frequency": (d) => { d.definition.frequency = "monthly"; },
    "monthly period": (d) => { d.history.at(-1).period = "2025-03"; d.latest.period = "2025-03"; },
    "unordered years": (d) => { d.history.at(-1).period = "2020"; d.latest.period = "2020"; },
    "workbook from another dataset": (d) => { d.source_download_url = "https://www.ons.gov.uk/file?uri=/economy/other/current/aff1.xlsx"; },
    "workbook on another host": (d) => { d.source_download_url = d.source_download_url.replace("www.ons.gov.uk", "example.com"); },
    "fixture promoted": (d) => { d.snapshot_evidence_kind = "recorded_fixture"; },
    "card and chart disagree": (d) => { d.latest.value = "9.99"; },
    "unit-less value": (d) => { d.history.at(-1).value = "seven"; d.latest.value = "seven"; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const data = producer();
    mutate(data.metrics.price_to_earnings);
    const parsed = parseDataset(data, manifest());
    const ratio = parsed.metrics.price_to_earnings;
    assert.equal(ratio.verification_rejected, true, label);
    assert.equal(ratio.latest, null, label);
    assert.deepEqual(ratio.history, [], label);
    assert.equal(parsed.metrics.cpih.validation_status, "verified", label);
  }
});

test("annual periods read as years, in labels and in the chart range filter", () => {
  assert.equal(formatPeriod("2025"), "2025");
  const points = chartPoints(producer().metrics.price_to_earnings);
  assert.equal(points.length, 29);
  assert.equal(points[0].date, "1997");
  assert.equal(points.at(-1).value, 7.55);
  const five = filterChartRange(points, "5Y");
  assert.deepEqual(five.points.map((p) => p.date), ["2020", "2021", "2022", "2023", "2024", "2025"]);
  assert.equal(five.notice, null);
  const all = filterChartRange(points, "All");
  assert.equal(all.points.length, 29);
  const short = filterChartRange(points.slice(-3), "10Y");
  assert.match(short.notice, /Showing 2023 to 2025\. Less history is available than 10 years\./);
});

test("Housing shows the ratio as a key figure with its geography, year and history", async () => {
  const html = await renderHousing(housingData());
  const block = section(html, "price-to-earnings");
  const labels = [...block.matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);
  assert.deepEqual(labels, ["Key figure", "What it means", "Chart", "Sources"]);
  const text = textOf(block);
  assert.match(text, /Key figure 7\.55 times earnings/);
  assert.match(text, /Official figure · Office for National Statistics/);
  assert.match(text, /Previous 7\.74 times earnings 2024/);
  assert.match(text, /Change\* ↓ Down −0\.19 times/);
  assert.match(text, /Year 2025/);
  assert.match(text, /England and Wales only/);
  assert.match(text, /year ending September 2025 and earnings in April 2025/);
  assert.match(text, /provisional/);
  // #149: the ratio's median price is distinct from the UK HPI average price.
  assert.match(text, /median house price divided by median gross annual workplace-based earnings/);
  assert.match(text, /not comparable with the UK House Price Index average price above/);
  assert.match(textOf(section(html, "house-prices")), /ratio below uses the median price paid in England and Wales, which is a different measure/);
  assert.match(text, /Table 1c/);
  assert.match(text, /Official release 26 March 2026/);
  assert.match(text, /29 observations, 1997 to 2025/);
  assert.match(block, /href="https:\/\/www\.ons\.gov\.uk\/peoplepopulationandcommunity\/housing\/datasets\/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian"/);
  assert.ok(text.indexOf("Chart Loading chart") > text.indexOf("What it means"));
  assert.ok(text.indexOf("Chart Loading chart") < text.indexOf("Sources"));
  assert.match(html, /<h2 id="price-to-earnings-title">House price to earnings<\/h2>/);
  assert.doesNotMatch(block, /<h[12][^>]*>[^<]*\bUK\b/, "the England and Wales ratio is never headed UK");
  assert.doesNotMatch(text, /Key figure[^.]*\bUK\b/);
  // The established sections and their order are unchanged.
  assert.ok(html.indexOf('id="rent"') < html.indexOf('id="house-prices"'));
  assert.ok(html.indexOf('id="house-prices"') < html.indexOf('id="price-to-earnings"'));
  assert.match(textOf(section(html, "house-prices")), /Key figure £273,037/);
});

test("the section is listed under On this page, and only when it renders", async () => {
  const withRatio = await renderHousing(housingData());
  const nav = withRatio.slice(withRatio.indexOf('aria-label="On this page"'));
  assert.match(nav.slice(0, nav.indexOf("</nav>")), /href="#price-to-earnings">House price to earnings<\/a>/);
  const without = fullFixture();
  const html = await renderHousing(without);
  assert.doesNotMatch(html, /price-to-earnings/);
  const contents = html.slice(html.indexOf('aria-label="On this page"'));
  assert.match(contents.slice(0, contents.indexOf("</nav>")), /href="#house-prices"/);
});

test("an absent or unavailable ratio is hidden, never shown as zero", async () => {
  const unavailable = housingData();
  unavailable.metrics.price_to_earnings = {
    ...unavailable.metrics.price_to_earnings, latest: null, history: [],
    collection_status: "unavailable", validation_status: "unavailable",
  };
  for (const data of [fullFixture(), unavailable]) {
    const html = await renderHousing(data);
    assert.doesNotMatch(html, /House price to earnings|price-to-earnings|times earnings/);
    assert.match(textOf(section(html, "house-prices")), /Key figure £273,037/);
  }
  assert.doesNotMatch(await renderHousing(null), /price-to-earnings/);
});

test("a missing previous year leaves Previous and Change unavailable instead of inventing them", async () => {
  const data = housingData();
  const ratio = data.metrics.price_to_earnings;
  const previous = ratio.history.at(-2);
  previous.value = null;
  previous.status = "missing";
  assert.equal(previousReading(ratio), null);
  const text = textOf(section(await renderHousing(data), "price-to-earnings"));
  assert.match(text, /Key figure 7\.55 times earnings/);
  assert.match(text, /Previous Not available Change\* Not available/);
  assert.doesNotMatch(text, /Change\* [+−]?0/);
  // The chart keeps the break rather than interpolating it.
  assert.equal(chartPoints(ratio).at(-2).value, null);
  const skipped = clone(housingData().metrics.price_to_earnings);
  skipped.history.splice(-2, 1);
  assert.equal(previousReading(skipped), null);
});

test("a delayed update keeps the last verified ratio with a visible warning", async () => {
  const data = housingData();
  data.metrics.price_to_earnings.collection_status = "degraded";
  const text = textOf(section(await renderHousing(data), "price-to-earnings"));
  assert.match(text, /Key figure 7\.55 times earnings/);
  assert.match(text, /Update delayed · showing last verified figure/);
});

test("the ratio chart opens on the whole annual history with exact two-decimal values", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { HistoricalTrendCard: Card } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const { HousingPage } = await server.ssrLoadModule("/src/app/components/HousingPage.tsx");
    const ratio = housingData().metrics.price_to_earnings;
    const props = {
      title: "House price to earnings ratio, England and Wales", label: "Median house price ÷ median earnings",
      unit: "×", unitDescription: "times annual earnings (ratio)", data: chartPoints(ratio), defaultRange: "All",
    };
    const markup = renderToStaticMarkup(createElement(Card, props));
    assert.match(markup, /Exact values \(29\)/);
    assert.match(markup, /Exact values in times annual earnings \(ratio\)/);
    assert.match(markup, /<td>1997<\/td><td>3\.55×<\/td>/);
    assert.match(markup, /<td>2025<\/td><td>7\.55×<\/td>/);
    assert.match(markup, /Latest: 7\.55×, 2025/);
    assert.match(markup, /aria-checked="true"[^>]*data-range="All"/);
    // Without the opt-in the established five-year default is unchanged.
    assert.match(renderToStaticMarkup(createElement(Card, { ...props, defaultRange: undefined })), /Exact values \(6\)/);
    const page = renderToStaticMarkup(createElement(HousingPage, {
      data: housingData(), loading: false, error: null, refresh() {}, HistoricalTrendCard: Card,
    }));
    assert.match(page, /Exact values \(29\)/);
    assert.match(page, /House price to earnings ratio, England and Wales/);
  } finally { await server.close(); }
});

test("the ratio's What it means keeps a short answer and moves the method into a MoreDetail (ADR 0004)", async () => {
  const block = section(await renderHousing(housingData()), "price-to-earnings");
  const cell = />What it means<\/h3><div[^>]*>([\s\S]*?)<\/div><\/div><div class="fs-row"/.exec(block)[1];
  assert.match(cell, /<details class="fs-more">/);
  const visible = textOf(cell.replace(/<details[\s\S]*?<\/details>/g, ""));
  assert.match(visible, /England and Wales/);
  assert.doesNotMatch(visible, /median|provisional/);
  assert.match(textOf(cell), /not comparable with the UK House Price Index average price above/);
});
