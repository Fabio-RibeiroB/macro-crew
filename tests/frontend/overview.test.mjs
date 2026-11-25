// ADR 0001 overview indicator table: units sit with every number, no Unit column,
// arrows paired with text and honest missing values (direction colour: direction-colour.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { decimalDifference, overviewRows } from "../../src/app/data/overview.mjs";
import { fullFixture, overviewRowsOf, textOf } from "./overview-helpers.mjs";

const full = fullFixture;

async function renderOverview(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/", initialData }));
  } finally { await server.close(); }
}

test("exact decimal differences keep published precision and use a real minus sign", () => {
  assert.equal(decimalDifference("3.75", "4.00"), "−0.25");
  assert.equal(decimalDifference("4.00", "3.75"), "+0.25");
  assert.equal(decimalDifference("0.1", "-0.2"), "+0.3");
  assert.equal(decimalDifference("1406", "1406"), "0");
  assert.equal(decimalDifference("273037", "272146"), "+891");
});

test("the house prices definition names the statistic (#149)", () => {
  const row = overviewRows(full()).find((r) => r.id === "house-prices");
  const text = JSON.stringify(row);
  assert.match(text, /UK House Price Index average price of a home: mix-adjusted, not the median/);
});

test("every number on the overview carries its unit", () => {
  const rows = Object.fromEntries(overviewRows(full()).map((row) => [row.id, row]));
  const t = (row, cell) => row[cell].map((line) => line.text);
  assert.deepEqual(t(rows.inflation, "latest"), ["3.5%"]);
  assert.deepEqual(t(rows.inflation, "change"), ["+0.4 pp"]);
  assert.deepEqual(t(rows["bank-rate"], "latest"), ["3.75%"]);
  assert.ok(t(rows.rent, "change").includes("Average £1,406/month"));
  assert.deepEqual(t(rows["house-prices"], "latest"), ["£273,037"]);
  assert.deepEqual(t(rows["house-prices"], "previous").slice(0, 1), ["£272,146"]);
  assert.deepEqual(t(rows["house-prices"], "change").slice(0, 1), ["+£891"]);
  assert.deepEqual(t(rows.energy, "latest"), ["£1,723/year"]);
  assert.deepEqual(t(rows.fuel, "latest"), ["174.57p", "199.33p"]);
  assert.deepEqual(t(rows.fuel, "change"), ["−0.71p", "−0.71p"]);
  assert.deepEqual(t(rows.gdp, "latest"), ["+0.1%"]);
  assert.deepEqual(t(rows.gdp, "previous").slice(0, 1), ["+0.4%"]);
  // No numeric cell line is a bare number: each has %, £, p or pp.
  for (const row of Object.values(rows))
    for (const cell of ["latest", "previous", "change"])
      for (const line of row[cell])
        if (!line.missing && !line.sub && /\d/.test(line.text))
          assert.match(line.text, /%|£|\dp\b| pp$/, `${row.id} ${cell}: ${line.text}`);
});

test("Bank Rate shows two decimals and the size of its last change in percentage points", () => {
  const data = full();
  const bank = data.metrics.bank_rate;
  bank.history = [
    { period: "2026-09-17", value: "4.00", status: "observed" },
    { period: "2026-09-18", value: "4.00", status: "observed" },
    { period: "2026-09-21", value: "4.25", status: "observed" },
  ];
  bank.latest = bank.history.at(-1);
  const row = overviewRows(data).find((r) => r.id === "bank-rate");
  assert.equal(row.latest[0].text, "4.25%");
  assert.deepEqual(row.previous.map((l) => l.text), ["4.00%", "Before 21 Sep 2026"]);
  assert.equal(row.change[0].text, "+0.25 pp");
  assert.equal(row.change[0].direction, "up");
});

test("the overview is a table with no Unit column, a plain heading and a change footnote", async () => {
  const html = await renderOverview(full());
  const heads = [...html.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(([, h]) => textOf(h).replace(" *", "*"));
  assert.deepEqual(heads, ["Measure", "Latest", "Previous", "Change*", "Period"]);
  assert.doesNotMatch(html, />Unit</);
  assert.match(html, /<h1[^>]*>Latest figures<\/h1>/);
  assert.doesNotMatch(html, /UK figures|United Kingdom figures|Latest verified figures/);
  assert.doesNotMatch(html, /Official releases from the ONS/, "no sources line beside the heading");
  assert.doesNotMatch(html, /class="fs-lede"/);
  assert.match(html, /\* Change is the latest value minus the previous one, calculated by FinStats from the official series\. pp means percentage points\./);
  assert.match(html, /aria-describedby="change-note"/);
  const rows = overviewRowsOf(html);
  assert.equal(Object.keys(rows).length, 9);
  for (const markup of Object.values(rows)) {
    assert.match(markup, /class="fs-def"/, "each row carries an inline definition");
    assert.match(markup, /<a class="fs-ledger-link" href="\/[a-z-]+#[a-z-]+"/);
  }
  // The update chip's clock icon is a polyline; everything else on the overview must be chart-free.
  assert.doesNotMatch(html.replace(/<p class="fs-updated">[\s\S]*?<\/p>/, ""), /<svg[^>]*sparkline|<polyline|recharts/i);
});

test("change arrows are always paired with text and a sign", async () => {
  const html = await renderOverview(full());
  assert.match(html, /<span class="fs-arrow" aria-hidden="true">↑<\/span><span class="fs-sr">Up <\/span>\+0\.4 pp/);
  assert.match(html, /<span class="fs-arrow" aria-hidden="true">↓<\/span><span class="fs-sr">Down <\/span>−0\.2 pp/);
});

test("missing values stay Not available and never turn into zero", async () => {
  const data = full();
  delete data.metrics.household_energy;
  data.metrics.unemployment = { ...data.metrics.unemployment, latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
  data.metrics.gdp = null;
  const html = await renderOverview(data);
  const rows = overviewRowsOf(html);
  for (const id of ["energy", "unemployment", "gdp"]) {
    const text = textOf(rows[id]);
    assert.match(text, /Not available/, id);
    assert.match(text, /No verified reading yet/, id);
    assert.doesNotMatch(text, /(^|\s)[+−]?0(\.0+)?(%|p| pp)(\s|$)|£0(\s|$)/, `${id} must not show zero`);
  }
  assert.match(rows.inflation, /3\.5%/, "present measures are unaffected");
});

test("extending the 0% electricity VAT window keeps consecutive cap quarters comparable", async () => {
  const { comparableEnergyPrevious } = await import("../../src/app/data/overview.mjs");
  const data = full();
  const oct = structuredClone(data.metrics.household_energy.latest);
  const jan = structuredClone(oct);
  jan.period = "2027-01-01";
  jan.value = "2166";
  jan.reference.effective_start = "2027-01-01";
  jan.reference.effective_end = "2027-03-31";
  jan.reference.comparison_status = "compare_only_same_basis";
  jan.reference.tax_treatment = "5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027";
  const metric = { ...data.metrics.household_energy, latest: jan, history: [{ ...oct, reference: { ...oct.reference, period_status: "expired" } }, jan] };
  const result = comparableEnergyPrevious(metric);
  assert.equal(result.kind, "comparable");
  assert.equal(result.previous.value, "1723");
  const row = overviewRows({ ...data, metrics: { ...data.metrics, household_energy: metric } }).find((r) => r.id === "energy");
  assert.equal(row.change[0].text, "+£443/year");

  // An actual tax-regime change or separate 0% VAT window remains non-comparable.
  const jul = structuredClone(jan);
  jul.period = "2027-07-01";
  jul.reference.tax_treatment = "5% VAT on gas and electricity";
  assert.equal(comparableEnergyPrevious({ ...metric, latest: jul, history: [...metric.history, jul] }).kind, "unavailable");
  const laterWindow = structuredClone(jan);
  laterWindow.period = "2028-10-01";
  laterWindow.reference.tax_treatment = "5% VAT on gas; 0% VAT on electricity from 1 October 2028 to 31 March 2029";
  assert.equal(comparableEnergyPrevious({ ...metric, latest: laterWindow, history: [...metric.history, laterWindow] }).kind, "unavailable");
});
