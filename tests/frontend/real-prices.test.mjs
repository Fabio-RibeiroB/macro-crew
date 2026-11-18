// House prices after inflation (issue #134): a FinStats calculation over two verified series.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDataset, parseManifest } from "../../src/app/data/verified.mjs";
import { baseMonthLabel, realPriceSeries, realPriceTitle } from "../../src/app/data/realPrices.mjs";

const root = new URL("../fixtures/verified/", import.meta.url);
const data = JSON.parse(readFileSync(new URL("producer-fuel-v1.json", root), "utf8"));
const manifest = parseManifest(JSON.parse(readFileSync(new URL("producer-fuel-v1.manifest.json", root), "utf8")));

const pts = (rows) => rows.map(([period, value]) => ({ period, value }));

test("real price = nominal x CPI at the base month / CPI at the month", () => {
  const result = realPriceSeries(
    pts([["2026-06", "200000"], ["2026-07", "206000"], ["2026-08", "210000"]]),
    pts([["2026-06", "100"], ["2026-07", "103"], ["2026-08", "105"]]),
  );
  assert.equal(result.base, "2026-08");
  // 200000 x 105/100, 206000 x 105/103 and the base month unchanged.
  assert.deepEqual(result.points, [
    { date: "2026-06", value: 210000 },
    { date: "2026-07", value: 210000 },
    { date: "2026-08", value: 210000 },
  ]);
  assert.deepEqual(result.latest, { period: "2026-08", value: 210000 });
});

test("the base month is the latest month present in both series", () => {
  // CPI runs a month ahead of the house prices: the base is the later price month.
  const cpiAhead = realPriceSeries(
    pts([["2026-07", "100000"], ["2026-08", "100000"]]),
    pts([["2026-07", "140"], ["2026-08", "141"], ["2026-09", "142"]]),
  );
  assert.equal(cpiAhead.base, "2026-08");
  assert.equal(cpiAhead.points.at(-1).date, "2026-08");
  assert.equal(cpiAhead.points.at(-1).value, 100000);
  // Prices run ahead of CPI: the base is the latest CPI month, and the extra price month is not shown.
  const priceAhead = realPriceSeries(
    pts([["2026-07", "100000"], ["2026-08", "100000"], ["2026-09", "100000"]]),
    pts([["2026-07", "140"], ["2026-08", "141"]]),
  );
  assert.equal(priceAhead.base, "2026-08");
  assert.deepEqual(priceAhead.points.map((p) => p.date), ["2026-07", "2026-08"]);
  // Earlier prices are scaled up by inflation since then: 100000 x 141/140.
  assert.equal(priceAhead.points[0].value, 100714);
});

test("a month missing or unusable in either series stays a gap: no interpolation, no zero", () => {
  const result = realPriceSeries(
    pts([["2026-01", "100000"], ["2026-02", null], ["2026-04", "100000"], ["2026-05", "100000"], ["2026-06", "100000"]]),
    pts([["2026-01", "100"], ["2026-02", "100"], ["2026-03", "100"], ["2026-04", "100"], ["2026-05", null], ["2026-06", "100"]]),
  );
  assert.equal(result.base, "2026-06");
  assert.deepEqual(result.points.map((p) => [p.date, p.value]), [
    ["2026-01", 100000],
    ["2026-02", null], // price missing (explicit null)
    ["2026-03", null], // price month absent altogether
    ["2026-04", 100000],
    ["2026-05", null], // CPI missing
    ["2026-06", 100000],
  ]);
  for (const point of result.points) assert.notEqual(point.value, 0);
});

test("unusable tokens never become values", () => {
  const result = realPriceSeries(
    pts([["2026-01", "100000"], ["2026-02", ".."], ["2026-03", "0"], ["2026-04", "NaN"], ["2026-05", "100000"]]),
    pts([["2026-01", "100"], ["2026-02", "100"], ["2026-03", "100"], ["2026-04", "100"], ["2026-05", "100"]]),
  );
  assert.deepEqual(result.points.map((p) => p.value), [100000, null, null, null, 100000]);
  const zeroIndex = realPriceSeries(pts([["2026-01", "100000"]]), pts([["2026-01", "0"]]));
  assert.equal(zeroIndex, null);
});

test("no common month, or an absent series, gives no real series", () => {
  assert.equal(realPriceSeries(pts([["2026-01", "1"]]), pts([["2026-02", "1"]])), null);
  assert.equal(realPriceSeries(pts([["2026-01", "1"]]), []), null);
  assert.equal(realPriceSeries([], pts([["2026-01", "1"]])), null);
  assert.equal(realPriceSeries(undefined, undefined), null);
});

test("a gap at the latest common month moves the base back; it never carries a value forward", () => {
  const result = realPriceSeries(
    pts([["2026-07", "100000"], ["2026-08", "100000"], ["2026-09", null]]),
    pts([["2026-07", "100"], ["2026-08", "100"], ["2026-09", "100"]]),
  );
  assert.equal(result.base, "2026-08");
  assert.deepEqual(result.points.map((p) => p.date), ["2026-07", "2026-08"]);
});

test("the label names the calculation, the deflator and the base month", () => {
  assert.equal(baseMonthLabel("2026-09"), "September 2026");
  assert.equal(realPriceTitle("2026-09"), "After inflation (FinStats calculation using ONS CPI, September 2026 prices)");
});

test("the reader accepts the producer's CPI index member and rejects a changed contract", () => {
  const accepted = parseDataset(data, manifest);
  const index = accepted.metrics.cpi_index;
  assert.equal(index.definition.series, "D7BT");
  assert.equal(index.definition.unit, "index_2015_100");
  assert.equal(index.definition.geography, "United Kingdom");
  assert.equal(index.latest.period, "2026-09");
  assert.equal(index.latest.value, "144.1");
  // The recorded house prices end in 2026-08, so the real series is expressed in August 2026 prices.
  const real = realPriceSeries(accepted.metrics.house_price_level.history, index.history);
  assert.equal(real.base, "2026-08");
  assert.equal(real.latest.value, Number(accepted.metrics.house_price_level.latest.value));
  assert.equal(real.points[0].date, accepted.metrics.house_price_level.history[0].period);
  assert.ok(real.points[0].value > Number(accepted.metrics.house_price_level.history[0].value));
  for (const change of [
    (metric) => { metric.definition.unit = "percent"; },
    (metric) => { metric.definition.series = "D7G7"; },
    (metric) => { metric.definition.geography = "Great Britain"; },
    (metric) => { metric.definition.download_url += "x"; },
  ]) {
    const bad = structuredClone(data);
    change(bad.metrics.cpi_index);
    assert.throws(() => parseDataset(bad, manifest));
  }
});
