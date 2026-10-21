import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  METRICS,
  parseManifest,
  parseDataset,
  loadVerified,
  previousReading,
  lastRateChange,
  chartPoints,
  freshness,
  legacyReports,
} from "../../src/app/data/verified.mjs";

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
