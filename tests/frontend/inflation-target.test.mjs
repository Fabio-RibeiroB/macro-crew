// The Bank of England 2% target is context on the CPI and CPIH charts only (issue #119).
import test from "node:test";
import assert from "node:assert/strict";
import { chartYAxis } from "../../src/app/data/chartRange.mjs";
import { inflationTargetLine } from "../../src/app/data/chartMeta.mjs";
import { fullFixture } from "./overview-helpers.mjs";

async function withServer(run) {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try { return await run(server); } finally { await server.close(); }
}

const inflation = (id) => ({
  definition: {
    metric_id: `uk.${id}.annual_rate`, dataset: "MM23", series: id === "cpi" ? "D7G7" : "L55O", frequency: "monthly",
    comparison: "year_on_year", adjustment: "not_seasonally_adjusted", unit: "percent", version: 1,
    geography: "United Kingdom", source_url: "https://www.ons.gov.uk/economy/inflationandpriceindices",
  },
  history: [{ period: "2026-08", value: "3.1", status: "observed" }, { period: "2026-09", value: "3.5", status: "observed" }],
  latest: { period: "2026-09", value: "3.5", status: "observed" },
  collection_status: "ok", validation_status: "verified", snapshot_evidence_kind: "official_download",
  last_successful_check_at: "2026-10-21T12:00:00Z",
});

test("only CPI and CPIH have a target line, and its text names CPI", () => {
  assert.equal(inflationTargetLine("cpi").value, 2);
  assert.equal(inflationTargetLine("cpi").label, "2% target");
  assert.match(inflationTargetLine("cpi").description, /Bank of England 2% inflation target \(CPI\)/);
  assert.equal(inflationTargetLine("cpih").value, 2);
  assert.match(inflationTargetLine("cpih").label, /set for CPI/);
  assert.match(inflationTargetLine("cpih").description, /set for CPI, not CPIH/);
  for (const kind of ["bank_rate", "wages", "household_energy", undefined]) assert.equal(inflationTargetLine(kind), undefined);
});

test("axis includes the reference value whether data sit above or below it", () => {
  const above = chartYAxis([3.1, 3.5, 4.2], [2]);
  assert.ok(above.domain[0] <= 2 && above.domain[1] >= 4.2);
  assert.ok(above.domain[0] >= 0, "a never-negative series keeps a non-negative axis");
  const below = chartYAxis([-0.4, 0.5, 1.1], [2]);
  assert.ok(below.domain[0] < -0.4 && below.domain[1] >= 2);
  const flatAbove = chartYAxis([8, 8, 8], [2]);
  assert.ok(flatAbove.domain[0] <= 2);
  assert.ok(chartYAxis([], [2]).domain[1] >= 2);
  // Without a reference the axis is unchanged.
  assert.deepEqual(chartYAxis([3.1, 3.5, 4.2]), chartYAxis([3.1, 3.5, 4.2], []));
});

test("Prices passes the target line to the CPI and CPIH charts and to no other chart", async () => {
  const seen = [];
  const Stub = (props) => { seen.push(props); return null; };
  await withServer(async (server) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PricesPage } = await server.ssrLoadModule("/src/app/components/PricesPage.tsx");
    const data = fullFixture();
    data.metrics.cpi = inflation("cpi");
    data.metrics.cpih = inflation("cpih");
    const topic = (short) => ({ short, measurement: `${short} annual rate`, meaning: "", caution: "", color: "#000" });
    const topics = { cpi: topic("CPI"), cpih: topic("CPIH"), household_energy: topic("Energy"), petrol_price: topic("Petrol"), diesel_price: topic("Diesel") };
    renderToStaticMarkup(createElement(PricesPage, { data, topics, refresh() {}, HistoricalTrendCard: Stub }));
  });
  const byLabel = Object.fromEntries(seen.map((p) => [p.label, p]));
  assert.equal(byLabel.CPI.referenceLine.value, 2);
  assert.equal(byLabel.CPIH.referenceLine.value, 2);
  assert.match(byLabel.CPIH.referenceLine.label, /set for CPI/);
  const others = seen.filter((p) => p.label !== "CPI" && p.label !== "CPIH");
  assert.ok(others.every((p) => p.referenceLine === undefined), "no other chart gets a line");
  assert.equal(seen.length - others.length, 2);
});

test("the chart's text equivalent describes the line only when there is one", async () => {
  const data = [{ period: "2026-08", value: 3.1 }, { period: "2026-09", value: 3.5 }];
  const render = (extra) => withServer(async (server) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    return renderToStaticMarkup(createElement(HistoricalTrendCard, { title: "CPI", label: "CPI", data, ...extra }));
  });
  const withLine = await render({ referenceLine: inflationTargetLine("cpi") });
  assert.match(withLine, /aria-label="[^"]*Dashed line: Bank of England 2% inflation target \(CPI\)\./);
  const plain = await render({});
  assert.doesNotMatch(plain, /target/);
});
