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
  assert.match(html, /How to read Budget announcements/);
  assert.doesNotMatch(html, /Start with who is affected|What to look for<|fs-eyebrow">(What to look for|Checking the wider picture)/);
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
  // Methodology sits in a "How it's measured" disclosure; two plain sentences stay visible.
  const means = section(await renderGovernment(fixture()), "public-debt");
  const visible = textOf(means.slice(means.indexOf("fs-means"), means.indexOf("<details")));
  assert.match(visible, /Public sector net debt is how much the public sector owes/);
  assert.doesNotMatch(visible, /PSNFL|not seasonally adjusted/);
  assert.match(means, /<details class="fs-more">(?:(?!<\/details>)[\s\S])*How it(?:'|&#x27;)s measured(?:(?!<\/details>)[\s\S])*PSNFL/);
});

test("Gilt yields show every number with % and basis points, and keep the honest caveat", async () => {
  const html = await renderGovernment(fixture());
  const gilts = textOf(section(html, "gilt-yields"));
  assert.match(gilts, /10-year gilt yield UK government 10-year borrowing cost 5\.35 ?%/, "10-year is the primary figure, named and shown at 2 decimal places");
  assert.match(gilts, /Previous 5\.37% 19 Oct 2026/);
  assert.match(gilts, /↓ Down −2\.2 bp/);
  assert.match(gilts, /Observed on 20 Oct 2026/);
  assert.match(gilts, /5-year 4\.97% 4\.96% 20 Oct 2026 ↑ Up \+0\.8 bp 21 Oct 2026/);
  assert.match(gilts, /20-year 5\.67% 5\.67% 20 Oct 2026 ↑ Up \+0\.1 bp 21 Oct 2026/);
  assert.match(gilts, /previous available trading observation/);
  assert.match(gilts, /One percentage point equals 100 basis points/);
  assert.match(gilts, /market financing conditions/);
  assert.match(gilts, /not the average cost of the government’s outstanding debt/);
  assert.match(gilts, /IUDSNPY, IUDMNPY and IUDLNPY/);
  assert.match(gilts, /Variable Roughness Penalty/);
  assert.match(gilts, /4 January 2000/);
  assert.match(gilts, /Last successful checks: 5-year .*; 10-year .*; 20-year /);
  // No four-decimal yield is shown; the exact values stay in the data, not on the cards.
  assert.doesNotMatch(gilts, /5\.3516|4\.9700|5\.6700/);
  assert.match(html, /1 pp = 100 bp/);
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
  assert.match(html, /How to read Budget announcements/);

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
  assert.match(gilts, /Key figure 10-year gilt yield UK government 10-year borrowing cost Not available/);
  assert.match(gilts, /5-year Not available Not available Not available No verified reading yet/);
  assert.doesNotMatch(gilts, /[+−]?0(\.0+)?%/);
});

test("gilt methodology sits in a disclosure, off the Sources one-liner, with two plain sentences visible", async () => {
  const block = section(await renderGovernment(fixture()), "gilt-yields");
  const means = block.slice(block.indexOf('fs-means'), block.indexOf("<details"));
  const visible = textOf(means);
  assert.match(visible, /10-year gilt yield is the return investors require/);
  assert.equal((means.match(/<p>/g) ?? []).length, 2, "two plain sentences visible");
  assert.doesNotMatch(visible, /IUDSNPY|Variable Roughness|nominal par|4 January 2000|Last successful checks/);
  const measured = /How it(?:'|&#x27;)s measured/;
  const disclosure = block.slice(block.indexOf("<details"), block.indexOf("</details>"));
  assert.match(disclosure, measured);
  assert.match(disclosure, /IUDSNPY[\s\S]*4 January 2000[\s\S]*Last successful checks/);
  // The Sources row is the one-line disclosure and no longer carries the methodology note.
  const sources = block.slice(block.lastIndexOf("<details"));
  assert.match(textOf(sources), /Source: Bank of England · checked/);
  assert.doesNotMatch(sources, /IUDSNPY|Last successful checks/);
});

test("2 decimal display rounds half away from zero and never shows a real change as zero", async () => {
  const data = fixture();
  const set = (key, latest, previous) => {
    const metric = data.metrics[key];
    metric.latest = { ...metric.latest, value: latest };
    metric.history = [...metric.history.slice(0, -1), { ...metric.history.at(-1), value: previous }, { ...metric.latest, value: latest }];
  };
  set("gilt_10y", "5.3151", "5.3050");
  set("gilt_5y", "4.9950", "5.0050");
  const gilts = textOf(section(await renderGovernment(data), "gilt-yields"));
  assert.match(gilts, /10-year gilt yield UK government 10-year borrowing cost 5\.32 ?%/);
  assert.match(gilts, /Previous 5\.31% /);
  assert.match(gilts, /Up \+1\.0 bp/);
  assert.match(gilts, /5-year 5\.00% 5\.01% .* Down −1\.0 bp/);
});
