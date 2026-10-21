import test from "node:test";
import assert from "node:assert/strict";
import {
  CHART_RANGES,
  DEFAULT_CHART_RANGE,
  filterChartRange,
  moveChartRange,
} from "../../src/app/data/chartRange.mjs";

const monthly = [
  { date: "2016-07", value: 1, period: "2016-07" },
  { date: "2016-08", value: 2, period: "2016-08" },
  { date: "2021-07", value: 3, period: "2021-07" },
  { date: "2021-08", value: 4, period: "2021-08" },
  { date: "2025-07", value: 5, period: "2025-07" },
  { date: "2025-08", value: 6, period: "2025-08" },
  { date: "2026-01", value: null, period: "2026-01", status: "missing" },
  { date: "2026-08", value: 7, period: "2026-08", unit: "%" },
];

test("default range is five years and the control lists 1Y, 5Y, 10Y and All", () => {
  assert.equal(DEFAULT_CHART_RANGE, "5Y");
  assert.deepEqual(
    CHART_RANGES.map((range) => range.id),
    ["1Y", "5Y", "10Y", "All"],
  );
  assert.deepEqual(filterChartRange(monthly), filterChartRange(monthly, "5Y"));
});

test("ranges include the anniversary of the latest point and exclude the period before it", () => {
  assert.deepEqual(
    filterChartRange(monthly, "1Y").points.map((point) => point.date),
    ["2025-08", "2026-01", "2026-08"],
  );
  assert.equal(filterChartRange(monthly, "1Y").requestedStart, "2025-08");
  assert.deepEqual(
    filterChartRange(monthly, "5Y").points.map((point) => point.date),
    ["2021-08", "2025-07", "2025-08", "2026-01", "2026-08"],
  );
  assert.equal(filterChartRange(monthly, "5Y").requestedStart, "2021-08");
  assert.deepEqual(
    filterChartRange(monthly, "10Y").points.map((point) => point.date),
    [
      "2016-08",
      "2021-07",
      "2021-08",
      "2025-07",
      "2025-08",
      "2026-01",
      "2026-08",
    ],
  );
  assert.equal(filterChartRange(monthly, "10Y").requestedStart, "2016-08");
  assert.equal(filterChartRange(monthly, "All").requestedStart, null);
  assert.equal(filterChartRange(monthly, "All").points.length, monthly.length);
});

test("daily windows count back from the latest observation rather than today", () => {
  const points = [
    { date: "2019-01-14", value: 1 },
    { date: "2019-01-15", value: 2 },
    { date: "2020-01-15", value: 3.75, unit: "%" },
  ];
  const selected = filterChartRange(points, "1Y");
  assert.equal(selected.latest, "2020-01-15");
  assert.equal(selected.requestedStart, "2019-01-15");
  assert.deepEqual(
    selected.points.map((point) => point.date),
    ["2019-01-15", "2020-01-15"],
  );
  assert.equal(selected.shorterThanRequested, false);
  assert.equal(selected.notice, null);
});

test("29 February counts back to 28 February when the earlier year is not a leap year", () => {
  const points = [
    { date: "2023-02-27", value: 1 },
    { date: "2023-02-28", value: 2 },
    { date: "2024-02-29", value: 4 },
  ];
  const selected = filterChartRange(points, "1Y");
  assert.equal(selected.requestedStart, "2023-02-28");
  assert.deepEqual(
    selected.points.map((point) => point.date),
    ["2023-02-28", "2024-02-29"],
  );
});

test("a leap day inside the window stays inside when the latest point is 28 February", () => {
  const points = [
    { date: "2020-02-28", value: 1 },
    { date: "2020-02-29", value: 2 },
    { date: "2021-02-28", value: 3 },
  ];
  assert.deepEqual(
    filterChartRange(points, "1Y").points.map((point) => point.date),
    ["2020-02-28", "2020-02-29", "2021-02-28"],
  );
});

test("gaps stay gaps and points outside the range are omitted", () => {
  const points = [
    { date: "2022-02", value: null, status: "missing" },
    { date: "2022-03", value: null, status: "missing" },
    { date: "2023-01", value: 1 },
    { date: "2023-02", value: null, status: "missing" },
    { date: "2023-03", value: 3 },
  ];
  const selected = filterChartRange(points, "1Y");
  assert.equal(selected.latest, "2023-03");
  assert.equal(selected.requestedStart, "2022-03");
  assert.deepEqual(
    selected.points.map((point) => point.value),
    [null, 1, null, 3],
  );
  assert.equal(selected.points[0].status, "missing");
  assert.equal(
    selected.points.some((point) => point.date === "2022-02"),
    false,
  );
  assert.equal(selected.points.length, 4);
});

test("a trailing gap still anchors the range", () => {
  const points = [
    { date: "2023-12", value: 1 },
    { date: "2024-06", value: 2 },
    { date: "2025-01", value: null, status: "missing" },
  ];
  const selected = filterChartRange(points, "1Y");
  assert.equal(selected.latest, "2025-01");
  assert.equal(selected.requestedStart, "2024-01");
  assert.deepEqual(
    selected.points.map((point) => point.date),
    ["2024-06", "2025-01"],
  );
  assert.equal(selected.points[1].value, null);
});

test("short history shows every available point and describes the actual span", () => {
  const points = [
    { date: "2026-07", value: 3.1, period: "2026-07", revision: "latest vintage" },
    { date: "2026-08", value: 3.3, period: "2026-08", revision: "latest vintage" },
  ];
  for (const range of ["1Y", "5Y", "10Y"]) {
    const selected = filterChartRange(points, range);
    assert.equal(selected.shorterThanRequested, true);
    assert.deepEqual(
      selected.points.map((point) => point.period),
      ["2026-07", "2026-08"],
    );
    assert.equal(selected.points.length, points.length);
    assert.match(selected.notice, /July 2026 to August 2026/);
    assert.match(selected.notice, new RegExp(range === "1Y" ? "1 year" : range === "5Y" ? "5 years" : "10 years"));
  }
  const everything = filterChartRange(points, "All");
  assert.equal(everything.shorterThanRequested, false);
  assert.equal(everything.notice, null);
  assert.equal(everything.points.length, 2);
  assert.equal(
    filterChartRange([{ date: "2020-01-15", value: 4 }], "1Y").notice,
    "Showing 15 January 2020. Less history is available than 1 year.",
  );
});

test("units, revisions and reference periods are copied through unchanged", () => {
  const input = [
    {
      date: "2024-08",
      period: "2024-08",
      value: "3.10",
      status: "observed",
      revision: "revised +0.1 percentage points",
      unit: "%",
    },
    {
      date: "2026-08",
      period: "2026-08",
      value: 0,
      status: "observed",
      revision: "latest vintage",
      unit: "%",
    },
  ];
  const snapshot = structuredClone(input);
  const selected = filterChartRange(input, "5Y");
  assert.deepEqual(selected.points, input);
  selected.points[0].value = 0;
  selected.points[0].revision = "mutated";
  assert.deepEqual(input, snapshot);
  assert.equal(selected.points[1].value, 0);
  assert.notEqual(selected.points[1], input[1]);
});

test("arrow keys move the radio group and wrap, while other keys do not", () => {
  assert.equal(moveChartRange(DEFAULT_CHART_RANGE, "ArrowRight"), "10Y");
  assert.equal(moveChartRange(DEFAULT_CHART_RANGE, "ArrowDown"), "10Y");
  assert.equal(moveChartRange(DEFAULT_CHART_RANGE, "ArrowLeft"), "1Y");
  assert.equal(moveChartRange(DEFAULT_CHART_RANGE, "ArrowUp"), "1Y");
  assert.equal(moveChartRange("1Y", "ArrowLeft"), "All");
  assert.equal(moveChartRange("All", "ArrowRight"), "1Y");
  assert.equal(moveChartRange("10Y", "Home"), "1Y");
  assert.equal(moveChartRange("1Y", "End"), "All");
  assert.equal(moveChartRange("5Y", "Enter"), null);
  assert.equal(moveChartRange("3Y", "ArrowRight"), null);
});

test("the chart control labels the default range and keeps gaps out of the value table", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { HistoricalTrendCard } = await server.ssrLoadModule(
      "/src/app/components/HistoricalTrendCard.tsx",
    );
    const short = renderToStaticMarkup(
      createElement(HistoricalTrendCard, {
        title: "CPIH · change over 12 months",
        label: "Inflation",
        data: [
          {
            date: "2024-01",
            period: "2024-01",
            value: 1,
            status: "observed",
            revision: "latest vintage",
          },
          {
            date: "2024-02",
            period: "2024-02",
            value: null,
            status: "missing",
          },
          {
            date: "2024-03",
            period: "2024-03",
            value: 3.3,
            revision: "revised +0.1 percentage points",
          },
        ],
      }),
    );
    assert.match(short, /role="radiogroup"/);
    assert.match(short, /aria-label="Historical range for Inflation"/);
    assert.match(short, /aria-label="1Y, 1 year"/);
    assert.match(short, /aria-label="5Y, 5 years"/);
    assert.match(short, /aria-checked="true"/);
    assert.match(short, /aria-label="10Y, 10 years"/);
    assert.match(short, /aria-label="All, All available history"/);
    assert.equal((short.match(/role="radio"/g) || []).length, 4);
    assert.equal((short.match(/tabindex="0"/g) || []).length, 1);
    assert.equal((short.match(/tabindex="-1"/g) || []).length, 3);
    assert.match(short, /data-range="5Y"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-range="5Y"/);
    assert.doesNotMatch(short, />3Y</);
    assert.match(short, /Showing January 2024 to March 2024/);
    assert.match(short, /Less history is available than 5 years/);
    assert.match(short, /January 2024/);
    assert.match(short, /February 2024/);
    assert.match(short, />Missing</);
    assert.match(short, /latest vintage/);
    assert.match(short, /revised \+0\.1 percentage points/);
    assert.match(short, /1%/);
    assert.match(short, /3\.3%/);
    assert.doesNotMatch(short, />0%</);
    assert.match(short, /Exact values \(3\)/);
    assert.match(short, /Reference period/);
    assert.match(short, /<th scope="col">Revision<\/th>/);

    const covered = renderToStaticMarkup(
      createElement(HistoricalTrendCard, {
        title: "Bank of England · annual interest rate",
        label: "Bank Rate",
        curve: "stepAfter",
        data: [
          { date: "2019-03-15", value: 0.75 },
          { date: "2024-02-15", value: null },
          { date: "2024-03-15", value: 5.25 },
        ],
      }),
    );
    assert.match(covered, /data-range="5Y"/);
    assert.doesNotMatch(covered, /Less history is available/);
    assert.match(covered, /15 March 2019/);
    assert.match(covered, /15 February 2024<\/td><td>Missing<\/td><td>Not applicable/);
    assert.match(covered, />Missing</);
    assert.match(covered, /0\.75%/);
    assert.match(covered, /5\.25%/);
    assert.match(covered, /Latest revised value/);
  } finally {
    await server.close();
  }
});

test("missing values stay null and unusable dates are not plotted as zero", () => {
  const selected = filterChartRange(
    [
      { date: "not-a-date", value: 9 },
      { date: "2026-02-31", value: 8 },
      { date: "2026-13", value: 7 },
      { period: "2026-08", value: null, status: "missing" },
    ],
    "All",
  );
  assert.deepEqual(selected.points, [
    { period: "2026-08", value: null, status: "missing" },
  ]);
  assert.equal(filterChartRange([], "10Y").points.length, 0);
  assert.equal(filterChartRange([], "10Y").notice, null);
  assert.throws(() => filterChartRange([], "3Y"), /Unknown chart range/);
});
