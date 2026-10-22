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

test("Ofgem live smoke producer output passes the strict reader and renders assumptions", async () => {
  const energyBytes = readFileSync(new URL("producer-energy-v1.json", WIRE));
  const energyManifest = JSON.parse(readFileSync(new URL("producer-energy-v1.manifest.json", WIRE), "utf8"));
  const data = await loadVerified("/", fileFetcher(energyBytes, energyManifest));
  const energy = data.metrics.household_energy;
  assert.equal(energy.latest.value, "1723");
  assert.equal(energy.latest.reference.effective_start, "2026-10-01");
  assert.equal(energy.latest.reference.effective_end, "2026-12-31");
  assert.equal(energy.latest.reference.comparison_status, "not_comparable_tax_change");
  assert.equal(data.metrics.bank_rate.validation_status, "unavailable");
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const home = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: data }));
    assert.match(home, /<h2>Household energy<\/h2>/);
    assert.match(home, /£1,723/);
    assert.match(home, /No direct comparison: Ofgem says the tax treatment changed/);
    const prices = renderToStaticMarkup(createElement(App, { pathname: "/prices", initialData: data }));
    assert.match(prices, /id="household-energy"/);
    assert.match(prices, /2,500 kWh of single-rate electricity and 9,500 kWh of gas/);
    assert.match(prices, /26\.32p\/kWh and 54\.83p\/day/);
    assert.match(prices, /7\.97p\/kWh and 29\.68p\/day/);
    assert.match(prices, /not supplied on this rates page/);
  } finally { await server.close(); }
});

test("strict reader keeps announced Ofgem periods separate and accepts date-bound activation", async () => {
  const energyBytes = readFileSync(new URL("producer-energy-v1.json", WIRE));
  const energyManifest = JSON.parse(readFileSync(new URL("producer-energy-v1.manifest.json", WIRE), "utf8"));
  const withWire = async (candidate) => {
    const bytes = Buffer.from(JSON.stringify(candidate));
    const selectedManifest = { ...energyManifest, sha256: createHash("sha256").update(bytes).digest("hex") };
    return loadVerified("/", fileFetcher(bytes, selectedManifest));
  };
  const announcedData = JSON.parse(energyBytes.toString("utf8"));
  const metric = announcedData.metrics.household_energy;
  const announced = {
    ...metric.latest,
    period: "2027-01-01",
    value: "1750",
    reference: {
      ...metric.latest.reference,
      effective_start: "2027-01-01",
      effective_end: "2027-03-31",
      period_status: "announced",
      comparison_status: "compare_only_same_basis",
      electricity: { unit_rate_p_per_kwh: "27.00", standing_charge_p_per_day: "55.00" },
      gas: { unit_rate_p_per_kwh: "8.00", standing_charge_p_per_day: "30.00" },
    },
  };
  metric.upcoming_period = announced;
  const before = await withWire(announcedData);
  assert.equal(before.metrics.household_energy.latest.value, "1723");
  assert.equal(before.metrics.household_energy.upcoming_period.value, "1750");
  assert.match(before.metrics.household_energy.latest.reference.tax_treatment, /1 October 2026 to 31 March 2027/);
  assert.equal(before.metrics.household_energy.latest.reference.comparison_status, "not_comparable_tax_change");
  assert.equal(before.metrics.household_energy.upcoming_period.reference.comparison_status, "compare_only_same_basis");

  for (const status of ["effective", "expired", "announced"]) {
    const invalidData = JSON.parse(JSON.stringify(announcedData));
    const invalidPoint = status === "announced"
      ? invalidData.metrics.household_energy.upcoming_period
      : invalidData.metrics.household_energy.latest;
    invalidPoint.reference.effective_end = "2026-09-30";
    invalidPoint.reference.period_status = status;
    await assert.rejects(() => withWire(invalidData));
  }

  const activatedData = JSON.parse(JSON.stringify(announcedData));
  const activeMetric = activatedData.metrics.household_energy;
  activeMetric.history[0].reference.period_status = "expired";
  const active = { ...activeMetric.upcoming_period, reference: { ...activeMetric.upcoming_period.reference, period_status: "effective" } };
  activeMetric.history.push(active);
  activeMetric.latest = active;
  activeMetric.upcoming_period = null;
  const after = await withWire(activatedData);
  assert.equal(after.metrics.household_energy.latest.value, "1750");
  assert.equal(after.metrics.household_energy.latest.reference.period_status, "effective");

  const noCurrentData = JSON.parse(energyBytes.toString("utf8"));
  const noCurrent = noCurrentData.metrics.household_energy;
  noCurrent.validation_status = "unavailable";
  noCurrent.latest = null;
  noCurrent.history[0].reference.period_status = "expired";
  const unavailable = await withWire(noCurrentData);
  assert.equal(unavailable.metrics.household_energy.latest, null);
  assert.equal(unavailable.metrics.household_energy.history[0].reference.period_status, "expired");
});

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
    assert.match(card, /−0\.71p\/litre vs 12 Oct 2026/);
    assert.match(card, /aria-label="Change −0\.71 pence per litre compared with 12 October 2026"/);
    assert.match(card, /Diesel/);
    assert.match(card, /199\.33p/);
    assert.match(card, /−0\.71p\/litre vs 12 Oct 2026/);
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
    assert.ok(prices.indexOf("<h3>CPI inflation</h3>") < prices.indexOf('id="petrol-diesel"'),
      "CPI remains the Prices headline before fuel figures");
    assert.match(prices, /DESNZ Weekly road fuel prices CSV/);
    assert.match(prices, /Monday morning, or the next working morning on a bank holiday/);
    assert.match(prices, /UK average, not a local forecourt quote/);
    for (const [petrolPresent, dieselPresent] of [[false, true], [true, false], [false, false]]) {
      const metrics = { ...producer.metrics };
      if (!petrolPresent) delete metrics.petrol_price;
      if (!dieselPresent) delete metrics.diesel_price;
      const partial = renderToStaticMarkup(createElement(App, {
        pathname: "/", initialData: { ...producer, metrics },
      }));
      const partialCard = [...partial.matchAll(/<article class="fs-stat fs-stat-compact\b[\s\S]*?<\/article>/g)]
        .map(([markup]) => markup).find((markup) => markup.includes("<h2>Petrol &amp; Diesel</h2>"));
      assert.ok(partialCard);
      assert.match(partialCard, /Unleaded petrol/);
      assert.match(partialCard, /Diesel/);
      if (petrolPresent) assert.match(partialCard, /174\.57p/);
      else assert.doesNotMatch(partialCard, /174\.57p/);
      if (dieselPresent) assert.match(partialCard, /199\.33p/);
      else assert.doesNotMatch(partialCard, /199\.33p/);
      assert.match(partialCard, /Not available/);
      const partialPrices = renderToStaticMarkup(createElement(App, {
        pathname: "/prices", initialData: { ...producer, metrics },
      }));
      for (const [label, present, metric] of [["Unleaded petrol", petrolPresent, petrol], ["Diesel", dieselPresent, diesel]]) {
        assert.ok(partialPrices.includes(`${label}: source release date: ${present ? metric.source_published_date : "not supplied"}; last successful check:`));
      }
    }
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const chart = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "UK average unleaded petrol pump price", label: "Unleaded petrol · pence per litre",
      unit: "p", unitDescription: "pence per litre", data: chartPoints(petrol).slice(-3),
    }));
    assert.match(chart, /Exact values in pence per litre/);
    assert.match(chart, /UK average unleaded petrol pump price/);
  } finally { await server.close(); }
});

test("ONS HF6X producer data renders only on Government with adjacent-month pp comparison", async () => {
  const debtBytes = readFileSync(new URL("producer-fuel-v1.json", WIRE));
  const debtManifest = JSON.parse(readFileSync(new URL("producer-fuel-v1.manifest.json", WIRE), "utf8"));
  const producer = await loadVerified("/", fileFetcher(debtBytes, debtManifest));
  const debt = producer.metrics.public_debt;
  assert.equal(debt.definition.series, "HF6X");
  assert.equal(debt.definition.unit, "percent");
  assert.equal(debt.latest.period, "2026-09");
  assert.equal(previousReading(debt).period, "2026-08");
  assert.ok(Math.abs(Number(debt.latest.value) - Number(previousReading(debt).value) - 0.4) < 1e-9);
  assert.equal(freshness({ ...debt, last_successful_check_at: "2026-11-21T12:00:00.000Z" }, new Date("2026-11-21T12:00:00Z")).label, "New release awaited");
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const government = renderToStaticMarkup(createElement(App, { pathname: "/government-budget", initialData: producer }));
    assert.match(government, /id="public-debt"/);
    assert.ok(government.indexOf('id="public-debt"') < government.indexOf("Three things to keep separate"), "debt figures precede Government guide prose");
    assert.match(government, /class="fs-number">94%/);
    assert.match(government, /<span>\+0\.4 percentage points<\/span> compared with August 2026/);
    assert.match(government, /end of September 2026/);
    assert.match(government, /HF6X/);
    assert.match(government, /deficit or net borrowing is the amount borrowed over a period/);
    assert.match(government, /Public sector net financial liabilities \(PSNFL\) is a wider balance-sheet measure/);
    assert.match(government, /ONS HF6X public debt series/);
    assert.match(government, /source publication:|ONS release:/i);
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const chart = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "Public sector net debt as a share of GDP", label: "Debt · % of GDP",
      data: chartPoints(debt).slice(-3),
    }));
    assert.match(chart, /Exact values in percent/);
    assert.match(chart, /94%/);
    const home = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: producer }));
    assert.doesNotMatch(home, /<h2>Public debt<\/h2>/);
    const stale = renderToStaticMarkup(createElement(App, {
      pathname: "/government-budget", initialData: { ...producer, metrics: {
        ...producer.metrics, public_debt: { ...debt, collection_status: "degraded" },
      } },
    }));
    assert.match(stale, /Update delayed · showing last verified figure/);
    const unavailable = renderToStaticMarkup(createElement(App, {
      pathname: "/government-budget", initialData: { ...producer, metrics: {
        ...producer.metrics, public_debt: { ...debt, latest: null, history: [], validation_status: "unavailable", collection_status: "unavailable" },
      } },
    }));
    assert.match(unavailable, /A verified reading is not available yet/);
    const debtSection = unavailable.slice(unavailable.indexOf('id="public-debt"'), unavailable.indexOf('id="gilt-yields"'));
    assert.doesNotMatch(debtSection, /class="fs-chart-grid fs-chart-count-1"/);
    assert.match(unavailable, /id="gilt-yields"/);
  } finally { await server.close(); }
});

test("BoE 5/10/20 nominal par producer export binds exact series and renders Government yields", async () => {
  const giltBytes = readFileSync(new URL("producer-fuel-v1.json", WIRE));
  const giltManifest = JSON.parse(readFileSync(new URL("producer-fuel-v1.manifest.json", WIRE), "utf8"));
  const producer = await loadVerified("/", fileFetcher(giltBytes, giltManifest));
  const yields = [producer.metrics.gilt_10y, producer.metrics.gilt_5y, producer.metrics.gilt_20y];
  assert.deepEqual(yields.map((metric) => metric.definition.series), ["IUDMNPY", "IUDSNPY", "IUDLNPY"]);
  assert.deepEqual(yields.map((metric) => metric.definition.maturity_years), [10, 5, 20]);
  assert.equal(yields[0].definition.primary, true);
  assert.deepEqual(yields.map((metric) => metric.latest.period), ["2026-10-20", "2026-10-21", "2026-10-21"]);
  assert.deepEqual(yields.map((metric) => metric.latest.value), ["5.3516", "4.9700", "5.6700"]);
  assert.equal(yields[0].collection_status, "degraded");
  assert.equal(yields[0].history.at(-1).period, "2026-10-20", "failed maturity retains its previous history while siblings advance");
  assert.equal(yields[0].history[0].period, "2021-10-20", "public browser history stays in the existing five-year window");
  for (const metric of yields) {
    assert.equal(metric.definition.unit, "percent");
    assert.equal(metric.definition.yield_type, "fitted_nominal_par");
    assert.equal(metric.source_download_url, metric.definition.download_url);
    assert.equal(metric.snapshot_evidence_kind, "official_download");
    assert.match(metric.source_sha256, /^[a-f0-9]{64}$/);
    assert.ok(metric.history.every(({ period }) => ![0, 6].includes(new Date(`${period}T00:00:00Z`).getUTCDay())));
    assert.ok(metric.history.every((point, index, points) => !index || points[index - 1].period < point.period));
  }
  const previous = yields[0].history.at(-2);
  const bps = (Number(yields[0].latest.value) - Number(previous.value)) * 100;
  assert.equal(Number(bps.toFixed(2)), -2.24);

  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const government = renderToStaticMarkup(createElement(App, { pathname: "/government-budget", initialData: producer }));
    assert.match(government, /id="public-debt"/);
    assert.match(government, /id="gilt-yields"/);
    assert.ok(government.indexOf('id="public-debt"') < government.indexOf('id="gilt-yields"'));
    assert.ok(government.indexOf('id="gilt-yields"') < government.indexOf("Three things to keep separate"));
    assert.match(government, /10-year gilt yield/);
    assert.match(government, /5-year gilt yield/);
    assert.match(government, /20-year gilt yield/);
    assert.match(government, /−2\.24 basis points/);
    assert.match(government, /4 January 2000/);
    assert.match(government, /market financing conditions/);
    assert.match(government, /average cost of all government debt already issued/);
    assert.match(government, /IUDSNPY, IUDMNPY and IUDLNPY/);
  } finally { await server.close(); }

  const changed = JSON.parse(giltBytes.toString("utf8"));
  changed.metrics.gilt_10y.definition.download_url = "https://www.bankofengland.co.uk/boeapps/database/other.csv";
  const badBytes = Buffer.from(JSON.stringify(changed));
  const badManifest = { ...giltManifest, sha256: createHash("sha256").update(badBytes).digest("hex") };
  await assert.rejects(() => loadVerified("/", fileFetcher(badBytes, badManifest)), (error) => error.kind === "invalid");
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
