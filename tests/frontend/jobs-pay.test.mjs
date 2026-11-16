// Jobs & Pay reads every measure in one fixed order (ADR 0001, issue #87):
// Key figure, What it means, Chart, Sources. The AI summary row is omitted because
// the only AI reports are Bank of England MPC/FSR commentary. Old anchors still resolve.
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";

async function renderJobsPay(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/jobs-pay", initialData }));
  } finally { await server.close(); }
}
const section = (html, id) => {
  const start = html.indexOf(`<section class="fs-block" id="${id}"`);
  assert.ok(start >= 0, `${id} section exists`);
  return html.slice(start, html.indexOf("</section>", start));
};

test("each Jobs & Pay measure reads Key figure, What it means, Chart, Sources in order", async () => {
  const html = await renderJobsPay(fullFixture());
  for (const id of ["wages", "unemployment"]) {
    const labels = [...section(html, id).matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);
    assert.deepEqual(labels, ["Key figure", "What it means", "Chart", "Sources"], id);
  }
  for (const id of ["figures", "wages", "unemployment"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.ok(html.indexOf('id="wages"') < html.indexOf('id="unemployment"'));
  // No empty AI row, and no AI-labelled box inside a measure.
  assert.doesNotMatch(html, /fs-ai-box/);
});

test("Jobs & Pay figures carry units, windows and the after-inflation context", async () => {
  const html = await renderJobsPay(fullFixture());
  const wages = textOf(section(html, "wages"));
  assert.match(wages, /Key figure 3\.7 ?%/);
  assert.match(wages, /Previous 3\.6% May to Jul 2026/);
  assert.match(wages, /Change\* ↑ Up \+0\.1 pp/);
  assert.match(wages, /Reference window Jun to Aug 2026/);
  assert.match(wages, /Official figure · Office for National Statistics/);
  assert.match(wages, /After inflation \(CPIH-adjusted\) 0\.6% for Jun to Aug 2026 · No change vs May to Jul 2026 \(windows overlap\)/);
  assert.match(wages, /Same published window as nominal pay/);
  assert.match(wages, /Chart points sit at the ending month of each rolling three-month window/);
  assert.match(wages, /LMS \/ KAI9/);
  assert.match(wages, /LMS \/ A2FA/);
  const jobs = textOf(section(html, "unemployment"));
  assert.match(jobs, /Key figure 4\.7 ?%/);
  assert.match(jobs, /Previous 4\.9% May to Jul 2026/);
  assert.match(jobs, /↓ Down −0\.2 pp/);
  assert.match(jobs, /Chart points sit at the ending month/);
  assert.match(jobs, /LMS \/ MGSX/);
  assert.match(html, /\* Change is the latest value minus the previous published window/);
});

test("Jobs & Pay keeps an unmatched real-pay window honest", async () => {
  const data = fullFixture();
  data.metrics.regular_pay_real_growth.latest.reference.start_month = "2026-05";
  const wages = textOf(section(await renderJobsPay(data), "wages"));
  assert.match(wages, /Separate window, not directly matched to nominal pay/);
});

test("without verified data Jobs & Pay shows honest placeholders and no zero", async () => {
  const html = await renderJobsPay(null);
  assert.match(html, /Charts will appear when verified figures are available/);
  assert.match(html, /Checking the official-data export/);
  assert.doesNotMatch(html, /fs-fig-v/);
  const missing = fullFixture();
  missing.metrics.unemployment = { ...missing.metrics.unemployment, latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
  missing.metrics.regular_pay_real_growth = { ...missing.metrics.regular_pay_real_growth, latest: null, history: [] };
  const page = await renderJobsPay(missing);
  const jobs = textOf(section(page, "unemployment"));
  assert.match(jobs, /Key figure Not available/);
  assert.match(jobs, /A verified history is not available yet/);
  assert.doesNotMatch(jobs, /Key figure [+−]?0(\.0+)?%/);
  const wages = textOf(section(page, "wages"));
  assert.match(wages, /After inflation \(CPIH-adjusted\) Not available/);
  assert.match(wages, /Key figure 3\.7 ?%/);
});
