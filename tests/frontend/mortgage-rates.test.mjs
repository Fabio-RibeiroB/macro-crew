// Housing "Mortgage rates" (issue #136): Bank of England quoted 2-year and 5-year fixed
// rates at 75% LTV, Bank Rate for context. The members are optional: when they are
// absent or unavailable the section and its contents link are hidden and the rest of
// Housing is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fullFixture, textOf } from "./overview-helpers.mjs";
import { parseDataset } from "../../src/app/data/verified.mjs";
import {
  MORTGAGE_BASIS,
  bankRateMonthEnd,
  hasMortgageRates,
  mortgageChart,
  mortgageFigureRow,
  mortgageMetrics,
} from "../../src/app/data/mortgageRates.mjs";

const WIRE = new URL("../fixtures/verified/", import.meta.url);
const producer = () => JSON.parse(readFileSync(new URL("producer-fuel-v1.json", WIRE), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const withMortgages = () => {
  const data = fullFixture();
  const fuel = producer();
  data.metrics.mortgage_2y_fixed_75 = fuel.metrics.mortgage_2y_fixed_75;
  data.metrics.mortgage_5y_fixed_75 = fuel.metrics.mortgage_5y_fixed_75;
  return data;
};
const unavailable = (metric) => ({ ...metric, validation_status: "unavailable", latest: null, history: [] });

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
const contents = (html) => {
  const start = html.indexOf('<nav class="fs-contents"');
  return start < 0 ? "" : textOf(html.slice(start, html.indexOf("</nav>", start)));
};

test("the recorded producer output carries both mortgage rates through the strict reader contract", () => {
  const dataset = producer();
  const manifest = { generation_id: dataset.generation_id, published_at: dataset.published_at };
  assert.doesNotThrow(() => parseDataset(dataset, manifest));
  const two = dataset.metrics.mortgage_2y_fixed_75;
  const five = dataset.metrics.mortgage_5y_fixed_75;
  assert.equal(two.definition.series, "IUMBV34");
  assert.equal(five.definition.series, "IUMBV42");
  assert.equal(two.history.length, 382);
  assert.equal(two.history[0].period, "1995-01");
  assert.deepEqual(two.latest, { period: "2026-10", value: "5.39", status: "observed" });
  assert.deepEqual(five.latest, { period: "2026-10", value: "5.19", status: "observed" });
});

test("the reader isolates a mortgage member whose qualification, series or source drifted", () => {
  const reject = (edit) => {
    const dataset = producer();
    edit(dataset.metrics.mortgage_2y_fixed_75);
    const parsed = parseDataset(dataset, { generation_id: dataset.generation_id, published_at: dataset.published_at });
    const bad = parsed.metrics.mortgage_2y_fixed_75;
    assert.equal(bad.verification_rejected, true);
    assert.equal(bad.latest, null);
    assert.deepEqual(bad.history, []);
    assert.equal(bad.definition.ltv, 75);
    assert.equal(parsed.metrics.mortgage_5y_fixed_75.latest !== null, true);
    assert.equal(parsed.metrics.cpih.validation_status, "verified");
  };
  reject((m) => { m.definition.ltv = 85; });
  reject((m) => { m.definition.fixed_years = 5; });
  reject((m) => { delete m.definition.ltv; });
  reject((m) => { m.definition.extra = "x"; });
  reject((m) => { m.definition.series = "IUMBV42"; });
  reject((m) => { m.definition.unit = "GBP"; });
  reject((m) => { m.definition.frequency = "daily"; });
  reject((m) => { m.definition.geography = "Great Britain"; });
  reject((m) => { m.source_download_url = "https://www.bankofengland.co.uk/boeapps/database/other.csv"; });
  reject((m) => { m.history.at(-1).period = "2026-10-31"; m.latest.period = "2026-10-31"; });
  reject((m) => { m.latest.value = "5.40"; });
});

test("an unavailable mortgage member is accepted by the reader and carries no values", () => {
  const dataset = producer();
  dataset.metrics.mortgage_2y_fixed_75 = unavailable(dataset.metrics.mortgage_2y_fixed_75);
  assert.doesNotThrow(() => parseDataset(dataset, { generation_id: dataset.generation_id, published_at: dataset.published_at }));
});

test("key figures show the rate, the previous month and the change in percentage points", () => {
  const data = withMortgages();
  const two = mortgageFigureRow(data.metrics.mortgage_2y_fixed_75);
  assert.deepEqual(two.latest, [{ text: "5.39%" }]);
  assert.deepEqual(two.previous, [{ text: "5.13%" }, { text: "Sep 2026", sub: true }]);
  assert.deepEqual(two.change, [{ text: "+0.26 pp", direction: "up" }]);
  assert.deepEqual(two.period, [{ text: "Oct 2026" }]);
  const five = mortgageFigureRow(data.metrics.mortgage_5y_fixed_75);
  assert.deepEqual(five.change, [{ text: "+0.21 pp", direction: "up" }]);
});

test("a fall is signed, an unchanged rate says so and a non-adjacent previous month is not compared", () => {
  const fall = withMortgages().metrics.mortgage_2y_fixed_75;
  fall.history.at(-2).value = "5.50";
  assert.deepEqual(mortgageFigureRow(fall).change, [{ text: "−0.11 pp", direction: "down" }]);
  const flat = withMortgages().metrics.mortgage_2y_fixed_75;
  flat.history.at(-2).value = "5.39";
  assert.deepEqual(mortgageFigureRow(flat).change, [{ text: "No change", direction: "flat" }]);
  const gap = withMortgages().metrics.mortgage_2y_fixed_75;
  gap.history.splice(-2, 1);
  const row = mortgageFigureRow(gap);
  assert.equal(row.change[0].missing, true);
  assert.equal(row.previous[0].missing, true);
  assert.equal(row.change[0].text, "Not available");
  assert.doesNotMatch(JSON.stringify(row), /"text":"0(\.0+)?%"/);
});

test("the chart joins both rates to Bank Rate by month and leaves absent months as null, never zero", () => {
  const data = withMortgages();
  const chart = mortgageChart(data);
  assert.deepEqual(chart.series.map((line) => line.key), ["mortgage_2y_fixed_75", "mortgage_5y_fixed_75", "bank_rate"]);
  assert.equal(chart.rows.length, 382);
  assert.deepEqual(chart.rows.at(-1), { date: "2026-10", mortgage_2y_fixed_75: 5.39, mortgage_5y_fixed_75: 5.19, bank_rate: 3.75 });
  // Bank Rate is only present in the recorded export from January 2026: before that it is null.
  assert.equal(chart.rows[0].bank_rate, null);
  assert.equal(chart.rows[0].mortgage_2y_fixed_75, 8.13);
  assert.ok(chart.rows.every((row) => row.mortgage_2y_fixed_75 !== 0 && row.bank_rate !== 0));
  // A missing mortgage month stays a gap.
  const gappy = clone(data);
  gappy.metrics.mortgage_2y_fixed_75.history.splice(-3, 1);
  const rows = mortgageChart(gappy).rows;
  assert.equal(rows.length, 382);
  assert.equal(rows.find((row) => row.date === "2026-08").mortgage_2y_fixed_75, null);
  assert.equal(rows.find((row) => row.date === "2026-08").mortgage_5y_fixed_75, 4.78);
});

test("Bank Rate is read as its last figure in each month and a missing Bank Rate drops the line", () => {
  const byMonth = bankRateMonthEnd({ history: [
    { period: "2026-01-30", value: "3.75" }, { period: "2026-02-02", value: "3.75" },
    { period: "2026-02-05", value: "3.5" }, { period: "2026-02-27", value: "3.5" }, { period: "2026-02-28", value: null },
  ] });
  assert.deepEqual([...byMonth], [["2026-01", 3.75], ["2026-02", 3.5]]);
  const data = withMortgages();
  data.metrics.bank_rate = unavailable(data.metrics.bank_rate);
  assert.deepEqual(mortgageChart(data).series.map((line) => line.key), ["mortgage_2y_fixed_75", "mortgage_5y_fixed_75"]);
});

test("Housing shows the Mortgage rates section with the quoted-rate label, both figures and the contents link", async () => {
  const html = await renderHousing(withMortgages());
  const block = section(html, "mortgage-rates");
  const labels = [...block.matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);
  assert.deepEqual(labels, ["Key figure", "What it means", "Chart", "Sources"]);
  const text = textOf(block);
  assert.match(text, /Mortgage rates Key figure/);
  assert.equal(text.split(MORTGAGE_BASIS).length > 2, true, "the basis is stated for each rate");
  assert.match(text, /2-year fixed Bank of England quoted rates, 75% loan-to-value, new mortgages 5\.39 ?%/);
  assert.match(text, /Previous 5\.13 ?% Sep 2026/);
  assert.match(text, /Change\* ↑ Up \+0\.26 pp/);
  assert.match(text, /5-year fixed Bank of England quoted rates, 75% loan-to-value, new mortgages 5\.19 ?%/);
  assert.match(text, /Previous 4\.98 ?% Sep 2026/);
  assert.match(text, /Change\* ↑ Up \+0\.21 pp/);
  assert.match(text, /Month Oct 2026/);
  assert.match(text, /Official figure · Bank of England/);
  assert.match(text, /They are averages, not offers/);
  assert.match(text, /Bank Rate, the Bank of England policy rate, is drawn for context/);
  assert.match(text, /IUMBV34 and IUMBV42/);
  assert.match(text, /IADB \/ IUMBV34/);
  assert.match(text, /IADB \/ IUMBV42/);
  assert.match(text, /Chart Loading chart/, "the trend chart is lazy, so server rendering shows its loading state");
  assert.ok(text.indexOf("What it means") < text.indexOf("Chart Loading chart"));
  assert.ok(text.indexOf("Chart Loading chart") < text.indexOf("Sources"));
  assert.doesNotMatch(text, /repayment|offer you|you will pay/i, "no modelled repayments");
  assert.match(contents(html), /Rent House prices Mortgage rates/);
  assert.match(html, /<a href="#mortgage-rates">Mortgage rates<\/a>/);
  assert.ok(html.indexOf('id="house-prices"') < html.indexOf('id="mortgage-rates"'));
  assert.ok(html.indexOf('id="mortgage-rates"') < html.indexOf('id="change-note"'));
});

test("without the optional members Housing hides the section and the contents link", async () => {
  const data = fullFixture();
  assert.equal(data.metrics.mortgage_2y_fixed_75, undefined);
  assert.equal(hasMortgageRates(data), false);
  assert.equal(mortgageChart(data), null);
  const html = await renderHousing(data);
  assert.doesNotMatch(html, /id="mortgage-rates"/);
  assert.doesNotMatch(html, /Mortgage rates/);
  assert.doesNotMatch(html, /IUMBV/);
  assert.equal(contents(html), "On this page Rent House prices");
  assert.match(html, /id="rent"/);
  assert.match(html, /id="house-prices"/);
});

test("unavailable mortgage members are hidden too, and one available rate still shows alone", async () => {
  const both = withMortgages();
  both.metrics.mortgage_2y_fixed_75 = unavailable(both.metrics.mortgage_2y_fixed_75);
  both.metrics.mortgage_5y_fixed_75 = unavailable(both.metrics.mortgage_5y_fixed_75);
  assert.equal(hasMortgageRates(both), false);
  const hidden = await renderHousing(both);
  assert.doesNotMatch(hidden, /id="mortgage-rates"/);
  assert.equal(contents(hidden), "On this page Rent House prices");

  const one = withMortgages();
  one.metrics.mortgage_5y_fixed_75 = unavailable(one.metrics.mortgage_5y_fixed_75);
  assert.deepEqual(mortgageMetrics(one).map(({ key }) => key), ["mortgage_2y_fixed_75"]);
  const html = await renderHousing(one);
  const text = textOf(section(html, "mortgage-rates"));
  assert.match(text, /2-year fixed .* 5\.39 ?%/);
  assert.match(text, /5-year fixed Bank of England quoted rates, 75% loan-to-value, new mortgages This rate has no verified reading yet/);
  assert.doesNotMatch(text, /5-year fixed[^]*\b0(\.0+)? ?%/);
  assert.match(contents(html), /Mortgage rates/);
});

test("the chart renders all three lines with a key, exact values and no gaps drawn as zero", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { MortgageRatesChart } = await server.ssrLoadModule("/src/app/components/MortgageRatesChart.tsx");
    const data = withMortgages();
    data.metrics.mortgage_2y_fixed_75.history.splice(-3, 1);
    const { rows, series } = mortgageChart(data);
    const html = renderToStaticMarkup(createElement(MortgageRatesChart, { rows, series, updated: null }));
    const text = textOf(html);
    assert.match(text, /Quoted mortgage rates and Bank Rate/);
    assert.match(text, /Percent per year, monthly\. Mortgage rates are averages of quoted rates, not offers\./);
    for (const name of ["2-year fixed", "5-year fixed", "Bank Rate \\(end of month\\)"]) assert.match(text, new RegExp(name));
    assert.match(html, /aria-label="Chart key"/);
    assert.match(html, /role="img"[^>]*aria-label="Line chart of 2-year fixed, 5-year fixed, Bank Rate \(end of month\)/);
    assert.match(html, /<summary>Exact values \(\d+\)<\/summary>/);
    assert.match(text, /Gaps in a line are months with no figure: 2-year fixed, August 2026/);
    assert.match(text, /August 2026 Missing 4\.78% 3\.75%/);
    assert.match(text, /Nothing is estimated or shown as zero/);
  } finally { await server.close(); }
});

test("Mortgage rates keeps 'averages, not offers' visible and the method in a MoreDetail (ADR 0004)", async () => {
  const html = await renderHousing(withMortgages());
  const block = section(html, "mortgage-rates");
  const cell = />What it means<\/h3><div[^>]*>([\s\S]*?)<\/div><\/div><div class="fs-row"/.exec(block)[1];
  assert.match(cell, /<details class="fs-more">/);
  const visible = textOf(cell.replace(/<details[\s\S]*?<\/details>/g, ""));
  assert.match(visible, /Average advertised rates .* They are averages, not offers/);
  assert.doesNotMatch(visible, /75% loan-to-value|existing mortgages/);
  assert.match(textOf(cell), /not the rate paid on existing mortgages/);
});
