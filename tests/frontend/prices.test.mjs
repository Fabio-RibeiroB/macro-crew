// Prices reads every measure in one fixed order (ADR 0001, issue #87):
// Key figure, What it means, Chart, Sources. There is no AI summary row because the
// current AI reports are Bank of England publications, not about prices.
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";

async function renderPrices(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/prices", initialData }));
  } finally { await server.close(); }
}
const section = (html, id) => {
  const start = html.indexOf(`<section class="fs-block" id="${id}"`);
  assert.ok(start >= 0, `${id} section exists`);
  return html.slice(start, html.indexOf("</section>", start));
};
const labelsOf = (block) =>
  [...block.matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);
const inflation = (id, period, latest, previous) => ({
  definition: {
    metric_id: `uk.${id}.annual_rate`, dataset: "MM23", series: id === "cpi" ? "D7G7" : "L55O", frequency: "monthly",
    comparison: "year_on_year", adjustment: "not_seasonally_adjusted", unit: "percent", version: 1,
    geography: "United Kingdom", source_url: "https://www.ons.gov.uk/economy/inflationandpriceindices",
  },
  history: [{ period: "2026-08", value: previous, status: "observed" }, { period, value: latest, status: "observed" }],
  latest: { period, value: latest, status: "observed" },
  collection_status: "ok", validation_status: "verified", snapshot_evidence_kind: "official_download",
  last_successful_check_at: "2026-10-21T12:00:00Z",
});
const withInflation = () => {
  const data = fullFixture();
  data.metrics.cpi = inflation("cpi", "2026-09", "3.5", "3.1");
  data.metrics.cpih = inflation("cpih", "2026-09", "3.3", "3.5");
  return data;
};

test("each Prices measure reads Key figure, What it means, Chart, Sources in order", async () => {
  const html = await renderPrices(withInflation());
  for (const id of ["inflation", "household-energy", "petrol-diesel"])
    assert.deepEqual(labelsOf(section(html, id)), ["Key figure", "What it means", "Chart", "Sources"], id);
  assert.doesNotMatch(html, /fs-ai-box|class="fs-ai-tag"/, "no AI summary row where no AI report is about prices");
  // Technical wording sits in a "How it's measured" disclosure inside each What it means row (ADR 0004).
  for (const id of ["inflation", "household-energy", "petrol-diesel"]) {
    const block = section(html, id);
    const means = block.slice(block.search(/<h3 class="fs-row-label"[^>]*>What it means/), block.search(/<h3 class="fs-row-label"[^>]*>Chart/));
    assert.match(means, /<details class="fs-more"><summary>[\s\S]*How it&#x27;s measured[\s\S]*<\/summary>/, id);
    assert.doesNotMatch(means, /<details[^>]* open/, id);
  }
  assert.ok(html.indexOf('id="inflation"') < html.indexOf('id="household-energy"'));
  assert.ok(html.indexOf('id="household-energy"') < html.indexOf('id="petrol-diesel"'));
  // Chart sits between the explanation and the sources (lazy card: loading state in SSR).
  const text = textOf(section(html, "inflation"));
  assert.ok(text.indexOf("What it means") < text.indexOf("Loading chart"));
  assert.ok(text.indexOf("Loading chart") < text.indexOf("Sources CPI inflation"));
});

test("anchors from the earlier layout still resolve", async () => {
  const html = await renderPrices(withInflation());
  for (const id of ["figures", "trends", "household-energy", "petrol-diesel", "inflation", "change-note"])
    assert.match(html, new RegExp(`id="${id}"`), id);
});

test("Prices numbers carry units, CPI is the headline and petrol and diesel stay separate", async () => {
  const html = await renderPrices(withInflation());
  const inflationText = textOf(section(html, "inflation"));
  assert.match(inflationText, /CPI inflation .*3\.5 ?%/);
  assert.match(inflationText, /Inflation \(CPIH\) · secondary measure .*3\.3 ?%/);
  assert.match(inflationText, /↑ Up \+0\.4 pp/);
  assert.match(inflationText, /Previous 3\.1% Aug 2026/);
  assert.match(inflationText, /Annual CPI inflation was 3\.5% in September 2026/);
  const energy = textOf(section(html, "household-energy"));
  assert.match(energy, /Key figure £1,723 ?\/year/);
  assert.match(energy, /Not comparable Tax treatment changed/);
  assert.match(energy, /No direct comparison: Ofgem says the tax treatment changed/);
  assert.match(energy, /Past cap periods/);
  assert.match(energy, /£1,723\/year/);
  assert.match(energy, /26\.32p\/kWh and 54\.83p\/day/);
  const fuel = section(html, "petrol-diesel");
  const petrol = textOf(fuel.slice(fuel.indexOf("Unleaded petrol</h4>"), fuel.indexOf("Diesel</h4>")));
  const diesel = textOf(fuel.slice(fuel.indexOf("Diesel</h4>"), fuel.indexOf('id="fuel-means-label"')));
  assert.match(petrol, /174\.57 ?p/);
  assert.doesNotMatch(petrol, /199\.33/);
  assert.match(diesel, /199\.33 ?p/);
  assert.doesNotMatch(diesel, /174\.57/);
  assert.match(petrol, /Previous week 175\.28 ?p/);
  assert.match(petrol, /−0\.71 ?p/);
  assert.match(petrol, /Pence per litre/);
});

test("CPIH is the labelled fallback when CPI has no verified reading", async () => {
  const data = withInflation();
  data.metrics.cpi = { ...data.metrics.cpi, latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
  const block = section(await renderPrices(data), "inflation");
  assert.doesNotMatch(block, />CPI inflation</);
  assert.match(block, /<h4 class="fs-fig-name">Inflation \(CPIH\)<\/h4>/);
  assert.match(textOf(block), /Annual CPIH inflation was 3\.3% in September 2026/);
});

test("missing values stay Not available and never become zero", async () => {
  const data = fullFixture();
  delete data.metrics.household_energy;
  delete data.metrics.petrol_price;
  const html = await renderPrices(data);
  const energy = textOf(section(html, "household-energy"));
  assert.match(energy, /Key figure Not available/);
  assert.match(energy, /A verified cap period is not available yet/);
  assert.match(energy, /Source details appear when a verified reading is available/);
  const fuel = textOf(section(html, "petrol-diesel"));
  assert.match(fuel, /Unleaded petrol Not available/);
  assert.match(fuel, /A verified reading is not available yet/);
  assert.match(fuel, /Diesel 199\.33 ?p/);
  assert.doesNotMatch(fuel, /(^|[^\d.,])0(\.0+)? ?p\b/);
  const none = await renderPrices(null);
  assert.match(none, /Checking the official-data export/);
  assert.match(none, /Charts will appear when verified figures are available/);
  assert.doesNotMatch(none, /fs-fig-v/);
});

test("announced upcoming energy cap is visible with annualised framing and keeps its rates in How it's measured", async () => {
  const data = withInflation();
  const base = data.metrics.household_energy.latest;
  data.metrics.household_energy.upcoming_period = {
    period: "2027-01-01",
    value: "2166",
    status: "observed",
    reference: {
      ...base.reference,
      effective_start: "2027-01-01",
      effective_end: "2027-03-31",
      period_status: "announced",
      comparison_status: "compare_only_same_basis",
      tax_treatment: "5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027",
      electricity: { unit_rate_p_per_kwh: "32.69", standing_charge_p_per_day: "54.77" },
      gas: { unit_rate_p_per_kwh: "10.96", standing_charge_p_per_day: "29.65" },
    },
  };
  const block = section(await renderPrices(data), "household-energy");
  const beforeDetails = textOf(block.slice(block.indexOf('id="energy-means-label"'), block.indexOf("<details")));
  assert.match(beforeDetails, /Next cap announced: £2,166\/year for 1 January 2027 to 31 March 2027 — an annualised typical bill for that three-month period, becoming current on 1 January 2027\./);
  const fullText = textOf(block);
  assert.match(fullText, /Key figure £1,723 ?\/year/, "current cap stays the headline until 1 January 2027");
  assert.match(fullText, /32\.69p\/kWh and 54\.77p\/day/);
  assert.match(fullText, /10\.96p\/kWh and 29\.65p\/day/);
  assert.match(fullText, /0% VAT on electricity from 1 October 2026 to 30 June 2027/);
});

test("effective Q2 2027 and announced Q3 2027 energy caps keep separate tax bases with no cross-period change", async () => {
  const data = withInflation();
  const base = data.metrics.household_energy.latest;
  const window = "5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027";
  data.metrics.household_energy.latest = { ...base, period: "2027-04-01", value: "1800", reference: {
    ...base.reference, effective_start: "2027-04-01", effective_end: "2027-06-30",
    period_status: "effective", comparison_status: "compare_only_same_basis", tax_treatment: window } };
  data.metrics.household_energy.history = [data.metrics.household_energy.latest];
  data.metrics.household_energy.upcoming_period = { period: "2027-07-01", value: "1890", status: "observed", reference: {
    ...base.reference, effective_start: "2027-07-01", effective_end: "2027-09-30",
    period_status: "announced", comparison_status: "not_comparable_tax_change",
    tax_treatment: "5% VAT on gas and electricity",
    electricity: { unit_rate_p_per_kwh: "28.40", standing_charge_p_per_day: "56.10" },
    gas: { unit_rate_p_per_kwh: "8.15", standing_charge_p_per_day: "30.20" } } };
  const text = textOf(section(await renderPrices(data), "household-energy"));
  assert.match(text, /Tax: 5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027/);
  assert.match(text, /Tax: 5% VAT on gas and electricity/);
  assert.match(text, /£1,890\/year for 1 July 2027 to 30 September 2027/);
  assert.doesNotMatch(text, /[+−]£\d/, "no rise or fall is shown between the two tax bases");
});
