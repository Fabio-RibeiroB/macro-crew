// M12 slice 6: every AI summary shows when the AI wrote it, beside the date of the Bank
// publication it summarises. A per-report time wins over the file-level time; with no
// usable time the page says so and never invents a date.
import test from "node:test";
import assert from "node:assert/strict";
import { aiWrittenAt, aiWrittenLabel, aiWrittenShort } from "../../src/app/data/aiSummary.mjs";
import { shortDate, shortDay } from "../../src/app/data/format.mjs";

const FILE_TIME = "2026-11-15T13:05:00.000Z";
const report = {
  key: "monetary_policy_report",
  summary: "The committee held Bank Rate. Inflation is expected to fall.",
  report_date: "2026-11-05",
  source: "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/november-2026",
};

test("dates use UK time, so a late-evening UTC instant lands on the UK calendar day", () => {
  assert.equal(shortDate("2026-11-15T13:05:00Z"), "15 Nov 2026");
  assert.equal(shortDay("2026-11-15T13:05:00Z"), "15 Nov");
  // 23:30 UTC on 30 June is 00:30 BST on 1 July.
  assert.equal(shortDate("2026-06-30T23:30:00Z"), "1 Jul 2026");
  for (const bad of [null, undefined, "", "not a date", "2026-11-15", 42, "2026-13-45T00:00:00Z"]) {
    assert.equal(shortDate(bad), null, String(bad));
    assert.equal(shortDay(bad), null, String(bad));
  }
});

test("the file-level time is used when the report has no time of its own", () => {
  assert.equal(aiWrittenAt(report, FILE_TIME), FILE_TIME);
  assert.equal(aiWrittenLabel(report, FILE_TIME), "AI summary written 15 Nov 2026");
  assert.equal(aiWrittenShort(report, FILE_TIME), "AI · 15 Nov");
});

test("a per-report time wins over the file-level time; an unusable one falls back", () => {
  const own = { ...report, generated_at: "2026-11-06T09:00:00Z" };
  assert.equal(aiWrittenAt(own, FILE_TIME), "2026-11-06T09:00:00Z");
  assert.equal(aiWrittenLabel(own, FILE_TIME), "AI summary written 6 Nov 2026");
  assert.equal(aiWrittenShort(own, FILE_TIME), "AI · 6 Nov");
  const broken = { ...report, generated_at: "yesterday" };
  assert.equal(aiWrittenLabel(broken, FILE_TIME), "AI summary written 15 Nov 2026");
});

test("with no known time the label says so and no date is shown", () => {
  for (const time of [null, undefined, "", "garbage"]) {
    assert.equal(aiWrittenAt(report, time), null);
    assert.equal(aiWrittenLabel(report, time), "AI summary date not recorded");
    assert.equal(aiWrittenShort(report, time), null);
  }
  assert.equal(aiWrittenLabel(undefined, null), "AI summary date not recorded");
});

test("the AI summary shows the publication date beside the written date; the MPC line shows the short date", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ·/g, " ·");
  try {
    const { AiCommentary } = await server.ssrLoadModule("/src/app/components/SubjectBlock.tsx");
    const { MpcLine } = await server.ssrLoadModule("/src/app/components/MpcLine.tsx");

    const shown = text(renderToStaticMarkup(createElement(AiCommentary, { reports: [report], reportTime: FILE_TIME })));
    assert.match(shown, /Bank of England report dated 5 November 2026 · AI summary written 15 Nov 2026/);

    // A per-report time is preferred over the file time.
    const own = text(renderToStaticMarkup(createElement(AiCommentary, { reports: [{ ...report, generated_at: "2026-11-06T09:00:00Z" }], reportTime: FILE_TIME })));
    assert.match(own, /AI summary written 6 Nov 2026/);
    assert.doesNotMatch(own, /15 Nov/);

    // No known time: say so, and show no written date.
    const none = text(renderToStaticMarkup(createElement(AiCommentary, { reports: [report], reportTime: null })));
    assert.match(none, /Bank of England report dated 5 November 2026 · AI summary date not recorded/);
    assert.doesNotMatch(none, /AI summary written/);

    // An undated publication still gets the written date.
    const undated = text(renderToStaticMarkup(createElement(AiCommentary, { reports: [{ ...report, report_date: null }], reportTime: FILE_TIME })));
    assert.match(undated, /Bank of England report, date not supplied · AI summary written 15 Nov 2026/);

    // Overview MPC line: short muted date, absent when no time is known.
    const line = renderToStaticMarkup(createElement(MpcLine, { reports: [report], reportTime: FILE_TIME }));
    assert.match(line, /<span class="fs-mpc-date"> AI · 15 Nov<\/span>/);
    assert.match(text(line), /MPC: The committee held Bank Rate\. AI · 15 Nov/);
    const ownLine = renderToStaticMarkup(createElement(MpcLine, { reports: [{ ...report, generated_at: "2026-11-06T09:00:00Z" }], reportTime: FILE_TIME }));
    assert.match(ownLine, /AI · 6 Nov/);
    const bare = renderToStaticMarkup(createElement(MpcLine, { reports: [report], reportTime: null }));
    assert.doesNotMatch(bare, /fs-mpc-date|AI · /);
    assert.match(bare, /The committee held Bank Rate\./);
  } finally { await server.close(); }
});
