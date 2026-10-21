import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  METRICS,
  OPTIONAL_METRICS,
  parseManifest,
  parseDataset,
  loadVerified,
  previousReading,
  lastRateChange,
  chartPoints,
  freshness,
  legacyReports,
  referenceWindow,
} from "../../src/app/data/verified.mjs";
import {
  METRICS as M1_METRICS,
  parseManifest as parseM1Manifest,
  parseDataset as parseM1Dataset,
} from "../fixtures/verified/m1-reader.mjs";

const WIRE = new URL("../fixtures/verified/", import.meta.url);
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`${name}.json`, WIRE), "utf8"));
const fixtureBytes = (name) => readFileSync(new URL(`${name}.json`, WIRE));
const fixtureManifest = (name) =>
  JSON.parse(readFileSync(new URL(`${name}.manifest.json`, WIRE), "utf8"));
function fixtureFetcher(manifest, bytes) {
  return async (url) =>
    url.endsWith("current.json")
      ? { ok: true, json: async () => manifest }
      : { ok: true, arrayBuffer: async () => bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) };
}
function optionalData() {
  return JSON.parse(fixtureBytes("v1-with-optional").toString());
}

const generation = "a".repeat(32);
const published = "2026-10-20T12:00:00.000000Z";
function sample() {
  const metrics = Object.fromEntries(
    Object.entries(METRICS).map(([key, values]) => {
      const [metric_id, series, dataset, frequency, comparison, adjustment] =
        values;
      const history =
        frequency === "monthly"
          ? [
              { period: "2026-07", value: "3.1", status: "observed" },
              { period: "2026-08", value: "3.3", status: "observed" },
            ]
          : [
              { period: "2026-10-16", value: "3.75", status: "observed" },
              { period: "2026-10-19", value: "3.75", status: "observed" },
            ];
      return [
        key,
        {
          definition: {
            metric_id,
            series,
            dataset,
            frequency,
            comparison,
            adjustment,
            unit: "percent",
            version: 1,
            source_url: "https://www.ons.gov.uk/",
          },
          history,
          latest: history.at(-1),
          collection_status: "ok",
          validation_status: "verified",
          snapshot_evidence_kind: "official_download",
          source_download_url: "https://www.ons.gov.uk/generator",
          source_sha256: "b".repeat(64),
          source_published_date: "2026-09-16",
          next_release_date: "2026-10-21",
          retrieved_at: published,
          last_successful_check_at: published,
        },
      ];
    }),
  );
  const data = {
    schema_version: 1,
    generation_id: generation,
    published_at: published,
    mode: "official",
    metrics,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const manifest = {
    schema_version: 1,
    generation_id: generation,
    published_at: published,
    data_url: `generations/${generation}/data.json`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return { data, manifest, bytes };
}

test("card and history share a validated generation and explicit definitions", () => {
  const { data, manifest } = sample();
  assert.equal(parseDataset(data, parseManifest(manifest)), data);
});
for (const [name, mutate] of [
  [
    "mixed generations",
    (d) => {
      d.generation_id = "c".repeat(32);
    },
  ],
  [
    "wrong unit",
    (d) => {
      d.metrics.cpih.definition.unit = "index";
    },
  ],
  [
    "monthly CPIH substituted for annual",
    (d) => {
      d.metrics.cpih.definition.series = "L59C";
    },
  ],
  [
    "wrong seasonal adjustment",
    (d) => {
      d.metrics.gdp.definition.adjustment = "not_seasonally_adjusted";
    },
  ],
  [
    "card/history mismatch",
    (d) => {
      d.metrics.cpih.latest = {
        period: "2026-08",
        value: "999",
        status: "observed",
      };
    },
  ],
  [
    "nonfinite number",
    (d) => {
      d.metrics.cpih.history[0].value = "NaN";
    },
  ],
  [
    "invalid month",
    (d) => {
      d.metrics.cpih.history[0].period = "2026-13";
    },
  ],
  [
    "duplicate periods",
    (d) => {
      d.metrics.cpih.history[0].period = "2026-08";
    },
  ],
  [
    "unsafe provenance",
    (d) => {
      d.metrics.cpih.source_download_url = "javascript:alert(1)";
    },
  ],
  [
    "fixture promoted to official",
    (d) => {
      d.metrics.cpih.snapshot_evidence_kind = "recorded_fixture";
    },
  ],
])
  test(`rejects ${name}`, () => {
    const { data, manifest } = sample();
    mutate(data);
    assert.throws(() => parseDataset(data, manifest));
  });

test("manifest cannot fetch paths outside its immutable generation", () => {
  const { manifest } = sample();
  manifest.data_url = "../../research_report.json";
  assert.throws(() => parseManifest(manifest));
});

test("unavailable data stays absent, never becomes zero", () => {
  const { data, manifest } = sample();
  data.metrics.gdp = {
    ...data.metrics.gdp,
    validation_status: "unavailable",
    history: [],
    latest: null,
  };
  assert.equal(parseDataset(data, manifest).metrics.gdp.latest, null);
  assert.equal(freshness(data.metrics.gdp).label, "Unavailable");
});

test("missing months break a chart and prevent false previous-month comparisons", () => {
  const metric = sample().data.metrics.gdp;
  metric.history[0].period = "2026-06";
  assert.equal(previousReading(metric), null);
  assert.deepEqual(
    chartPoints(metric).map((p) => p.value),
    [3.1, null, 3.3],
  );
});

test("Bank Rate reports the date of the latest evidenced transition", () => {
  const metric = sample().data.metrics.bank_rate;
  metric.history = [
    { period: "2026-10-14", value: "4.00", status: "observed" },
    { period: "2026-10-15", value: "3.75", status: "observed" },
    { period: "2026-10-16", value: "3.75", status: "observed" },
    { period: "2026-10-19", value: "3.75", status: "observed" },
  ];
  assert.deepEqual(lastRateChange(metric), {
    period: "2026-10-15",
    difference: -0.25,
  });
});

test("repeated Bank Rate observations do not count as changes", () => {
  const metric = sample().data.metrics.bank_rate;
  metric.history = [
    { period: "2026-10-16", value: "3.75", status: "observed" },
    { period: "2026-10-19", value: "3.75", status: "observed" },
  ];
  assert.equal(lastRateChange(metric), null);
});

test("a gap before a possible Bank Rate transition prevents bridging it", () => {
  const metric = sample().data.metrics.bank_rate;
  metric.history = [
    { period: "2026-10-14", value: "4.00", status: "observed" },
    { period: "2026-10-15", value: null, status: "missing" },
    { period: "2026-10-16", value: "3.75", status: "observed" },
    { period: "2026-10-19", value: "3.75", status: "observed" },
  ];
  assert.equal(lastRateChange(metric), null);
});

test("a skipped working date does not establish when Bank Rate changed", () => {
  const metric = sample().data.metrics.bank_rate;
  metric.history = [
    { period: "2026-10-16", value: "4.00", status: "observed" },
    { period: "2026-10-20", value: "3.75", status: "observed" },
  ];
  assert.equal(lastRateChange(metric), null);
});

test("a routine bank-holiday gap after an evidenced change does not erase it", () => {
  const metric = sample().data.metrics.bank_rate;
  metric.history = [
    { period: "2025-12-17", value: "4.00", status: "observed" },
    { period: "2025-12-18", value: "3.75", status: "observed" },
    { period: "2025-12-24", value: "3.75", status: "observed" },
    { period: "2025-12-29", value: "3.75", status: "observed" },
    { period: "2026-08-28", value: "3.75", status: "observed" },
    { period: "2026-09-01", value: "3.75", status: "observed" },
  ];
  assert.deepEqual(lastRateChange(metric), {
    period: "2025-12-18",
    difference: -0.25,
  });
});

test("insufficient Bank Rate history does not imply a change date", () => {
  const metric = sample().data.metrics.bank_rate;
  metric.history = [
    { period: "2026-10-19", value: "3.75", status: "observed" },
  ];
  assert.equal(lastRateChange(metric), null);
  metric.history = [];
  assert.equal(lastRateChange(metric), null);
});

test("stale checks and missed releases stay visible even when numbers are valid", () => {
  const metric = sample().data.metrics.cpih;
  assert.equal(freshness(metric, new Date("2026-10-20T13:00:00Z")).kind, "ok");
  assert.equal(
    freshness(metric, new Date("2026-10-22T13:00:00Z")).kind,
    "warning",
  );
  metric.last_successful_check_at = "2026-10-22T12:00:00Z";
  assert.equal(
    freshness(metric, new Date("2026-10-22T13:00:00Z")).label,
    "New release awaited",
  );
  metric.collection_status = "degraded";
  assert.match(freshness(metric).label, /last verified/);
});

test("loader verifies the payload checksum before accepting numbers", async () => {
  const { data, manifest, bytes } = sample();
  const fetcher = async (url) =>
    url.endsWith("current.json")
      ? { ok: true, json: async () => manifest }
      : { ok: true, arrayBuffer: async () => bytes.buffer };
  assert.equal(
    (await loadVerified("/", fetcher)).metrics.cpih.latest.value,
    data.metrics.cpih.latest.value,
  );
  manifest.sha256 = "0".repeat(64);
  await assert.rejects(loadVerified("/", fetcher), /integrity/);
});

test("missing manifest fails without fetching legacy numbers", async () => {
  let calls = 0;
  await assert.rejects(
    loadVerified("/", async () => {
      calls++;
      return { ok: false };
    }),
  );
  assert.equal(calls, 1);
});

test("AI report failure is independent and malicious links are excluded", () => {
  assert.deepEqual(legacyReports(null), []);
  assert.deepEqual(
    legacyReports({
      current_report_summaries: {
        monetary_policy_report: {
          summary: "Untrusted",
          source: "javascript:alert(1)",
        },
      },
    }),
    [],
  );
});

test("the recorded M1 payload is accepted and serializes byte-identically", () => {
  const bytes = fixtureBytes("m1-core-only");
  const manifest = fixtureManifest("m1-core-only");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    manifest.sha256,
  );
  const parsed = parseDataset(
    JSON.parse(bytes.toString()),
    parseManifest(manifest),
  );
  assert.equal(JSON.stringify(parsed), bytes.toString());
  assert.deepEqual(Object.keys(parsed.metrics).sort(), Object.keys(METRICS).sort());
  assert.equal(parsed.metrics.cpih.latest.value, "3.3");
});

test("the loader accepts the M1 payload and absent optional metrics stay absent", async () => {
  const manifest = fixtureManifest("m1-core-only");
  const data = await loadVerified(
    "/",
    fixtureFetcher(manifest, fixtureBytes("m1-core-only")),
  );
  assert.equal(data.metrics.bank_rate.latest.value, "3.75");
  for (const key of Object.keys(OPTIONAL_METRICS))
    assert.equal(data.metrics[key], undefined);
});

test("registered optional metrics validate with geography, windows and deflator", () => {
  const data = parseDataset(
    optionalData(),
    parseManifest(fixtureManifest("v1-with-optional")),
  );
  assert.equal(data.metrics.cpi.definition.geography, "United Kingdom");
  for (const key of Object.keys(OPTIONAL_METRICS)) {
    assert.equal(
      data.metrics[key].definition.source_url,
      OPTIONAL_METRICS[key].source_url,
      `${key} must cite its exact qualified source URL`,
    );
    assert.equal(
      data.metrics[key].source_download_url,
      OPTIONAL_METRICS[key].download_url,
      `${key} must cite its exact qualified download URL`,
    );
  }
  assert.equal(
    data.metrics.regular_pay_nominal_growth.definition.geography,
    "Great Britain",
  );
  assert.equal(
    data.metrics.regular_pay_nominal_growth.definition.window_months,
    3,
  );
  assert.equal(
    data.metrics.regular_pay_nominal_growth.definition.deflator,
    undefined,
  );
  assert.equal(
    data.metrics.regular_pay_real_growth.definition.deflator,
    "CPIH",
  );
  assert.equal(
    data.metrics.regular_pay_real_growth.definition.window_months,
    3,
  );
  const unemployment = data.metrics.unemployment;
  assert.deepEqual(referenceWindow(unemployment.history[0]), {
    start_month: "2025-11",
    end_month: "2026-01",
  });
  assert.deepEqual(referenceWindow(unemployment.latest), {
    start_month: "2026-06",
    end_month: "2026-08",
  });
  assert.equal(referenceWindow(data.metrics.cpi.latest), null);
  assert.equal(unemployment.latest.value, "4.7");
});

test("the loader verifies the checksum of a generation with optional metrics", async () => {
  const manifest = fixtureManifest("v1-with-optional");
  const data = await loadVerified(
    "/",
    fixtureFetcher(manifest, fixtureBytes("v1-with-optional")),
  );
  assert.equal(data.metrics.unemployment.latest.value, "4.7");
  manifest.sha256 = "0".repeat(64);
  await assert.rejects(
    loadVerified(
      "/",
      fixtureFetcher(manifest, fixtureBytes("v1-with-optional")),
    ),
    /integrity/,
  );
});

test("the frozen M1 consumer view ignores additive members in the same v1 generation", () => {
  const additive = parseM1Dataset(
    optionalData(),
    parseM1Manifest(fixtureManifest("v1-with-optional")),
  );
  // The frozen M1 parser validates its three registered keys and returns the
  // single generation; M1's presentation consumes only these three objects.
  const m1View = Object.fromEntries(
    Object.keys(M1_METRICS).map((key) => [key, additive.metrics[key]]),
  );
  assert.deepEqual(Object.keys(m1View).sort(), ["bank_rate", "cpih", "gdp"]);
  assert.equal(m1View.cpih.latest.value, "3.3");
  assert.deepEqual(m1View.cpih.latest, m1View.cpih.history.at(-1));
  assert.equal(m1View.gdp.latest.value, "0.1");
});

test("rolling charts locate points at their end month and keep their windows", () => {
  const data = parseDataset(
    optionalData(),
    parseManifest(fixtureManifest("v1-with-optional")),
  );
  const points = chartPoints(data.metrics.unemployment);
  assert.deepEqual(
    points.map((p) => p.date),
    ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"],
  );
  assert.deepEqual(
    points.map((p) => p.value),
    [4.9, null, null, null, null, 4.9, 4.9, 4.7],
  );
  assert.deepEqual(points.at(-1).reference, {
    kind: "rolling_months",
    start_month: "2026-06",
    end_month: "2026-08",
  });
});

test("a skipped end month keeps the previous published window comparison unavailable", () => {
  const data = parseDataset(
    optionalData(),
    parseManifest(fixtureManifest("v1-with-optional")),
  );
  const unemployment = data.metrics.unemployment;
  assert.equal(previousReading(unemployment).period, "2026-07");
  unemployment.history.at(-2).period = "2026-06";
  unemployment.history.at(-2).reference = {
    kind: "rolling_months",
    start_month: "2026-04",
    end_month: "2026-06",
  };
  assert.equal(previousReading(unemployment), null);
});

test("an unavailable registered optional member stays an absent view", () => {
  const data = optionalData();
  data.metrics.cpi = {
    ...data.metrics.cpi,
    validation_status: "unavailable",
    history: [],
    latest: null,
  };
  const parsed = parseDataset(
    data,
    parseManifest(fixtureManifest("v1-with-optional")),
  );
  assert.equal(parsed.metrics.cpi.latest, null);
  assert.deepEqual(parsed.metrics.cpi.history, []);
});

test("an unavailable optional member still needs its registered definition", () => {
  const data = optionalData();
  data.metrics.cpi = {
    ...data.metrics.cpi,
    validation_status: "unavailable",
    history: [],
    latest: null,
  };
  data.metrics.cpi.definition.unit = "index";
  assert.throws(() =>
    parseDataset(data, parseManifest(fixtureManifest("v1-with-optional"))),
  );
});

for (const [name, mutate] of [
  [
    "unknown metric key",
    (d) => {
      d.metrics.made_up = d.metrics.cpi;
    },
  ],
  [
    "wrong optional unit",
    (d) => {
      d.metrics.cpi.definition.unit = "index";
    },
  ],
  [
    "substituted optional series",
    (d) => {
      d.metrics.cpi.definition.series = "D7BT";
    },
  ],
  [
    "wrong optional geography",
    (d) => {
      d.metrics.regular_pay_nominal_growth.definition.geography =
        "United Kingdom";
    },
  ],
  [
    "CPI geography narrowed to Great Britain",
    (d) => {
      d.metrics.cpi.definition.geography = "Great Britain";
    },
  ],
  [
    "wrong rolling window size",
    (d) => {
      d.metrics.unemployment.definition.window_months = 6;
    },
  ],
  [
    "window metadata on a monthly metric",
    (d) => {
      d.metrics.cpi.definition.window_months = 3;
    },
  ],
  [
    "missing window metadata on a rolling metric",
    (d) => {
      delete d.metrics.unemployment.definition.window_months;
    },
  ],
  [
    "wrong deflator",
    (d) => {
      d.metrics.regular_pay_real_growth.definition.deflator = "CPI";
    },
  ],
  [
    "deflator on nominal pay",
    (d) => {
      d.metrics.regular_pay_nominal_growth.definition.deflator = "CPIH";
    },
  ],
  [
    "optional metric version bump",
    (d) => {
      d.metrics.cpi.definition.version = 2;
    },
  ],
  [
    "wrong optional adjustment",
    (d) => {
      d.metrics.regular_pay_nominal_growth.definition.adjustment =
        "not_seasonally_adjusted";
    },
  ],
  [
    "wrong optional comparison",
    (d) => {
      d.metrics.unemployment.definition.comparison = "year_on_year";
    },
  ],
  [
    "wrong optional frequency",
    (d) => {
      d.metrics.cpi.definition.frequency = "weekly";
    },
  ],
  [
    "unofficial optional source",
    (d) => {
      d.metrics.cpi.definition.source_url = "https://example.com/series";
    },
  ],
  [
    "optional source URL bound to another approved series",
    (d) => {
      d.metrics.cpi.definition.source_url =
        "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23";
    },
  ],
  [
    "optional download URL bound to another approved series",
    (d) => {
      d.metrics.cpi.source_download_url =
        "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data";
    },
  ],
  [
    "nominal pay download citing its real-pay sibling",
    (d) => {
      d.metrics.regular_pay_nominal_growth.source_download_url =
        "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms/data";
    },
  ],
  [
    "optional fixture promoted to official",
    (d) => {
      d.metrics.cpi.snapshot_evidence_kind = "recorded_fixture";
    },
  ],
  [
    "invalid optional provenance hash",
    (d) => {
      d.metrics.cpi.source_sha256 = "xyz";
    },
  ],
  [
    "rolling point without a reference window",
    (d) => {
      delete d.metrics.unemployment.history[0].reference;
    },
  ],
  [
    "rolling window end disagrees with the period key",
    (d) => {
      d.metrics.unemployment.history[0].reference.end_month = "2026-02";
    },
  ],
  [
    "reversed rolling window",
    (d) => {
      d.metrics.unemployment.history[0].reference.start_month = "2026-03";
      d.metrics.unemployment.history[0].reference.end_month = "2026-01";
    },
  ],
  [
    "short rolling window",
    (d) => {
      d.metrics.unemployment.history[0].reference.start_month = "2025-12";
    },
  ],
  [
    "impossible rolling month",
    (d) => {
      d.metrics.unemployment.history[0].reference.start_month = "2025-00";
    },
  ],
  [
    "reference metadata on a monthly point",
    (d) => {
      d.metrics.cpi.history[0].reference = {
        kind: "rolling_months",
        start_month: "2026-06",
        end_month: "2026-07",
      };
    },
  ],
  [
    "duplicate optional periods",
    (d) => {
      d.metrics.unemployment.history[0].period = "2026-06";
      d.metrics.unemployment.history[0].reference = {
        kind: "rolling_months",
        start_month: "2026-04",
        end_month: "2026-06",
      };
    },
  ],
  [
    "optional card and chart disagree",
    (d) => {
      d.metrics.unemployment.latest.value = "999";
    },
  ],
  [
    "unavailable optional metric with values",
    (d) => {
      d.metrics.cpi.validation_status = "unavailable";
    },
  ],
])
  test(`rejects ${name}`, () => {
    const data = optionalData();
    mutate(data);
    assert.throws(() =>
      parseDataset(data, parseManifest(fixtureManifest("v1-with-optional"))),
    );
  });
