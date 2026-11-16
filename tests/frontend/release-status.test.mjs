import test from "node:test";
import assert from "node:assert/strict";
import { createSummaryRefreshController, loadSummaries, summariesNotPublished } from "../../src/app/data/summaries.mjs";

const bytes = (text) => new TextEncoder().encode(text).buffer;
const reply = (body, { status = 200, type = "application/json" } = {}) => ({
  ok: status >= 200 && status < 300, status, headers: new Headers({ "content-type": type }), arrayBuffer: async () => bytes(body),
});

/** Run the real loader through the real refresh controller, as the page does. */
async function firstLoad(fetcher) {
  const owner = createSummaryRefreshController({ initialData: null, load: (signal) => loadSummaries("/", fetcher, signal) });
  await owner.refresh();
  return owner.snapshot;
}

test("an unpublished feed (404 or SPA fallback HTML) is classed as not published", async () => {
  for (const [label, fetcher] of [
    ["404", async () => reply("Not found", { status: 404, type: "text/html" })],
    ["html content type", async () => reply("<!doctype html><title>FinStats</title>", { type: "text/html; charset=utf-8" })],
    ["html body with a json content type", async () => reply("<!doctype html><html></html>")],
  ]) {
    const snapshot = await firstLoad(fetcher);
    assert.equal(snapshot.status, "error", label);
    assert.equal(snapshot.data, null, label);
    assert.equal(summariesNotPublished(snapshot.error), true, label);
  }
});

test("a published feed that fails on first load is not classed as not published", async () => {
  const manifest = JSON.stringify({ schema_version: 1, updated_at: "2026-11-01T00:00:00Z", summaries: {} });
  const status = JSON.stringify({ schema_version: 1, status: "current", updated_at: "2026-11-01T00:00:00Z" });
  const files = (overrides) => async (url) => {
    const name = url.split("/").pop();
    const body = overrides[name] ?? { "summary-manifest.json": manifest, "summary-status.json": status }[name];
    if (body instanceof Error) throw body;
    return typeof body === "object" ? body : reply(body);
  };
  for (const [label, fetcher] of [
    ["network error", files({ "summary-manifest.json": new TypeError("Failed to fetch") })],
    ["server error", files({ "summary-manifest.json": reply("", { status: 503 }) })],
    ["invalid json", files({ "summary-manifest.json": "{not json" })],
    ["failed validation", files({ "summary-manifest.json": JSON.stringify({ schema_version: 2 }) })],
    ["status file missing", files({ "summary-status.json": reply("", { status: 404 }) })],
    ["status file html", files({ "summary-status.json": "<html></html>" })],
  ]) {
    const snapshot = await firstLoad(fetcher);
    assert.equal(snapshot.status, "error", label);
    assert.equal(snapshot.data, null, label);
    assert.ok(snapshot.error, label);
    assert.equal(summariesNotPublished(snapshot.error), false, label);
  }
});

test("release explanations panel: hidden, calm status, or warning with retained data", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { ReleaseSummaries } = await server.ssrLoadModule("/src/app/components/ReleaseSummaries.tsx");
    const html = (props) => renderToStaticMarkup(createElement(ReleaseSummaries, { subject: "prices", metrics: {}, loading: false, refresh() {}, ...props }));
    const loaded = { status: { status: "current" }, summaries: [] };

    // Not published or still loading: no panel, no alert.
    for (const props of [{ data: null, error: "" }, { data: null, error: "", loading: true }, { data: null, error: "The latest data file is not available yet." }]) {
      assert.equal(html(props), "", JSON.stringify(props));
    }

    // Published but first load failed: calm status, official figures unaffected, not an alert.
    for (const error of ["We couldn’t reach the latest data. Please try again.", "The latest data did not pass our checks and has not been displayed."]) {
      const out = html({ data: null, error });
      assert.match(out, /release-explanations-prices/);
      assert.match(out, /role="status">Explanations of official releases are unavailable right now\. The official figures on this page are unaffected\./);
      assert.doesNotMatch(out, /role="alert"|could not be refreshed|No compatible published explanations/);
      assert.match(out, /aria-label="Refresh prices explanations"/);
    }

    // Failure after a successful load keeps prior data with a warning.
    const warned = html({ data: loaded, error: "We couldn’t reach the latest data. Please try again." });
    assert.match(warned, /The explanation check failed\. The previously loaded release periods remain visible\./);
    assert.doesNotMatch(warned, /unavailable right now/);
    assert.match(warned, /No compatible published explanations are available/);
    assert.doesNotMatch(html({ data: loaded, error: "" }), /explanation check failed/);
  } finally { await server.close(); }
});
