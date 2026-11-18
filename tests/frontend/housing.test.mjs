// Housing reads every measure in one fixed order (ADR 0001, issue #87):
// Key figure, What it means, Chart, Sources. There is no AI summary row because no
// AI report covers housing. Old anchors still resolve.
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";

async function renderHousing(initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname: "/housing", initialData }));
  } finally { await server.close(); }
}
const section = (html, id) => {
  const start = html.indexOf(`<section class="fs-block" id="${id}"`);
  assert.ok(start >= 0, `${id} section exists`);
  return html.slice(start, html.indexOf("</section>", start));
};

test("each Housing measure reads Key figure, What it means, Chart, Sources in order", async () => {
  const html = await renderHousing(fullFixture());
  for (const id of ["rent", "house-prices"]) {
    const block = section(html, id);
    const labels = [...block.matchAll(/<h3 class="fs-row-label"[^>]*>([^<]+)<\/h3>/g)].map(([, label]) => label);
    assert.deepEqual(labels, ["Key figure", "What it means", "Chart", "Sources"], id);
    assert.doesNotMatch(block, /fs-ai-box|AI summary|AI commentary/, `${id} has no AI row`);
    assert.match(block, new RegExp(`<h2 id="${id}-title">`));
  }
  // Anchors from the earlier layout still resolve, in the earlier order.
  for (const id of ["rent", "house-prices"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.ok(html.indexOf('id="rent"') < html.indexOf('id="house-prices"'));
  assert.doesNotMatch(html, /<h[12][^>]*>[^<]*\bUK\b/, "headings do not repeat UK");
});

test("Housing key figures carry a unit on every number", async () => {
  const html = await renderHousing(fullFixture());
  const rent = textOf(section(html, "rent"));
  assert.match(rent, /Key figure 3\.8 ?%/);
  assert.match(rent, /Official figure · Office for National Statistics/);
  assert.match(rent, /Previous 3\.8 ?% Aug 2026/);
  assert.match(rent, /Change\* No change Average £1,406\/month/);
  assert.match(rent, /Period Sep 2026/);
  const prices = textOf(section(html, "house-prices"));
  assert.match(prices, /Key figure £273,037/);
  assert.match(prices, /0\.9% on a year earlier/);
  assert.match(prices, /Period Aug 2026/);
  assert.match(prices, /Official figure · HM Land Registry and ONS/);
  assert.match(html, /\* Change is the latest value minus the previous one/);
  assert.doesNotMatch(rent + prices, /Key figure [+−]?0(\.0+)?%?(?!\d)/);
});

test("Housing keeps the provisional, revision and imputation caveats", async () => {
  const html = await renderHousing(fullFixture());
  const rent = textOf(section(html, "rent"));
  assert.match(rent, /two-month revision window/);
  assert.match(rent, /latest two months are provisional/);
  assert.match(rent, /Northern Ireland data for those two months are imputed/);
  assert.match(textOf(section(html, "house-prices")), /latest estimates are provisional and may be revised/);
});

test("Housing shows both charts per measure with their units, after What it means", async () => {
  const html = await renderHousing(fullFixture());
  for (const id of ["rent", "house-prices"]) {
    const block = section(html, id);
    // The trend card is lazy, so server rendering shows its loading state in the Chart row.
    const text = textOf(block);
    assert.ok(text.indexOf("Chart Loading chart") > text.indexOf("What it means"), id);
    assert.ok(text.indexOf("Chart Loading chart") < text.indexOf("Sources"), id);
  }
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { HousingPage } = await server.ssrLoadModule("/src/app/components/HousingPage.tsx");
    const { HistoricalTrendCard: Card } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const markup = renderToStaticMarkup(createElement(HousingPage, {
      data: fullFixture(), loading: false, error: null, refresh() {}, HistoricalTrendCard: Card,
    }));
    for (const phrase of [
      "Exact values in percent", "Exact values in pounds per month", "Exact values in pounds\\.",
    ]) assert.match(markup, new RegExp(phrase));
    for (const label of ["Annual rent growth", "Average monthly rent", "Average house price", "Annual change"])
      assert.match(markup, new RegExp(label), label);
  } finally { await server.close(); }
});

test("Housing lists the secondary series in Sources and links the official releases", async () => {
  const html = await renderHousing(fullFixture());
  const rent = section(html, "rent");
  assert.match(textOf(rent), /Average monthly rent Price Index of Private Rents, UK: monthly price statistics, Table 1 \/ Rental price/);
  assert.match(rent, /href="https:\/\/www\.ons\.gov\.uk\/economy\/inflationandpriceindices\/datasets\/priceindexofprivaterentsukmonthlypricestatistics"/);
  const prices = section(html, "house-prices");
  assert.match(textOf(prices), /Annual change UK House Price Index: Average price \/ Annual_Change/);
  assert.match(prices, /href="https:\/\/www\.gov\.uk\/government\/collections\/uk-house-price-index-reports"/);
});

test("without verified data Housing shows honest placeholders and no zero", async () => {
  const html = await renderHousing(null);
  assert.match(html, /Charts will appear when verified figures are available/);
  assert.match(html, /Checking the official-data export/);
  assert.doesNotMatch(html, /fs-fig-v/);
  const missing = fullFixture();
  const gone = { latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
  missing.metrics.house_price_level = { ...missing.metrics.house_price_level, ...gone };
  missing.metrics.private_rent_level = { ...missing.metrics.private_rent_level, ...gone };
  const partial = await renderHousing(missing);
  const prices = textOf(section(partial, "house-prices"));
  assert.match(prices, /Key figure Not available/);
  assert.match(prices, /0\.9% on a year earlier \(Aug 2026\)/);
  assert.doesNotMatch(prices, /£0\b/);
  const rent = textOf(section(partial, "rent"));
  assert.match(rent, /Key figure 3\.8 ?%/);
  assert.match(rent, /Average rent: Not available/);
  assert.doesNotMatch(rent, /£0\b/);
  // The headline chart is still drawn for the series that has history.
  assert.match(rent, /Chart Loading chart/);
  const none = fullFixture();
  none.metrics.house_price_level = { ...none.metrics.house_price_level, ...gone };
  none.metrics.house_price_growth = { ...none.metrics.house_price_growth, ...gone };
  assert.match(textOf(section(await renderHousing(none), "house-prices")), /A verified history is not available yet/);
});

async function renderHousingWithCard(data) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { HousingPage } = await server.ssrLoadModule("/src/app/components/HousingPage.tsx");
    const { HistoricalTrendCard: Card } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    return renderToStaticMarkup(createElement(HousingPage, { data, loading: false, error: null, refresh() {}, HistoricalTrendCard: Card }));
  } finally { await server.close(); }
}

test("House prices shows a labelled after-inflation chart with its base month, official figure stays primary", async () => {
  const html = await renderHousingWithCard(fullFixture());
  const text = textOf(html);
  // The recorded house prices end in August 2026 and CPI in September 2026: the base is August.
  assert.match(text, /After inflation \(FinStats calculation using ONS CPI, August 2026 prices\)/);
  assert.match(text, /Exact values in pounds in August 2026 prices/);
  assert.match(text, /The second chart is a FinStats calculation, not an official statistic/);
  assert.match(text, /CPI index, used for the after-inflation chart/);
  assert.doesNotMatch(text, /House prices after inflation are not shown/);
  // The official chart and key figure come first and are unchanged.
  assert.ok(text.indexOf("Average house price") < text.indexOf("After inflation (FinStats calculation"));
  const full = await renderHousing(fullFixture());
  const prices = textOf(section(full, "house-prices"));
  assert.match(prices, /Key figure £273,037/);
  assert.match(prices, /Official figure · HM Land Registry and ONS/);
});

test("without the CPI index the real-price view is hidden with an honest note", async () => {
  for (const mutate of [
    (data) => { delete data.metrics.cpi_index; },
    (data) => {
      data.metrics.cpi_index = { ...data.metrics.cpi_index, latest: null, history: [], collection_status: "unavailable", validation_status: "unavailable" };
    },
  ]) {
    const data = fullFixture();
    mutate(data);
    const html = await renderHousingWithCard(data);
    const text = textOf(html);
    assert.doesNotMatch(text, /After inflation \(FinStats calculation/);
    assert.doesNotMatch(text, /The second chart is a FinStats calculation/);
    assert.match(text, /House prices after inflation are not shown because the official ONS CPI index is not available yet/);
    assert.match(text, /Average house price/); // the official charts remain
    const page = textOf(section(await renderHousing(data), "house-prices"));
    assert.match(page, /Key figure £273,037/);
  }
});

test("Housing says which average each £ figure is (#149)", async () => {
  const html = await renderHousing(fullFixture());
  const prices = textOf(section(html, "house-prices")).replace(/&#x27;|’/g, "'");
  assert.match(prices, /UK House Price Index average price: a mix-adjusted average \(geometric mean\) of sale prices, not the median/);
  assert.match(prices, /Mix-adjusted means it reflects a typical mix of homes/);
  assert.match(prices, /ratio below uses the median price paid in England and Wales, which is a different measure, so the two £ figures should not be compared directly/);
  const charted = textOf(await renderHousingWithCard(fullFixture()));
  assert.match(charted, /Average house price \(UK HPI, mix-adjusted\)/);
  assert.match(charted, /Average house price after inflation \(UK HPI, mix-adjusted\)/);
  assert.match(charted, /Average monthly rent \(ONS PIPR, mix-adjusted\)/);
  assert.match(textOf(section(html, "rent")), /mix-adjusted average \(a weighted geometric mean\), not the median/);
});

test("Housing keeps What it means short, with the average labelled and detail in a MoreDetail (ADR 0004)", async () => {
  const html = await renderHousing(fullFixture());
  const meansCell = (block) => />What it means<\/h3><div[^>]*>([\s\S]*?)<\/div><\/div><div class="fs-row"/.exec(block)[1];
  const visibleOf = (cell) => textOf(cell.replace(/<details[\s\S]*?<\/details>/g, "")).replace(/&#x27;|’/g, "'");
  for (const id of ["rent", "house-prices"]) {
    const cell = meansCell(section(html, id));
    assert.match(cell, /<details class="fs-more">/, `${id} has a MoreDetail`);
    assert.match(visibleOf(cell), /mix-adjusted, not the median/, `${id} says which average it is, visibly`);
    assert.ok(visibleOf(cell).split(" ").length < 70, `${id} visible text is short`);
  }
  const prices = visibleOf(meansCell(section(html, "house-prices")));
  assert.match(prices, /^UK House Price Index average \(mix-adjusted, not the median\)/);
  assert.match(prices, /FinStats calculation, not an official statistic/, "the after-inflation chart is labelled visibly");
  assert.doesNotMatch(prices, /should not be compared directly/, "the comparison caveat is inside the disclosure");
});
