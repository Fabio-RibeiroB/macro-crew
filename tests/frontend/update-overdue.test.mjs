// M14 slice 3: an overdue figure stays visible with a plain "Update overdue" note.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fullFixture, overviewRowsOf, textOf } from "./overview-helpers.mjs";
import { freshness, OVERDUE_LABEL, releaseOverdue } from "../../src/app/data/verified.mjs";

const NOW = new Date("2026-11-26T09:00:00Z");
const rent = (patch = {}) => {
  const metric = structuredClone(fullFixture().metrics.private_rent_growth);
  return { ...metric, last_successful_check_at: NOW.toISOString(), ...patch };
};

async function withServer(run) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try { return await run({ server, createElement, renderToStaticMarkup }); } finally { await server.close(); }
}

test("freshness reports an overdue update when release_status is delayed and collection is ok", () => {
  const metric = rent({ collection_status: "ok", release_status: "delayed", next_release_date: null });
  assert.deepEqual(freshness(metric, NOW), { label: OVERDUE_LABEL, kind: "warning" });
  assert.match(OVERDUE_LABEL, /^Update overdue/);
  assert.equal(releaseOverdue(metric, NOW), true);
  assert.equal(metric.latest.value != null, true, "the last verified figure is kept");
});

test("awaiting, unknown and unavailable are not overdue; collector trouble keeps its own wording", () => {
  for (const release_status of ["awaiting_next_release", "unknown"]) {
    const metric = rent({ release_status, next_release_date: null });
    assert.deepEqual(freshness(metric, NOW), { label: "Checked against official data", kind: "ok" });
  }
  assert.equal(releaseOverdue({ latest: null, release_status: "delayed" }, NOW), false);
  assert.equal(
    freshness(rent({ collection_status: "degraded", release_status: "delayed" }), NOW).label,
    "Update delayed · showing last verified figure",
  );
});

test("a passed official next release date is overdue by the London date", () => {
  const metric = rent({ release_status: "awaiting_next_release", next_release_date: "2026-11-25" });
  assert.equal(freshness(metric, new Date("2026-11-25T23:30:00Z")).kind, "ok");
  assert.equal(freshness(metric, new Date("2026-11-26T00:30:00Z")).label, OVERDUE_LABEL);
});

test("cards and Sources show the note and keep the verified value visible", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const data = fullFixture();
    // Recorded next-release dates are in the past by now; only rents may be overdue here.
    for (const metric of Object.values(data.metrics)) {
      Object.assign(metric, { release_status: "awaiting_next_release", next_release_date: null });
    }
    for (const key of ["private_rent_growth", "private_rent_level"]) {
      Object.assign(data.metrics[key], {
        collection_status: "ok", release_status: "delayed", next_release_date: null,
        last_successful_check_at: new Date().toISOString(),
      });
    }
    const value = data.metrics.private_rent_growth.latest.value;
    // Overview table row.
    const overview = renderToStaticMarkup(createElement(App, { pathname: "/", initialData: data }));
    const row = textOf(overviewRowsOf(overview).rent);
    assert.match(row, /Update overdue/);
    assert.match(row, new RegExp(`${Number(value)}`));
    // Housing page: key figure line and the Sources row.
    const html = renderToStaticMarkup(createElement(App, { pathname: "/housing", initialData: data }));
    const text = textOf(html);
    assert.match(text, /Update overdue · showing last verified figure/);
    assert.match(html, /class="fs-overdue" role="status">Update overdue · showing last verified figure</);
    assert.match(text, new RegExp(`${Number(value)}`));
    // Figures that are not overdue carry no note.
    const quiet = renderToStaticMarkup(createElement(App, { pathname: "/economy", initialData: data }));
    assert.doesNotMatch(quiet, /Update overdue/);
  });
});

test("the overdue note wraps at narrow widths and never reaches the ticker", () => {
  const css = readFileSync(new URL("../../src/styles/friendly.css", import.meta.url), "utf8");
  const rule = /\.fs-overdue \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /white-space:\s*nowrap|(?:^|[^-])width:\s*\d+px/);
  for (const file of ["../../src/app/components/FiguresTicker.tsx", "../../src/app/data/ticker.mjs"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /freshness|releaseOverdue|OVERDUE_LABEL|release_status/, file);
  }
});
