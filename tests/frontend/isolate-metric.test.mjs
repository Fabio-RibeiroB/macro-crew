// M14 slice 2: one metric that fails the browser's checks is isolated as honestly
// unavailable; whole-generation integrity failures still reject everything.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  METRICS,
  OPTIONAL_METRICS,
  loadVerified,
  parseDataset,
  parseManifest,
  freshness,
} from "../../src/app/data/verified.mjs";
import { PAGES } from "../../src/app/data/pages.mjs";
import { overviewRowsOf, textOf } from "./overview-helpers.mjs";

const WIRE = new URL("../fixtures/verified/", import.meta.url);
const read = (name) => readFileSync(new URL(name, WIRE));
const bytes = read("producer-fuel-v1.json");
const manifest = JSON.parse(read("producer-fuel-v1.manifest.json").toString());
const fresh = () => JSON.parse(bytes.toString());
const parse = (data) => parseDataset(data, parseManifest(manifest));
const KEYS = Object.keys(fresh().metrics);
const EVIL = "https://example.com/evil.xlsx";

function wire(data, overrides = {}) {
  const body = Buffer.from(JSON.stringify(data));
  const selected = { ...manifest, sha256: createHash("sha256").update(body).digest("hex"), ...overrides };
  return async (url) =>
    url.endsWith("current.json")
      ? { ok: true, json: async () => selected }
      : { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}

function assertIsolated(metric, key) {
  assert.equal(metric.validation_status, "unavailable", key);
  assert.equal(metric.collection_status, "unavailable", key);
  assert.equal(metric.last_successful_check_at, null, key);
  assert.equal(metric.latest, null, key);
  assert.deepEqual(metric.history, [], key);
  assert.equal(metric.verification_rejected, true, key);
  assert.equal(freshness(metric).label, "Unavailable", key);
  assert.ok(!JSON.stringify(metric).includes("example.com"), `${key} leaked unverified data`);
  assert.equal(metric.definition.metric_id, (METRICS[key]?.[0] ?? OPTIONAL_METRICS[key]?.metric_id), key);
  if (key === "household_energy") assert.equal(metric.upcoming_period, null);
}

test("the reference generation has no isolated metrics and parses unchanged", () => {
  const data = fresh();
  assert.equal(parse(data), data);
  assert.ok(KEYS.length >= 20);
});

test("a tampered source download URL isolates only that metric, for every metric", () => {
  for (const key of KEYS) {
    const data = fresh();
    if (data.metrics[key].validation_status !== "verified") continue;
    data.metrics[key].source_download_url = EVIL;
    const parsed = parse(data);
    assertIsolated(parsed.metrics[key], key);
    const original = fresh();
    for (const other of KEYS.filter((k) => k !== key))
      assert.deepEqual(parsed.metrics[other], original.metrics[other], `${key} must not affect ${other}`);
  }
});

test("a failing definition (core or optional) isolates only that metric", () => {
  for (const key of KEYS) {
    const data = fresh();
    data.metrics[key].definition.source_url = EVIL;
    data.metrics[key].definition.unit = "index";
    const parsed = parse(data);
    assertIsolated(parsed.metrics[key], key);
    assert.equal(Object.keys(parsed.metrics).length, KEYS.length);
  }
});

test("failing status, history or point checks isolate only that metric", () => {
  for (const [key, mutate] of [
    ["cpih", (m) => { m.validation_status = "trusted"; }],
    ["gdp", (m) => { m.history[0].value = "NaN"; }],
    ["bank_rate", (m) => { m.latest = { period: "2026-01-01", value: "9", status: "observed" }; }],
    ["gdp", (m) => { m.collection_status = "great"; }],
    ["unemployment", (m) => { m.history.reverse(); }],
    ["household_energy", (m) => { m.latest.reference.tax_treatment = 5; }],
    ["petrol_price", (m) => { m.latest = null; }],
  ]) {
    const data = fresh();
    mutate(data.metrics[key]);
    const parsed = parse(data);
    assertIsolated(parsed.metrics[key], key);
    assert.equal(parsed.metrics.cpih.latest === null, key === "cpih");
  }
});

test("a missing core metric becomes unavailable; a missing optional one stays absent", () => {
  const data = fresh();
  delete data.metrics.gdp;
  delete data.metrics.private_rent_level;
  const parsed = parse(data);
  assertIsolated(parsed.metrics.gdp, "gdp");
  assert.equal("private_rent_level" in parsed.metrics, false);
});

test("an unknown metric key is omitted without affecting the others", () => {
  const data = fresh();
  data.metrics.mystery = structuredClone(data.metrics.cpih);
  data.metrics.constructor = structuredClone(data.metrics.cpih);
  const parsed = parse(data);
  assert.equal("mystery" in parsed.metrics, false);
  assert.equal(Object.hasOwn(parsed.metrics, "constructor"), false);
  assert.equal(parsed.metrics.cpih.validation_status, "verified");
});

test("the 19 November private-rents URL case isolates rents and keeps the rest", async () => {
  const data = fresh();
  const base = "https://www.ons.gov.uk/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/18november2026/priceindexofprivaterentsukmonthlypricestatistics";
  for (const key of ["private_rent_growth", "private_rent_level"]) data.metrics[key].source_download_url = `${base}v2.xlsx`;
  const loaded = await loadVerified("/", wire(data));
  assertIsolated(loaded.metrics.private_rent_growth, "private_rent_growth");
  assertIsolated(loaded.metrics.private_rent_level, "private_rent_level");
  assert.equal(loaded.metrics.cpih.latest.value, fresh().metrics.cpih.latest.value);
  assert.equal(loaded.metrics.house_price_level.validation_status, "verified");
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const home = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: loaded }));
    const rows = overviewRowsOf(home);
    assert.match(textOf(rows.rent), /^Rent\b/);
    assert.match(textOf(rows.rent), /Not available[\s\S]*No verified reading yet/);
    assert.doesNotMatch(textOf(rows.rent), /\d%/);
    assert.match(textOf(rows.inflation), /\d/);
    const housing = renderToStaticMarkup(createElement(App, { pathname: "/housing", initialData: loaded }));
    assert.match(housing, /id="house-prices"/);
    assert.match(housing, /£\d{3},\d{3}/);
  } finally {
    await server.close();
  }
});

test("every page renders cleanly with any one metric, or all of them, isolated", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  const isolatedData = (keys) => {
    const data = fresh();
    for (const key of keys) data.metrics[key].definition.source_url = EVIL;
    return parse(data);
  };
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const paths = PAGES.filter((page) => page.path.startsWith("/") && !page.path.includes(".")).map((page) => page.path);
    assert.ok(paths.includes("/housing") && paths.includes("/government-budget"));
    const scenarios = [...KEYS.map((key) => [key]), KEYS];
    for (const keys of scenarios) {
      const data = isolatedData(keys);
      for (const path of paths) {
        const label = `${keys.length === 1 ? keys[0] : "all metrics"} on ${path}`;
        let html;
        assert.doesNotThrow(() => { html = renderToStaticMarkup(createElement(App, { pathname: path, initialData: data })); }, label);
        const text = textOf(html);
        assert.doesNotMatch(text, /\bNaN\b|\bundefined\b|\bnull\b|\[object/, label);
        assert.doesNotMatch(html, /example\.com/, label);
      }
    }
    // With every figure unavailable no page invents a zero reading.
    const empty = isolatedData(KEYS);
    const home = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: empty }));
    for (const [id, row] of Object.entries(overviewRowsOf(home)))
      assert.doesNotMatch(textOf(row), /(?:^|\s)[£−-]?0(?:\.0+)?(?:%|\/year)/, `overview ${id}`);
  } finally {
    await server.close();
  }
});

test("whole-generation failures still reject the entire generation", async () => {
  const good = await loadVerified("/", wire(fresh()));
  assert.equal(good.metrics.cpih.validation_status, "verified");
  const rejected = (promise) => assert.rejects(promise, (error) => error.kind === "invalid");
  await rejected(loadVerified("/", wire(fresh(), { sha256: "0".repeat(64) })));
  await rejected(loadVerified("/", wire(fresh(), { data_url: "../../x.json" })));
  await rejected(loadVerified("/", wire(fresh(), { schema_version: 2 })));
  await rejected(loadVerified("/", wire(fresh(), { generation_id: "b".repeat(32), data_url: `generations/${"b".repeat(32)}/data.json` })));
  await rejected(loadVerified("/", wire(fresh(), { published_at: "2026-01-01T00:00:00Z" })));
  for (const mutate of [
    (d) => { d.schema_version = 2; },
    (d) => { d.generation_id = "d".repeat(32); },
    (d) => { d.mode = "fixture"; },
    (d) => { d.published_at = "2026-01-01T00:00:00Z"; },
    (d) => { d.metrics = []; },
    (d) => { d.metrics = null; },
  ]) {
    const data = fresh();
    mutate(data);
    assert.throws(() => parse(data), /Mismatched data generation/);
  }
  assert.throws(() => parseDataset([], parseManifest(manifest)), /Mismatched data generation/);
  assert.throws(() => parseDataset(null, parseManifest(manifest)), /Mismatched data generation/);
});
