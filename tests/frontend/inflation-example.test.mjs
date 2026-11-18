// Visual inflation explainer (issue #172, M13): the worked example is derived only from the
// verified rate, shows the 2% target for CPI only, and renders nothing without data.
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";
import { formatPounds, inflationExample, yearEarlier } from "../../src/app/data/inflationExample.mjs";

test("£100 x (1 + rate/100) is exact to the penny", () => {
  const pence = (rate) => inflationExample("cpi", { period: "2026-10", value: rate }).nowPence;
  assert.equal(pence("3.6"), 10360);
  assert.equal(pence("0.1"), 10010);
  assert.equal(pence("2.05"), 10205);
  assert.equal(pence("2.055"), 10206, "half a penny rounds up, with no float drift");
  assert.equal(pence("11.1"), 11110);
  assert.equal(pence("0"), 10000);
  assert.equal(pence("−0.5"), 9950, "falling prices use the unicode minus too");
  assert.equal(pence("-0.5"), 9950);
  assert.equal(inflationExample("cpi", { period: "2026-10", value: 3.6 }).nowPence, 10360);
});

test("pounds drop .00 only for whole amounts", () => {
  assert.equal(formatPounds(10000), "£100");
  assert.equal(formatPounds(10360), "£103.60");
  assert.equal(formatPounds(10205), "£102.05");
  assert.equal(formatPounds(9950), "£99.50");
});

test("the comparison month is the same month a year earlier", () => {
  assert.equal(yearEarlier("2026-10"), "2025-10");
  assert.equal(yearEarlier("2026-01"), "2025-01");
  assert.equal(yearEarlier("2026"), null);
  assert.equal(yearEarlier(undefined), null);
  const ex = inflationExample("cpi", { period: "2026-10", value: "3.6" });
  assert.deepEqual([ex.thenPeriod, ex.nowPeriod, ex.rateText, ex.direction], ["2025-10", "2026-10", "3.6%", "up"]);
});

test("the 2% target comparison is CPI only", () => {
  const latest = { period: "2026-10", value: "3.6" };
  const cpi = inflationExample("cpi", latest);
  assert.equal(cpi.targetPence, 10200);
  assert.equal(cpi.targetText, "2%");
  const cpih = inflationExample("cpih", latest);
  assert.equal(cpih.targetPence, null);
  assert.equal(cpih.label, "CPIH");
});

test("missing or unusable data gives no example, never zeros", () => {
  for (const latest of [null, undefined, {}, { period: "2026-10" }, { period: "2026-10", value: null },
    { period: "2026-10", value: "n/a" }, { period: "2026-10", value: "" }, { period: "bad", value: "3.6" },
    { period: "2026-10", value: "-100" }]) {
    assert.equal(inflationExample("cpi", latest), null, JSON.stringify(latest));
  }
});

async function renderPrices(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/prices", initialData }));
  } finally { await server.close(); }
}
const series = (id, period, value) => ({
  definition: {
    metric_id: `uk.${id}.annual_rate`, dataset: "MM23", series: id === "cpi" ? "D7G7" : "L55O", frequency: "monthly",
    comparison: "year_on_year", adjustment: "not_seasonally_adjusted", unit: "percent", version: 1,
    geography: "United Kingdom", source_url: "https://www.ons.gov.uk/economy/inflationandpriceindices",
  },
  history: [{ period, value, status: "observed" }],
  latest: { period, value, status: "observed" },
  collection_status: "ok", validation_status: "verified", snapshot_evidence_kind: "official_download",
  last_successful_check_at: "2026-11-18T12:00:00Z",
});
const inflationBlock = (html) => {
  const start = html.indexOf('<section class="fs-block" id="inflation"');
  return html.slice(start, html.indexOf("</section>", start));
};

test("Prices shows the worked example and the three-step diagram from the verified CPI rate", async () => {
  const data = fullFixture();
  data.metrics.cpi = series("cpi", "2026-10", "3.6");
  data.metrics.cpih = series("cpih", "2026-10", "3.5");
  const block = inflationBlock(await renderPrices(data));
  const example = /<figure class="fs-ex"[\s\S]*?<\/figure>/.exec(block)?.[0];
  assert.ok(example, "worked example is rendered");
  const text = textOf(example);
  assert.match(text, /What 3\.6% means/);
  assert.match(text, /Shopping that cost £100 in October 2025 costs about £103\.60 in October 2026\./);
  assert.match(text, /At the Bank of England’s 2% target it would cost £102 ?\./);
  assert.match(text, /FinStats illustration using the official CPI rate/);
  assert.match(example, /<div class="fs-ex-bars" aria-hidden="true">/, "bars are hidden from assistive technology");
  // The example sits in "What it means", before the disclosure, and the diagram inside it.
  const means = block.slice(block.indexOf('id="inflation-means-label"'), block.indexOf('id="inflation-chart-label"'));
  assert.ok(means.indexOf("fs-ex") < means.indexOf("<details"), "example comes before the disclosure");
  const detail = /<div class="fs-more-body">([\s\S]*?)<\/details>/.exec(means)[1];
  const steps = textOf(/<ol class="fs-steps">([\s\S]*?)<\/ol>/.exec(detail)[1]);
  assert.match(steps, /Step 1 A basket of more than 700 everyday goods and services/);
  assert.match(steps, /Step 2 Prices collected every month/);
  assert.match(steps, /Step 3 Compared with the same month a year earlier = the inflation rate/);
});

test("with only CPIH the example names CPIH and omits the CPI-only target", async () => {
  const data = fullFixture();
  delete data.metrics.cpi;
  data.metrics.cpih = series("cpih", "2026-10", "3.5");
  const example = /<figure class="fs-ex"[\s\S]*?<\/figure>/.exec(inflationBlock(await renderPrices(data)))?.[0];
  assert.ok(example);
  const text = textOf(example);
  assert.match(text, /costs about £103\.50 in October 2026/);
  assert.match(text, /official CPIH rate/);
  assert.doesNotMatch(text, /target/);
});

test("without verified inflation the example is absent but the diagram stays", async () => {
  const data = fullFixture();
  delete data.metrics.cpi;
  delete data.metrics.cpih;
  const block = inflationBlock(await renderPrices(data));
  assert.doesNotMatch(block, /fs-ex"/);
  assert.doesNotMatch(block, /£0/);
  assert.match(block, /<ol class="fs-steps">/);
  const none = inflationBlock(await renderPrices(null));
  assert.doesNotMatch(none, /fs-ex"/);
});
