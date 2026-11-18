// M8 slice 4 (issue #89): each chart says when its data was last updated and
// marks periods with no official figure, without inventing a date or a value.
import test from "node:test";
import assert from "node:assert/strict";
import { chartUpdated, describeGaps, gapSpans } from "../../src/app/data/chartMeta.mjs";

async function render(props) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    return renderToStaticMarkup(createElement(HistoricalTrendCard, { title: "CPI", label: "CPI inflation", ...props }));
  } finally { await server.close(); }
}
const monthly = (values, start = [2025, 1]) =>
  values.map((value, i) => {
    const m = start[1] - 1 + i;
    const date = `${start[0] + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
    return { date, value };
  });

test("the official release date drives the label, ahead of the retrieval time", () => {
  const updated = chartUpdated({ source_published_date: "2026-11-14", retrieved_at: "2026-11-16T07:00:00Z" });
  assert.equal(updated.kind, "published");
  assert.equal(updated.label, "Updated 14 Nov 2026");
});

test("without a release date the retrieval date is used and labelled as retrieval", () => {
  const updated = chartUpdated({ source_published_date: null, retrieved_at: "2026-11-15T23:30:00Z" });
  assert.equal(updated.kind, "retrieved");
  assert.equal(updated.label, "Retrieved 15 Nov 2026");
});

test("no usable date gives no label, and the last check is never used", () => {
  assert.equal(chartUpdated({ last_successful_check_at: "2026-11-16T07:00:00Z" }), null);
  assert.equal(chartUpdated({ source_published_date: "2026-02-31", retrieved_at: "soon" }), null);
  assert.equal(chartUpdated(undefined), null);
});

test("gap spans group consecutive missing values and never treat them as zero", () => {
  const points = monthly([1, 2, null, null, 5, 6, null, 8]);
  const spans = gapSpans(points);
  assert.deepEqual(spans.map((s) => [s.start, s.end, s.before, s.after, s.count]), [
    ["2025-03", "2025-04", "2025-02", "2025-05", 2],
    ["2025-07", "2025-07", "2025-06", "2025-08", 1],
  ]);
  assert.deepEqual(gapSpans(monthly([1, 2, 3])), []);
  assert.equal(describeGaps(spans), "March 2025 to April 2025; July 2025");
  assert.match(describeGaps(gapSpans(monthly([1, null, 3, null, 5, null, 7, null, 9])), 2), /and 2 more$/);
});

test("the chart shows the date when supplied and nothing when it is not", async () => {
  const data = monthly([1, 2, 3]);
  const withDate = await render({ data, updated: chartUpdated({ source_published_date: "2026-11-14" }) });
  assert.match(withDate, /<time dateTime="2026-11-14">Updated 14 Nov 2026<\/time>/);
  const without = await render({ data, updated: chartUpdated({}) });
  assert.doesNotMatch(without, /Updated \d|Retrieved|<time/);
});

test("the gap note appears only when the visible range contains a gap", async () => {
  const none = await render({ data: monthly([1, 2, 3, 4]) });
  assert.doesNotMatch(none, /Gaps in the line|no official figure/);
  const gapped = await render({ data: monthly([1, 2, null, 4]) });
  assert.match(gapped, /Gaps in the line are periods with no official figure: March 2025\./);
  assert.match(gapped, /Periods with no official figure: March 2025\./, "accessible name carries the gap");
});

test("a gap outside the selected range is not announced", async () => {
  // The 2018 gap is older than the default five-year window ending December 2025.
  const old = monthly([1, null, 3], [2018, 1]);
  const recent = monthly(Array.from({ length: 12 }, (_, i) => i + 1), [2025, 1]);
  const html = await render({ data: [...old, ...recent] });
  assert.doesNotMatch(html, /Gaps in the line/);
});

test("the exact-values table reports the missing period as missing, not zero", async () => {
  const html = await render({ data: monthly([1, null, 3]), unit: "%" });
  assert.match(html, /<td>Missing<\/td>/);
  assert.doesNotMatch(html, /<td>0%<\/td>/);
});
