import test from "node:test";
import assert from "node:assert/strict";
import { parseAiStatus, aiFailureNotice, loadAiStatus } from "../../src/app/data/aiStatus.mjs";

const raw = (over = {}) => ({
  schema_version: 1,
  last_attempt_at: "2026-11-16T17:00:12Z",
  outcome: "failed",
  failure_kind: "credit",
  last_success_at: "2026-11-12T17:00:09Z",
  ...over,
});
const SUMMARY_TIME = "2026-03-22T15:55:45.707401Z";

test("each failure kind has plain wording with both dates and the figures reassurance", () => {
  const reasons = {
    credit: "the AI service account is out of credit",
    auth: "the AI service did not accept its access key",
    rate_limit: "the AI service was limiting requests",
    timeout: "the update took too long to finish",
    validation: "the new summary did not pass its checks",
    other: "the update did not complete",
  };
  for (const [kind, reason] of Object.entries(reasons)) {
    const notice = aiFailureNotice(parseAiStatus(raw({ failure_kind: kind })), "2026-11-12T17:00:09Z");
    assert.equal(
      notice,
      `The AI summary could not be updated on 16 November 2026 (${reason}). Showing the summary from 12 November 2026. Official figures are unaffected.`,
      kind,
    );
  }
  // A null kind on a failed attempt is treated as "other".
  assert.match(aiFailureNotice(parseAiStatus(raw({ failure_kind: null })), null), /\(the update did not complete\)/);
});

test("ok, stale and unusable statuses show nothing", () => {
  assert.equal(aiFailureNotice(parseAiStatus(raw({ outcome: "ok", failure_kind: null })), SUMMARY_TIME), null);
  assert.equal(aiFailureNotice(null, SUMMARY_TIME), null);
  // The displayed summary is newer than the failed attempt: the notice is stale.
  assert.equal(aiFailureNotice(parseAiStatus(raw()), "2026-11-17T09:00:00Z"), null);
  for (const bad of [null, undefined, "x", [], {}, raw({ schema_version: 2 }), raw({ outcome: "maybe" }),
    raw({ last_attempt_at: "yesterday" }), raw({ failure_kind: "<script>" })]) {
    assert.equal(parseAiStatus(bad), null);
  }
});

test("summary date falls back to last success, then is omitted", () => {
  const status = parseAiStatus(raw());
  assert.match(aiFailureNotice(status, null), /Showing the summary from 12 November 2026\./);
  const none = parseAiStatus(raw({ last_success_at: null }));
  assert.doesNotMatch(aiFailureNotice(none, null), /Showing the summary/);
  assert.match(aiFailureNotice(none, null), /Official figures are unaffected\.$/);
});

test("loader returns null for a missing, invalid or unreachable file", async () => {
  const json = (body, ok = true) => async () => ({ ok, json: async () => body });
  assert.equal((await loadAiStatus("/", json(raw()))).failureKind, "credit");
  assert.equal(await loadAiStatus("/", json({}, false)), null);
  assert.equal(await loadAiStatus("/", json({ nonsense: 1 })), null);
  assert.equal(await loadAiStatus("/", async () => { throw new Error("offline"); }), null);
  let url;
  await loadAiStatus("/base/", async (u) => { url = u; return { ok: false }; });
  assert.equal(url, "/base/ai_status.json");
});

test("AI summary section renders the notice inside #ai-summary only when failed", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { AiCommentary } = await server.ssrLoadModule("/src/app/components/SubjectBlock.tsx");
    const render = (aiStatus) => renderToStaticMarkup(createElement(AiCommentary, { reports: [], reportTime: SUMMARY_TIME, aiStatus }));
    const failed = render(parseAiStatus(raw()));
    assert.match(failed, /<p class="fs-ai-fail" role="status">The AI summary could not be updated on 16 November 2026 \(the AI service account is out of credit\)\. Showing the summary from 22 March 2026\. Official figures are unaffected\.<\/p>/);
    assert.ok(failed.startsWith('<div class="fs-ai-box"><p class="fs-ai-fail"'), "notice sits at the top of the section");
    const withReport = renderToStaticMarkup(createElement(AiCommentary, {
      reports: [{ key: "monetary_policy_report", summary: "Rates held. Inflation fell.", report_date: "2026-03-19", source: "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/march-2026" }],
      reportTime: SUMMARY_TIME, aiStatus: parseAiStatus(raw()),
    }));
    assert.ok(withReport.indexOf("fs-ai-fail") < withReport.indexOf("fs-ai-tag"), "notice stays above the summaries");
    assert.match(withReport, /<span class="fs-ai-tag">AI summary<\/span>/);
    for (const quiet of [parseAiStatus(raw({ outcome: "ok", failure_kind: null })), null, undefined]) {
      assert.doesNotMatch(render(quiet), /fs-ai-fail|could not be updated/);
    }
    // Existing behaviour is unchanged without the new prop.
    assert.match(renderToStaticMarkup(createElement(AiCommentary, { reports: [], reportTime: null })), /The AI summary could not be loaded/);
  } finally { await server.close(); }
});
