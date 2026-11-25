// Overview takeaway (#205): deterministic plain English built from the verified snapshot.
// Every number must match the overview table, nothing is forecast, a missing metric is
// left out, and the crawl (ADR 0005) stays figures-only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewRows } from "../../src/app/data/overview.mjs";
import { gdpBand, inflationBand, overviewTakeaway, realPayBand } from "../../src/app/data/takeaway.mjs";
import { fullFixture, textOf } from "./overview-helpers.mjs";

const point = (value, period = "2026-09") => ({ latest: { value, period, status: "observed" }, history: [] });
const snapshot = (metrics) => ({ metrics });
const text = (metrics) => overviewTakeaway(snapshot(metrics))?.text;

test("inflation is described against the 2% target, with CPIH as the labelled fallback", () => {
  assert.equal(text({ cpi: point("3.0") }), "Inflation is well above the 2% target (3.0%).");
  assert.equal(text({ cpi: point("5.4") }), "Inflation is well above the 2% target (5.4%).");
  assert.equal(text({ cpi: point("2.9") }), "Inflation is above the 2% target (2.9%).");
  assert.equal(text({ cpi: point("2.3") }), "Inflation is above the 2% target (2.3%).");
  assert.equal(text({ cpi: point("2.2") }), "Inflation is close to the 2% target (2.2%).");
  assert.equal(text({ cpi: point("2.0") }), "Inflation is close to the 2% target (2.0%).");
  assert.equal(text({ cpi: point("1.7") }), "Inflation is close to the 2% target (1.7%).");
  assert.equal(text({ cpi: point("1.6") }), "Inflation is below the 2% target (1.6%).");
  assert.equal(text({ cpi: point("-0.2") }), "Inflation is below the 2% target (−0.2%).");
  assert.equal(text({ cpih: point("3.3") }), "Inflation (CPIH) is well above the 2% target (3.3%).");
  assert.equal(text({ cpi: point("1.9"), cpih: point("3.3") }), "Inflation is close to the 2% target (1.9%).", "CPI wins when present");
  assert.equal(text({ cpi: { latest: null, history: [] }, cpih: point("2.5") }), "Inflation (CPIH) is above the 2% target (2.5%).");
  assert.deepEqual([3, 2.95, 2.3, 2.29, 1.7, 1.69].map(inflationBand), ["well_above", "above", "above", "close", "close", "below"]);
});

test("real pay is described as ahead of, level with or behind prices", () => {
  const pay = (value) => text({ regular_pay_real_growth: point(value, "2026-08") });
  assert.equal(pay("0.6"), "Average regular pay is growing faster than prices (+0.6% in real terms).");
  assert.equal(pay("0.5"), "Average regular pay is growing faster than prices (+0.5% in real terms).");
  assert.equal(pay("0.2"), "Average regular pay is only just ahead of inflation (+0.2% in real terms).");
  assert.equal(pay("0.0"), "Average regular pay is roughly matching inflation (0.0% in real terms).");
  assert.equal(pay("-0.8"), "Average regular pay is rising more slowly than prices (−0.8% in real terms).");
  assert.deepEqual([0.5, 0.49, 0, -0.1].map(realPayBand), ["strong", "narrow", "level", "negative"]);
});

test("inflation and pay join with 'but' for opposite signals and 'and' for matching ones", () => {
  const both = (cpi, pay) => overviewTakeaway(snapshot({ cpi: point(cpi), regular_pay_real_growth: point(pay) })).sentences[0];
  assert.match(both("3.5", "0.6"), /\(3\.5%\), but average regular pay is growing faster/);
  assert.match(both("3.5", "0.2"), /\(3\.5%\), but average regular pay is only just ahead/);
  assert.match(both("3.5", "-0.8"), /\(3\.5%\) and average regular pay is rising more slowly/);
  assert.match(both("3.5", "0.0"), /\(3\.5%\) and average regular pay is roughly matching/);
  assert.match(both("2.0", "0.6"), /\(2\.0%\) and average regular pay is growing faster/);
  assert.match(both("1.2", "-0.4"), /\(1\.2%\), but average regular pay is rising more slowly/);
  assert.match(both("1.2", "0.0"), /\(1\.2%\) and average regular pay is roughly matching/);
});

test("GDP direction, private rents and Bank Rate each read plainly", () => {
  const second = (metrics) => overviewTakeaway(snapshot(metrics)).sentences.at(-1);
  assert.equal(second({ gdp: point("0.4", "2026-08") }), "The economy grew 0.4% in the latest month.");
  assert.equal(second({ gdp: point("0.2", "2026-08") }), "The economy grew modestly (0.2% in the latest month).");
  assert.equal(second({ gdp: point("0.1", "2026-08") }), "The economy grew modestly (0.1% in the latest month).");
  assert.equal(second({ gdp: point("0.0", "2026-08") }), "The economy was flat in the latest month.");
  assert.equal(second({ gdp: point("-0.3", "2026-08") }), "The economy shrank 0.3% in the latest month.");
  assert.deepEqual([0.3, 0.2, 0.1, 0, -0.1].map(gdpBand), ["growing", "modest", "modest", "flat", "contracted"]);
  assert.equal(second({ private_rent_growth: point("3.8") }), "Private rents are up 3.8% over the year.");
  assert.equal(second({ private_rent_growth: point("0.0") }), "Private rents are flat over the year.");
  assert.equal(second({ private_rent_growth: point("-1.2") }), "Private rents are down 1.2% over the year.");
  assert.equal(second({ bank_rate: point("4", "2026-10-19") }), "Bank Rate sits at 4.00%.");
  assert.equal(second({ bank_rate: point("3.75", "2026-10-19") }), "Bank Rate sits at 3.75%.");
});

// An announced cap on the same tax basis as the effective one.
function energy({ upcomingValue, comparison = "compare_only_same_basis", tax } = {}) {
  const data = fullFixture();
  const metric = data.metrics.household_energy;
  const base = metric.latest.reference;
  metric.upcoming_period = upcomingValue == null ? null : {
    period: "2027-01-01",
    value: upcomingValue,
    status: "observed",
    reference: {
      ...base,
      effective_start: "2027-01-01",
      effective_end: "2027-03-31",
      period_status: "announced",
      comparison_status: comparison,
      tax_treatment: tax ?? "5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027",
    },
  };
  return data;
}

test("a comparable announced energy cap is stated as a rise, fall or no change", () => {
  const second = (data) => overviewTakeaway(data).sentences.at(-1);
  assert.match(second(energy({ upcomingValue: "2166" })), /and the energy price cap is set to rise to £2,166\/year on 1 Jan 2027\.$/);
  assert.match(second(energy({ upcomingValue: "1500" })), /and the energy price cap is set to fall to £1,500\/year on 1 Jan 2027\.$/);
  assert.match(second(energy({ upcomingValue: "1723" })), /and the energy price cap is set to stay at £1,723\/year on 1 Jan 2027\.$/);
});

test("an energy cap across a tax-basis change is never described as a rise or fall", () => {
  const rendered = (data) => overviewTakeaway(data).text;
  const flagged = energy({ upcomingValue: "2166", comparison: "not_comparable_tax_change" });
  const regime = energy({ upcomingValue: "2166", tax: "5% VAT on gas and electricity" });
  const none = energy({});
  const effectiveOnly = fullFixture(); // effective cap is itself flagged not_comparable_tax_change
  for (const data of [flagged, regime, none, effectiveOnly]) {
    assert.doesNotMatch(rendered(data), /energy|cap|£/i);
    assert.doesNotMatch(rendered(data), /rise|fall|higher|lower/i);
  }
  assert.equal(rendered(flagged), rendered(none), "a non-comparable cap changes nothing");
});

test("energy alone is not enough to show a takeaway", () => {
  const data = energy({ upcomingValue: "2166" });
  data.metrics = { household_energy: data.metrics.household_energy };
  assert.equal(overviewTakeaway(data), null);
});

test("missing, null, NaN and blank metrics are omitted cleanly", () => {
  const data = fullFixture();
  data.metrics.cpi = null;
  data.metrics.cpih = point("");
  data.metrics.regular_pay_real_growth = point("NaN");
  data.metrics.private_rent_growth = { latest: null, history: [] };
  delete data.metrics.gdp;
  const only = overviewTakeaway(data);
  assert.equal(only.text, "Bank Rate sits at 3.75%.");
  assert.deepEqual(only.sentences, ["Bank Rate sits at 3.75%."]);

  const partial = text({ cpi: point("3.5"), gdp: point("-0.1", "2026-08") });
  assert.equal(partial, "Inflation is well above the 2% target (3.5%). The economy shrank 0.1% in the latest month.");
  for (const value of [only.text, partial, overviewTakeaway(fullFixture()).text])
    assert.doesNotMatch(value, /undefined|NaN|null|Not available|,\s*\.|\.\.|\s{2}|\(\s*\)|\band\s*\./);
});

test("no verified core metric returns null", () => {
  assert.equal(overviewTakeaway(null), null);
  assert.equal(overviewTakeaway(undefined), null);
  assert.equal(overviewTakeaway({}), null);
  assert.equal(overviewTakeaway({ metrics: {} }), null);
  assert.equal(overviewTakeaway({ metrics: { unemployment: point("4.7"), house_price_level: point("273037") } }), null);
  assert.equal(overviewTakeaway({ metrics: { cpi: point(null), bank_rate: { latest: null } } }), null);
});

test("it is two short sentences with no forecast, judgement or advice", () => {
  const { text: copy, sentences } = overviewTakeaway(fullFixture());
  assert.equal(sentences.length, 2);
  const words = copy.split(/\s+/).length;
  assert.ok(words >= 30 && words <= 55, `${words} words`);
  assert.doesNotMatch(copy, /could|may|might|will|expect|forecast|should|good|bad|fine|okay|worry|pricey|advice/i);
  // Even with every clause, including the announced energy cap, it stays compact.
  const full = overviewTakeaway(energy({ upcomingValue: "2166" })).text;
  assert.ok(full.split(/\s+/).length <= 60, full);
});

const lookup = (rows, id) => rows.find((row) => row.id === id);
const figure = (copy, expected, label) => assert.ok(copy.includes(expected), `${label}: "${expected}" missing from "${copy}"`);

test("every number in the takeaway matches the overview rows", () => {
  const data = energy({ upcomingValue: "2166" });
  const rows = overviewRows(data);
  const copy = overviewTakeaway(data).text;
  figure(copy, `(${lookup(rows, "inflation").latest[0].text})`, "inflation");
  figure(copy, lookup(rows, "bank-rate").latest[0].text, "bank rate");
  figure(copy, lookup(rows, "rent").latest[0].text, "rent");
  figure(copy, lookup(rows, "gdp").latest[0].text.replace(/^[+−]/, ""), "gdp");
  const afterInflation = lookup(rows, "wages").change.map((line) => line.text).find((line) => /after inflation/.test(line));
  // The table prints "0.6% after inflation"; the copy adds an explicit "+" to a positive real rate.
  figure(copy, `(+${afterInflation.match(/^(\S+) after inflation/)[1]} in real terms)`, "real pay");
  // The announced cap is the figure the Prices page prints, not the effective cap.
  figure(copy, "£2,166/year", "upcoming cap");
  assert.ok(!copy.includes(lookup(rows, "energy").latest[0].text), "the effective cap is not restated");
});

test("the numbers follow the data rather than fixed copy", () => {
  const data = fullFixture();
  data.metrics.cpi.latest = { ...data.metrics.cpi.latest, value: "1.4" };
  data.metrics.regular_pay_real_growth.latest = { ...data.metrics.regular_pay_real_growth.latest, value: "-0.8" };
  data.metrics.bank_rate.latest = { ...data.metrics.bank_rate.latest, value: "4.25" };
  const copy = overviewTakeaway(data).text;
  assert.match(copy, /^Inflation is below the 2% target \(1\.4%\), but average regular pay is rising more slowly than prices \(−0\.8% in real terms\)\./);
  assert.match(copy, /Bank Rate sits at 4\.25%\.$/);
});

async function renderApp(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/", initialData }));
  } finally { await server.close(); }
}
const takeawaySection = (html) => html.match(/<section class="fs-takeaway"[\s\S]*?<\/section>/)?.[0];

test("the overview shows a Takeaway section above the table, distinct from the AI summary", async () => {
  const html = await renderApp(fullFixture());
  const section = takeawaySection(html);
  assert.ok(section, "takeaway section rendered");
  assert.match(section, /<h2 id="takeaway-title"[^>]*>Takeaway<\/h2>/);
  assert.doesNotMatch(html, /At a glance/);
  assert.doesNotMatch(section, /AI summary|fs-ai-tag/);
  assert.match(textOf(section), /not written by AI/);
  assert.equal(textOf(section).includes(overviewTakeaway(fullFixture()).text), true);
  assert.ok(html.indexOf("fs-takeaway") < html.indexOf('<table'), "above the figures table");
  assert.ok(html.indexOf("fs-takeaway") > html.indexOf('id="overview-title"'), "under the page heading");
});

test("without verified data the takeaway is hidden", async () => {
  assert.equal(takeawaySection(await renderApp(null)), undefined);
  assert.equal(takeawaySection(await renderApp({ ...fullFixture(), metrics: {} })), undefined);
  assert.doesNotMatch(await renderApp(null), /Takeaway/);
});

test("the crawl stays figures-only (ADR 0005)", async () => {
  const html = await renderApp(fullFixture());
  const crawl = html.match(/<div class="fs-ticker[\s\S]*?(?=<main)/)?.[0] ?? html.slice(0, html.indexOf("<main"));
  assert.doesNotMatch(crawl, /Takeaway|well above the 2% target|roughly matching|rising more slowly/);
  const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.doesNotMatch(src("../../src/app/data/ticker.mjs").replace(/\/\/.*$/gm, ""), /takeaway/i);
  assert.doesNotMatch(src("../../src/app/components/FiguresTicker.tsx"), /takeaway/i);
});
