// ADR 0002 figures ticker: items come from the overview rows of the same verified
// snapshot; the MPC item comes only from official Bank Rate observations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewRows } from "../../src/app/data/overview.mjs";
import {
  MPC_DECISION_WINDOW_DAYS,
  itemText,
  motionState,
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

test("items are built from the overview rows with units, signs and directions", () => {
  const data = fullFixture();
  const rows = Object.fromEntries(overviewRows(data).map((row) => [row.id, row]));
  const items = byId(tickerItems(data, HREFS));
  assert.equal(items.inflation.label, "CPI");
  assert.equal(items.inflation.value, rows.inflation.latest[0].text);
  assert.deepEqual(
    { dir: items.inflation.change.dir, arrow: items.inflation.change.arrow, text: items.inflation.change.text },
    { dir: "up", arrow: "▲", text: "0.4 pp" },
  );
  assert.equal(itemText(items.inflation), "CPI 3.5% up 0.4 pp");
  assert.equal(itemText(items.unemployment), "Unemployment 4.7% down 0.2 pp");
  assert.equal(items.unemployment.change.arrow, "▼");
  assert.equal(itemText(items["house-prices"]), "House prices £273,037 up £891");
  assert.equal(items.energy.value, "£1,723/year");
  assert.equal(itemText(items["fuel-petrol"]), "Petrol 174.57p down 0.71p");
  assert.equal(itemText(items["fuel-diesel"]), "Diesel 199.33p down 0.71p");
  assert.equal(itemText(items.gdp), "GDP +0.1% down 0.3 pp");
  // Same numbers as the table, never recomputed.
  assert.equal(items.wages.value, rows.wages.latest[0].text);
  assert.equal(items.wages.change.text, rows.wages.change[0].text.replace(/^[+−]/, ""));
});

test("no change and not comparable are neutral and carry no arrow", () => {
  const items = byId(tickerItems(fullFixture(), HREFS));
  assert.deepEqual(
    { dir: items.rent.change.dir, arrow: items.rent.change.arrow, text: items.rent.change.text },
    { dir: "flat", arrow: "", text: "no change" },
  );
  assert.equal(items.energy.change.dir, "flat");
  assert.equal(items.energy.change.text, "not comparable");
});

test("every item links to its subject page and the strip never shows zero for a gap", () => {
  const items = tickerItems(fullFixture(), HREFS);
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
  assert.deepEqual(tickerItems(null, HREFS), []);
  assert.deepEqual(tickerItems({ metrics: {} }, HREFS).filter((item) => item.id !== "mpc"), []);
});

test("MPC item: raised, cut and held wording from official Bank Rate only", () => {
  const raised = tickerItems(withBankRate(bankRate("3.75", "4.00", 10)), HREFS);
  const up = byId(raised).mpc;
  assert.equal(`${up.label}: ${up.value}`, "MPC: raised to 4.00% (tightening)");
  assert.equal(up.change.dir, "up");
  assert.match(up.meta, /^\d{1,2} \w{3} 2026$/, "decision date included");
  assert.equal(up.href, HREFS.bank_rate);
  assert.equal(raised.findIndex((item) => item.id === "mpc"), raised.findIndex((item) => item.id === "bank-rate") + 1);

  const cut = byId(tickerItems(withBankRate(bankRate("4.00", "3.75", 10)), HREFS)).mpc;
  assert.equal(`${cut.label}: ${cut.value}`, "MPC: cut to 3.75% (loosening)");
  assert.equal(cut.change.dir, "down");

  const held = byId(tickerItems(withBankRate(bankRate("4.00", "3.75", MPC_DECISION_WINDOW_DAYS + 20)), HREFS)).mpc;
  assert.equal(`${held.label}: ${held.value}`, "MPC: held at 3.75% (on hold)");
  assert.equal(held.change.dir, "flat");
  assert.match(held.meta, /^last change \d{1,2} \w{3} 2026$/);
});

test("MPC item is omitted when Bank Rate cannot evidence a decision", () => {
  const flat = dailySeries("2026-01-05", Array(40).fill("3.75"));
  assert.equal(mpcItem({ latest: flat.at(-1), history: flat }, "3.75%"), null);
  assert.equal(mpcItem({ latest: null, history: [] }, "3.75%"), null);
  assert.equal(mpcItem(null, "3.75%"), null);
  assert.equal(byId(tickerItems(withBankRate({ latest: null, history: [] }), HREFS)).mpc, undefined);
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
  const html = await renderTicker({ data: withBankRate(bankRate("3.75", "4.00", 10)), loading: false, error: null, hrefs: HREFS });
  const lists = [...html.matchAll(/<ul class="fs-ticker-list"([^>]*)>([\s\S]*?)<\/ul>/g)];
  assert.equal(lists.length, 2);
  assert.doesNotMatch(lists[0][1], /aria-hidden/);
  assert.match(lists[1][1], /aria-hidden="true"/);
  const count = (markup) => (markup.match(/<li /g) ?? []).length;
  assert.equal(count(lists[0][2]), count(lists[1][2]));
  assert.ok(!/tabindex="-1"/.test(lists[0][2]));
  const links = (lists[1][2].match(/<a /g) ?? []).length;
  assert.equal((lists[1][2].match(/tabindex="-1"/g) ?? []).length, links, "duplicate links are out of the tab order");
  assert.match(html, /<section class="fs-ticker"[^>]*aria-label="Latest official figures"[^>]*data-motion="running"/);
  assert.match(html, /<button[^>]*aria-pressed="false"[^>]*aria-label="Pause scrolling figures"/);
  assert.match(textOfMarkup(lists[0][2]), /MPC raised to 4\.00% \(tightening\)/);
  assert.match(lists[0][2], /href="\/economy#interest-rates"/);
  // Direction is carried by arrow and words as well as colour.
  assert.match(lists[0][2], /<span aria-hidden="true">▲<\/span>/);
  assert.match(lists[0][2], /class="fs-sr"> up </);
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
