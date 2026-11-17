// Economy reads every measure in one fixed order (ADR 0001, issue #87):
// Key figure, What it means, Chart, AI summary, Sources. Old anchors still resolve.
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";

async function renderEconomy(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/economy", initialData }));
  } finally { await server.close(); }
}
const section = (html, id) => {
  const start = html.indexOf(`<section class="fs-block" id="${id}"`);
  assert.ok(start >= 0, `${id} section exists`);
  return html.slice(start, html.indexOf("</section>", start));
};

test("each Economy measure reads Key figure, What it means, Chart, AI summary, Sources in order", async () => {
  const html = await renderEconomy(fullFixture());
  for (const id of ["interest-rates", "gdp"]) {
    const block = section(html, id);
    const labels = [...block.matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);
    assert.deepEqual(labels, ["Key figure", "What it means", "Chart", "AI summary", "Sources"], id);
  }
  // Anchors from the earlier layout still resolve.
  for (const id of ["figures", "interest-rates", "gdp", "ai-summary", "trends", "publications"])
    assert.match(html, new RegExp(`id="${id}"`), id);
  assert.ok(html.indexOf('id="interest-rates"') < html.indexOf('id="gdp"'));
  assert.ok(html.indexOf('id="gdp"') < html.indexOf('id="publications"'));
});

test("Economy key figures carry units, neutral change and the FinStats footnote", async () => {
  const html = await renderEconomy(fullFixture());
  const bank = textOf(section(html, "interest-rates"));
  assert.match(bank, /Key figure 3\.75 ?%/);
  assert.match(bank, /Official figure · Bank of England/);
  assert.match(bank, /Observed on 19 Oct 2026/);
  const gdp = textOf(section(html, "gdp"));
  assert.match(gdp, /Key figure \+0\.1 ?%/);
  assert.match(gdp, /↓ Down −0\.3 pp/);
  assert.match(gdp, /Previous \+0\.4% Jul 2026/);
  assert.match(html, /\* Change is the latest value minus the previous one, calculated by FinStats/);
  assert.doesNotMatch(html, /UK figures|Latest verified figures/);
  assert.doesNotMatch(html, /<h[12][^>]*>[^<]*\bUK\b/, "headings do not repeat UK");
});

test("Economy keeps the AI commentary labelled and the chart row between meaning and summary", async () => {
  const html = await renderEconomy(fullFixture());
  const bank = section(html, "interest-rates");
  assert.match(textOf(bank), /The AI summary could not be loaded/);
  assert.doesNotMatch(bank, /not checked against the official figures/);
  assert.match(textOf(section(html, "gdp")), /There is no AI summary for GDP yet/);
  // The trend card is lazy, so server rendering shows its loading state in the Chart row.
  const text = textOf(bank);
  assert.ok(text.indexOf("Chart Loading chart") > text.indexOf("What it means"));
  assert.ok(text.indexOf("Chart Loading chart") < text.indexOf("AI summary"));
});

test("without verified data Economy shows honest placeholders and no zero", async () => {
  const html = await renderEconomy(null);
  assert.match(html, /Charts will appear when verified figures are available/);
  assert.match(html, /Checking the official-data export/);
  assert.doesNotMatch(html, /fs-fig-v/);
  const missing = fullFixture();
  missing.metrics.gdp = { ...missing.metrics.gdp, latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
  const partial = textOf(section(await renderEconomy(missing), "gdp"));
  assert.match(partial, /Key figure Not available/);
  assert.match(partial, /A verified history is not available yet/);
  assert.doesNotMatch(partial, /Key figure [+−]?0(\.0+)?%/);
});
