// ADR 0003 news-style crawl: figure items come from the overview rows of the same
// verified snapshot; the MPC item is the tagged AI headline, with a factual fallback
// from official Bank Rate observations when there is no report.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewRows } from "../../src/app/data/overview.mjs";
import {
  MPC_DECISION_WINDOW_DAYS,
  itemText,
  motionState,
  mpcAiItem,
  mpcItem,
  tickerDuration,
  tickerItems,
} from "../../src/app/data/ticker.mjs";
import { fullFixture } from "./overview-helpers.mjs";

const HREFS = {
  cpi: "/prices#figures",
  bank_rate: "/economy#interest-rates",
  regular_pay_nominal_growth: "/jobs-pay#wages",
  unemployment: "/jobs-pay#unemployment",
  private_rent_growth: "/housing#rent",
  house_price_level: "/housing#house-prices",
  household_energy: "/prices#household-energy",
  petrol_price: "/prices#petrol-diesel",
  gdp: "/economy#gdp",
};
const REPORTS = [{ key: "monetary_policy_report", headline: "The Bank held rates and flagged slower inflation ahead.", summary: "Ignored when a headline exists." }];
const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));

/** Weekday dates from `start`, one per day, so the series has no unobserved weekday. */
function dailySeries(start, values) {
  const out = [];
  const date = new Date(`${start}T00:00:00Z`);
  for (const value of values) {
    out.push({ period: date.toISOString().slice(0, 10), status: "observed", value });
    do date.setUTCDate(date.getUTCDate() + 1);
    while ([0, 6].includes(date.getUTCDay()));
  }
  return out;
}
/** Bank Rate holding `before` for `pre` days, then `after` for `post` days. */
function bankRate(before, after, post, pre = 30) {
  const history = dailySeries("2026-01-05", [...Array(pre).fill(before), ...Array(post).fill(after)]);
  return { latest: history.at(-1), history, collection_status: "ok" };
}
const withBankRate = (metric) => {
  const data = fullFixture();
  data.metrics.bank_rate = metric;
  return data;
};

test("figure items read as plain English from the overview rows", () => {
  const data = fullFixture();
  const rows = Object.fromEntries(overviewRows(data).map((row) => [row.id, row]));
  const items = byId(tickerItems(data, HREFS));
  assert.equal(itemText(items.inflation), "Inflation: 3.5%, up from 3.1%");
  assert.equal(itemText(items.unemployment), "Unemployment: 4.7%, down from 4.9%");
  assert.equal(itemText(items["house-prices"]), "House prices: £273,037, up £891");
  assert.equal(itemText(items["fuel-petrol"]), "Petrol: 174.57p a litre, down 0.71p");
  assert.equal(itemText(items["fuel-diesel"]), "Diesel: 199.33p a litre, down 0.71p");
  assert.equal(itemText(items.gdp), "GDP growth: +0.1%, down from +0.4%");
  assert.equal(items.energy.label, "Energy price cap");
  assert.equal(items.energy.value, "£1,723 a year");
  assert.equal(items.energy.change, null, "not comparable: just the figure");
  assert.equal(items.inflation.change.dir, "up");
  assert.equal(items.unemployment.change.dir, "down");
  assert.equal(items.rent.change.text, "unchanged");
  assert.equal(items.rent.change.dir, "flat");
  // Same numbers as the table, never recomputed; no codes or arrows in the wording.
  assert.equal(items.wages.value, rows.wages.latest[0].text);
  assert.ok(items.wages.change.text.endsWith(rows.wages.previous[0].text));
  for (const item of Object.values(items)) assert.doesNotMatch(itemText(item), /[▲▼]|\bCPI\b| pp\b/, item.id);
});

test("a figure with no comparable earlier reading shows just the figure", () => {
  const data = fullFixture();
  data.metrics.cpi = { ...data.metrics.cpi, history: [data.metrics.cpi.history.at(-1)] };
  const inflation = byId(tickerItems(data, HREFS)).inflation;
  assert.equal(itemText(inflation), "Inflation: 3.5%");
  assert.equal(inflation.change, null);
});

test("every item links to its subject page and the strip never shows zero for a gap", () => {
  const items = tickerItems(fullFixture(), HREFS, REPORTS);
  assert.ok(items.length >= 9);
  for (const item of items) assert.match(item.href, /^\/[a-z-]+#/, item.id);
  const data = fullFixture();
  delete data.metrics.unemployment;
  data.metrics.gdp = { ...data.metrics.gdp, latest: null };
  data.metrics.petrol_price = { ...data.metrics.petrol_price, latest: null };
  const gaps = byId(tickerItems(data, HREFS));
  assert.equal(gaps.unemployment, undefined);
  assert.equal(gaps.gdp, undefined);
  assert.equal(gaps["fuel-petrol"], undefined);
  assert.ok(gaps["fuel-diesel"], "an available sibling stays");
  for (const item of Object.values(gaps)) assert.doesNotMatch(item.value, /^0(\.0+)?(%|p)?$|Not available/);
  assert.deepEqual(tickerItems(null, HREFS, REPORTS), []);
  assert.deepEqual(tickerItems({ metrics: {} }, HREFS).filter((item) => item.id !== "mpc"), []);
});

test("MPC item: the AI headline comes first, tagged and linked to the AI summary", () => {
  const items = tickerItems(withBankRate(bankRate("3.75", "4.00", 10)), HREFS, REPORTS);
  assert.equal(items[0].id, "mpc");
  assert.equal(items[0].ai, true);
  assert.equal(items[0].href, "/economy#ai-summary");
  assert.equal(itemText(items[0]), "MPC: AI The Bank held rates and flagged slower inflation ahead.");
  assert.equal(items.filter((item) => item.id === "mpc").length, 1);
  // Without a headline the first summary sentence is used, as on the overview line.
  const summaryOnly = tickerItems(fullFixture(), HREFS, [{ key: "monetary_policy_report", summary: "Rates held. Other detail." }]);
  assert.equal(summaryOnly[0].value, "Rates held.");
});

test("MPC fallback: factual Bank Rate wording without the AI tag", () => {
  for (const reports of [null, [], [{ key: "other" }]]) {
    const raised = tickerItems(withBankRate(bankRate("3.75", "4.00", 10)), HREFS, reports);
    assert.equal(raised[0].id, "mpc");
    assert.equal(raised[0].ai, false);
    assert.match(itemText(raised[0]), /^MPC: raised Bank Rate to 4\.00% on \d{1,2} \w{3}$/);
    assert.equal(raised[0].href, HREFS.bank_rate);
  }
  const cut = tickerItems(withBankRate(bankRate("4.00", "3.75", 10)), HREFS)[0];
  assert.match(itemText(cut), /^MPC: cut Bank Rate to 3\.75% on \d{1,2} \w{3}$/);
  const held = tickerItems(withBankRate(bankRate("4.00", "3.75", MPC_DECISION_WINDOW_DAYS + 20)), HREFS)[0];
  assert.equal(itemText(held), "MPC: held Bank Rate at 3.75%");
});

test("MPC fallback is omitted when Bank Rate cannot evidence a decision", () => {
  const flat = dailySeries("2026-01-05", Array(40).fill("3.75"));
  assert.equal(mpcItem({ latest: flat.at(-1), history: flat }, "3.75%"), null);
  assert.equal(mpcItem({ latest: null, history: [] }, "3.75%"), null);
  assert.equal(mpcItem(null, "3.75%"), null);
  assert.equal(byId(tickerItems(withBankRate({ latest: null, history: [] }), HREFS)).mpc, undefined);
  // The AI headline does not need the Bank Rate series.
  assert.ok(byId(tickerItems(withBankRate({ latest: null, history: [] }), HREFS, REPORTS)).mpc);
});

test("motion state and loop speed", () => {
  assert.equal(motionState({ reducedMotion: true, paused: false }), "static");
  assert.equal(motionState({ reducedMotion: true, paused: true }), "static");
  assert.equal(motionState({ paused: true }), "paused");
  assert.equal(motionState({}), "running");
  assert.equal(tickerDuration(2500), 50);
  assert.equal(tickerDuration(100), 20);
  assert.equal(tickerDuration(0), 90);
  assert.equal(tickerDuration(NaN), 90);
});

async function renderTicker(props, { reduced = false } = {}) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  const previous = globalThis.window;
  if (reduced) globalThis.window = { matchMedia: (query) => ({ matches: query.includes("reduce") }) };
  try {
    const { FiguresTicker } = await server.ssrLoadModule("/src/app/components/FiguresTicker.tsx");
    return renderToStaticMarkup(createElement(FiguresTicker, props));
  } finally {
    globalThis.window = previous;
    if (previous === undefined) delete globalThis.window;
    await server.close();
  }
}
const textOfMarkup = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("markup: one real list, a hidden unfocusable duplicate, a pause button", async () => {
  const html = await renderTicker({ data: withBankRate(bankRate("3.75", "4.00", 10)), loading: false, error: null, hrefs: HREFS, reports: REPORTS });
  const lists = [...html.matchAll(/<ul class="fs-ticker-list"([^>]*)>([\s\S]*?)<\/ul>/g)];
  assert.equal(lists.length, 2);
  assert.doesNotMatch(lists[0][1], /aria-hidden/);
  assert.match(lists[1][1], /aria-hidden="true"/);
  const count = (markup) => (markup.match(/<li /g) ?? []).length;
  assert.equal(count(lists[0][2]), count(lists[1][2]));
  assert.ok(!/tabindex="-1"/.test(lists[0][2]));
  const links = (lists[1][2].match(/<a /g) ?? []).length;
  assert.equal((lists[1][2].match(/tabindex="-1"/g) ?? []).length, links, "duplicate links are out of the tab order");
  assert.match(html, /<section class="fs-ticker"[^>]*aria-label="Latest figures and MPC headline"[^>]*data-motion="running"/);
  assert.match(html, /<button[^>]*aria-pressed="false"[^>]*aria-label="Pause scrolling figures"/);
  const text = textOfMarkup(lists[0][2]);
  assert.match(text, /^MPC: AI The Bank held rates and flagged slower inflation ahead\. Inflation: 3\.5% , up from 3\.1%/);
  assert.match(lists[0][2], /<span class="fs-ai-tag"[^>]*>AI<\/span>/);
  assert.match(lists[0][2], /href="\/economy#ai-summary"/);
  // Direction is carried by words as well as colour; no arrows.
  assert.match(lists[0][2], /<span class="fs-ticker-change">up from 3\.1%<\/span>/);
  assert.doesNotMatch(html, /[▲▼]/);
});

test("markup: a missing report shows the factual MPC item with no AI tag", async () => {
  const html = await renderTicker({ data: withBankRate(bankRate("3.75", "4.00", 10)), loading: false, error: null, hrefs: HREFS, reports: [] });
  assert.doesNotMatch(html, /fs-ai-tag/);
  assert.match(textOfMarkup(html), /MPC: raised Bank Rate to 4\.00% on/);
  assert.match(html, /href="\/economy#interest-rates"/);
});

test("markup: reduced motion renders one static list and no pause button", async () => {
  const html = await renderTicker({ data: fullFixture(), loading: false, error: null, hrefs: HREFS }, { reduced: true });
  assert.match(html, /data-motion="static"/);
  assert.equal((html.match(/<ul /g) ?? []).length, 1);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /aria-hidden="true"><li|<ul[^>]*aria-hidden/);
});

test("markup: loading shows a quiet placeholder; failure and gaps never invent figures", async () => {
  const loading = await renderTicker({ data: null, loading: true, error: null, hrefs: HREFS });
  assert.match(loading, /fs-ticker-quiet/);
  assert.doesNotMatch(loading, /<li|\b0%/);
  assert.equal(await renderTicker({ data: null, loading: false, error: new Error("down"), hrefs: HREFS }), "");
  assert.equal(await renderTicker({ data: { metrics: {} }, loading: false, error: null, hrefs: HREFS }), "");
});

test("the ticker is mounted once below the header on every page, outside the sticky header", () => {
  const app = readFileSync(new URL("../../src/app/App.tsx", import.meta.url), "utf8");
  assert.equal((app.match(/<FiguresTicker /g) ?? []).length, 1);
  assert.ok(app.indexOf("</header>") < app.indexOf("<FiguresTicker "));
  assert.ok(app.indexOf("<FiguresTicker ") < app.indexOf("<main "));
  const css = readFileSync(new URL("../../src/styles/ticker.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /position:\s*(sticky|fixed)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("the MPC headline report loads on every page and is passed to the crawl", () => {
  const app = readFileSync(new URL("../../src/app/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /page\.id !== "economy" && page\.id !== "overview"/);
  assert.match(app, /<FiguresTicker [^>]*reports=\{reports\}/);
});

test("the crawl shows the AI summary's first sentence whole, never cut off", () => {
  const sentence =
    "The November 2026 Monetary Policy Report highlights a decision by the Bank of England's Monetary Policy Committee to increase the Bank Rate to 4% in response to rising inflation caused by elevated global energy prices related to the ongoing Middle Eastern conflict.";
  const item = mpcAiItem([{ key: "monetary_policy_report", summary: `${sentence} The Committee noted more.` }]);
  assert.equal(item.value, sentence);
  assert.doesNotMatch(item.value, /…$/);
  const tooLong = `${"word ".repeat(80).trim()}.`;
  assert.equal(mpcAiItem([{ key: "monetary_policy_report", summary: tooLong }]), null);
});
