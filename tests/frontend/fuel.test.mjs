import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chartPoints,
  parseDataset,
  parseManifest,
  previousReading,
} from "../../src/app/data/verified.mjs";

const root = new URL("../fixtures/verified/", import.meta.url);
const data = JSON.parse(readFileSync(new URL("producer-fuel-v1.json", root), "utf8"));
const manifest = parseManifest(JSON.parse(readFileSync(new URL("producer-fuel-v1.manifest.json", root), "utf8")));

function copy(value) { return structuredClone(value); }

test("strict reader accepts actual producer petrol and diesel weekly snapshots", () => {
  const accepted = parseDataset(data, manifest);
  for (const key of ["petrol_price", "diesel_price"]) {
    const metric = accepted.metrics[key];
    assert.equal(metric.definition.frequency, "weekly");
    assert.equal(metric.definition.unit, "pence_per_litre");
    assert.equal(metric.definition.geography, "United Kingdom");
    assert.equal(metric.latest.period, "2026-10-19");
    assert.deepEqual(metric.latest.reference, { kind: "weekly_observation", date: "2026-10-19" });
    assert.deepEqual(metric.latest, metric.history.at(-1));
  }
  assert.equal(accepted.metrics.petrol_price.latest.value, "174.57");
  assert.equal(accepted.metrics.diesel_price.latest.value, "199.33");
});

test("weekly feed rejects changed source, unit, or non-Monday reference", () => {
  const wrongUnit = copy(data);
  wrongUnit.metrics.petrol_price.definition.unit = "percent";
  assert.throws(() => parseDataset(wrongUnit, manifest), /definition/);
  const wrongSource = copy(data);
  wrongSource.metrics.petrol_price.source_download_url = "https://example.com/fuel.csv";
  assert.throws(() => parseDataset(wrongSource, manifest), /provenance/);
  const wrongWeek = copy(data);
  wrongWeek.metrics.petrol_price.latest.reference.date = "2026-10-20";
  wrongWeek.metrics.petrol_price.history.at(-1).reference.date = "2026-10-20";
  assert.throws(() => parseDataset(wrongWeek, manifest), /weekly observation reference/);
});

test("a missing week remains a chart gap and cannot be compared with an adjacent week", () => {
  const candidate = copy(data);
  const petrol = candidate.metrics.petrol_price;
  petrol.history = petrol.history.filter((point) => point.period !== "2026-10-12");
  petrol.latest = petrol.history.at(-1);
  parseDataset(candidate, manifest);
  assert.equal(previousReading(petrol), null);
  assert.deepEqual(chartPoints(petrol).slice(-3).map(({ date, value }) => ({ date, value })), [
    { date: "2026-10-05", value: 174.88 },
    { date: "2026-10-12", value: null },
    { date: "2026-10-19", value: 174.57 },
  ]);
  const explicitMissing = copy(data.metrics.diesel_price);
  explicitMissing.history.at(-2).value = null;
  explicitMissing.history.at(-2).status = "missing";
  assert.equal(previousReading(explicitMissing), null);
});
