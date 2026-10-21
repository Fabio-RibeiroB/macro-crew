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
    ["bank_rate", "cpi", "cpih", "gdp", "regular_pay_nominal_growth", "regular_pay_real_growth", "unemployment"],
  );
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
