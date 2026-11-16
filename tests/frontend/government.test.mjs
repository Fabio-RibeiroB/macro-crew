// Government reads each measure in one fixed order (ADR 0001, issue #87):
// Key figure, What it means, Chart, Sources. Old anchors and the Budget guidance remain.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { textOf } from "./overview-helpers.mjs";

const fixture = () =>
  JSON.parse(readFileSync(new URL("../fixtures/verified/producer-fuel-v1.json", import.meta.url), "utf8"));

async function renderGovernment(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/government-budget", initialData }));
  } finally { await server.close(); }
}
const section = (html, id) => {
  const start = html.indexOf(`<section class="fs-block" id="${id}"`);
  assert.ok(start >= 0, `${id} section exists`);
  return html.slice(start, html.indexOf("</section>", start));
};
const labelsOf = (block) =>
  [...block.matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);

test("each Government measure reads Key figure, What it means, Chart, Sources in order", async () => {
  const html = await renderGovernment(fixture());
  for (const id of ["public-debt", "gilt-yields"]) {
    assert.deepEqual(labelsOf(section(html, id)), ["Key figure", "What it means", "Chart", "Sources"], id);
  }
  // No AI summary row: the current AI reports (MPC, Financial Stability Report) do not cover debt or gilts.
  assert.doesNotMatch(html.slice(html.indexOf('id="public-debt"'), html.indexOf("Three things to keep separate")), /AI summary|AI commentary/);
  for (const id of ["figures", "public-debt", "gilt-yields", "change-note"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.ok(html.indexOf('id="public-debt"') < html.indexOf('id="gilt-yields"'));
  assert.ok(html.indexOf('id="gilt-yields"') < html.indexOf("Three things to keep separate"));
  // Budget and OBR guidance is kept.
  assert.match(html, /Start with who is affected/);
  assert.match(html, /What do the independent forecasts say\?/);
  assert.match(html, /Read the Economic and Fiscal Outlook/);
});

test("Public debt figures carry units, pp change and the end-of-month reference", async () => {
  const debt = textOf(section(await renderGovernment(fixture()), "public-debt"));
  assert.match(debt, /Key figure 94\.0 ?%/);
  assert.match(debt, /Previous 93\.6% Aug 2026/);
  assert.match(debt, /↑ Up \+0\.4 pp/);
  assert.match(debt, /End of Sep 2026/);
  assert.match(debt, /Official figure · Office for National Statistics/);
  assert.match(debt, /percentage points \(pp\), not percent growth/);
  assert.match(debt, /deficit, or net borrowing, is the amount borrowed over a period/);
  assert.match(debt, /HF6X/);
});

test("Gilt yields show every number with %, pp and basis points, and keep the honest caveat", async () => {
  const html = await renderGovernment(fixture());
  const gilts = textOf(section(html, "gilt-yields"));
  assert.match(gilts, /Key figure 5\.3516 ?%/, "10-year is the primary figure");
  assert.match(gilts, /Previous 5\.374% 19 Oct 2026/);
  assert.match(gilts, /↓ Down −0\.0224 pp −2\.24 basis points/);
  assert.match(gilts, /Observed on 20 Oct 2026/);
  assert.match(gilts, /5-year 4\.9700% 4\.9618% 20 Oct 2026 ↑ Up \+0\.0082 pp \+0\.82 basis points 21 Oct 2026/);
  assert.match(gilts, /20-year 5\.6700% 5\.6687% 20 Oct 2026 ↑ Up \+0\.0013 pp \+0\.13 basis points 21 Oct 2026/);
  assert.match(gilts, /previous available trading observation/);
  assert.match(gilts, /One percentage point equals 100 basis points/);
  assert.match(gilts, /market financing conditions/);
  assert.match(gilts, /not the average cost of the government’s outstanding debt/);
  assert.match(gilts, /IUDSNPY, IUDMNPY and IUDLNPY/);
  assert.match(gilts, /4 January 2000/);
  assert.match(html, /1 pp = 100 basis points/);
  // The degraded 10-year series is flagged rather than hidden.
  assert.match(gilts, /Update delayed · showing last verified figure/);
});

test("Government charts sit between the explanation and the sources", async () => {
  const html = await renderGovernment(fixture());
  for (const id of ["public-debt", "gilt-yields"]) {
    const text = textOf(section(html, id));
    assert.ok(text.indexOf("Chart Loading chart") > text.indexOf("What it means"), id);
    assert.ok(text.indexOf("Chart Loading chart") < text.indexOf("Sources"), id);
  }
  assert.equal((section(html, "gilt-yields").match(/Loading chart/g) ?? []).length, 3);
});

test("without verified data Government shows honest placeholders and no zero", async () => {
  const html = await renderGovernment(null);
  assert.match(html, /Checking the official-data export/);
  assert.match(html, /Charts will appear when verified figures are available/);
  assert.doesNotMatch(html, /fs-fig-v/);
  assert.match(html, /Start with who is affected/);

  const missing = fixture();
  for (const key of ["public_debt", "gilt_10y", "gilt_5y", "gilt_20y"]) {
    missing.metrics[key] = { ...missing.metrics[key], latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
  }
  const page = await renderGovernment(missing);
  const debt = textOf(section(page, "public-debt"));
  assert.match(debt, /Key figure Not available/);
  assert.match(debt, /A verified history is not available yet/);
  assert.doesNotMatch(debt, /Key figure [+−]?0(\.0+)?%/);
  const gilts = textOf(section(page, "gilt-yields"));
  assert.match(gilts, /Key figure Not available/);
  assert.match(gilts, /5-year Not available Not available Not available No verified reading yet/);
  assert.doesNotMatch(gilts, /[+−]?0(\.0+)?%/);
});
