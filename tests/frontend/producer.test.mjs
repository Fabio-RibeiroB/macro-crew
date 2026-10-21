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

function fileFetcher(data) {
  return async (url) =>
    url.endsWith("current.json")
      ? { ok: true, json: async () => manifest }
      : {
          ok: true,
          arrayBuffer: async () => data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ),
        };
}

test("producer output passes the manifest checksum and the full reader contract", async () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
  const data = await loadVerified("/", fileFetcher(bytes));
  assert.deepEqual(
    Object.keys(data.metrics).sort(),
    ["bank_rate", "cpi", "cpih", "gdp", "private_rent_growth", "private_rent_level", "regular_pay_nominal_growth", "regular_pay_real_growth", "unemployment"],
  );
});

test("producer pay-v1 output remains accepted by the deployed M1 reader", () => {
  const deployedView = parseM1Dataset(
    JSON.parse(bytes.toString("utf8")),
    parseM1Manifest(manifest),
  );
  assert.deepEqual(Object.keys(deployedView.metrics).sort(), [
    "bank_rate", "cpi", "cpih", "gdp",
    "private_rent_growth", "private_rent_level",
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
