// ADR 0003 news-style crawl, narrowed by ADR 0005: official figures only (no MPC or AI
// item), a collapsible strip with a speed setting, and settings remembered per device.
// ADR 0005's amendment: every item names its comparison basis and reference period.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewRows } from "../../src/app/data/overview.mjs";
import {
  CRAWL_STORAGE_KEY,
  CRAWL_CONTEXT,
  DEFAULT_CRAWL_SETTINGS,
  changeOf,
  itemText,
  motionState,
  nextSpeed,
  parseCrawlSettings,
  serializeCrawlSettings,
  spokenText,
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

test("figure items name their basis, period and earlier value", () => {
  const data = fullFixture();
  const rows = Object.fromEntries(overviewRows(data).map((row) => [row.id, row]));
  const items = byId(tickerItems(data, HREFS));
  assert.equal(itemText(items.inflation), "Inflation (yearly, Sep): 3.5% ↑ (prev. 3.1%)");
  assert.equal(itemText(items.wages), "Pay growth (yearly, Jun–Aug): 3.7% ↑ (prev. 3.6%)");
  assert.equal(itemText(items.unemployment), "Unemployment (Jun–Aug): 4.7% ↓ (prev. 4.9%)");
  assert.equal(itemText(items.rent), "Rent growth (yearly, Sep): 3.8% → (prev. 3.8%)");
  assert.equal(itemText(items["house-prices"]), "House prices (Aug): £273,037 ↑ (prev. £272,146)");
  assert.equal(itemText(items.energy), "Energy price cap (Oct–Dec): £1,723 a year");
  assert.equal(itemText(items["fuel-petrol"]), "Petrol (week of 19 Oct): 174.57p a litre ↓ (prev. 175.28p)");
  assert.equal(itemText(items["fuel-diesel"]), "Diesel (week of 19 Oct): 199.33p a litre ↓ (prev. 200.04p)");
  assert.equal(itemText(items.gdp), "GDP growth (monthly, Aug): +0.1% ↓ (prev. +0.4%)");
  assert.equal(itemText(items["bank-rate"]), "Bank Rate: 3.75%", "current rate: no period, no basis");
  assert.equal(items.energy.label, "Energy price cap");
  assert.equal(items.energy.value, "£1,723 a year");
  assert.equal(items.energy.change, null, "not comparable: just the figure");
  assert.equal(items.inflation.change.dir, "up");
  assert.equal(items.inflation.change.arrow, "↑");
  assert.equal(items.unemployment.change.dir, "down");
  assert.equal(items.unemployment.change.arrow, "↓");
  assert.equal(items.rent.change.dir, "flat");
  assert.equal(items.rent.change.arrow, "→");
  // Same numbers as the table, never recomputed; no codes or pp in the wording.
  assert.equal(items.wages.value, rows.wages.latest[0].text);
  assert.equal(items.wages.change.detail, `(prev. ${rows.wages.previous[0].text})`);
  for (const item of Object.values(items)) assert.doesNotMatch(itemText(item), /[▲▼]|\bCPI\b| pp\b|up from|down from/, item.id);
});

test("every item says when it is from; rates of change also say what they compare", () => {
  const items = byId(tickerItems(fullFixture(), HREFS));
  const basis = Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.basis]));
  assert.deepEqual(basis, {
    inflation: "yearly",
    "bank-rate": null,
    wages: "yearly",
    unemployment: null,
    rent: "yearly",
    "house-prices": null,
    energy: null,
    "fuel-petrol": null,
    "fuel-diesel": null,
    gdp: "monthly",
  });
  assert.equal(items.inflation.period, "Sep");
  assert.equal(items.wages.period, "Jun–Aug", "the full three-month window, with an en dash");
  assert.equal(items.energy.period, "Oct–Dec");
  assert.equal(items["fuel-petrol"].period, "week of 19 Oct");
  assert.equal(items["bank-rate"].period, null);
  for (const item of Object.values(items)) {
    if (item.id !== "bank-rate") assert.ok(item.period, `${item.id} has a period`);
    // A level has no basis word; a rate of change has exactly one.
    if (item.basis === null) assert.doesNotMatch(itemText(item), /yearly|monthly/, item.id);
    else assert.equal(itemText(item).match(/yearly|monthly/g).length, 1, item.id);
  }
});

test("the basis table agrees with each metric's registered comparison", () => {
  const data = fullFixture();
  const basisOf = { year_on_year: "yearly", month_on_month: "monthly" };
  for (const row of overviewRows(data)) {
    const metric = data.metrics[row.kind];
    assert.ok(metric?.definition, row.id);
    assert.equal(CRAWL_CONTEXT[row.id].basis, basisOf[metric.definition.comparison] ?? null, row.id);
  }
  assert.deepEqual(Object.keys(CRAWL_CONTEXT).sort(), overviewRows(data).map((row) => row.id).sort());
});

test("a period the data does not provide is left out, never guessed", () => {
  const data = fullFixture();
  data.metrics.unemployment = { ...data.metrics.unemployment, latest: { ...data.metrics.unemployment.latest, reference: undefined } };
  data.metrics.gdp = { ...data.metrics.gdp, latest: { ...data.metrics.gdp.latest, period: "soon" } };
  data.metrics.petrol_price = { ...data.metrics.petrol_price, latest: { ...data.metrics.petrol_price.latest, period: "2026-13-40" } };
  const items = byId(tickerItems(data, HREFS));
  assert.equal(items.unemployment.period, null, "no window: no single-month guess");
  assert.equal(itemText(items.unemployment).split(":")[0], "Unemployment");
  assert.equal(items.gdp.period, null);
  assert.equal(itemText(items.gdp), "GDP growth (monthly): +0.1%", "basis stays, period omitted (an unreadable period also drops the comparison)");
  assert.equal(spokenText(items.gdp), "GDP growth, monthly: +0.1%");
  assert.equal(items["fuel-petrol"].period, null);
  assert.equal(itemText(items["fuel-petrol"]).split(":")[0], "Petrol");
  assert.equal(items["fuel-diesel"].period, "week of 19 Oct", "the sibling keeps its own period");
});

test("direction is an arrow and a spoken word; the earlier value is named, or only the size", () => {
  const up = { text: "+0.4 pp", direction: "up" };
  const down = { text: "−£891", direction: "down" };
  const flat = { text: "No change", direction: "flat" };
  const earlier = { text: "3.1%" };
  assert.deepEqual(changeOf(up, earlier), { dir: "up", arrow: "↑", detail: "(prev. 3.1%)", spoken: "up from 3.1%" });
  assert.deepEqual(changeOf(flat, earlier), { dir: "flat", arrow: "→", detail: "(prev. 3.1%)", spoken: "unchanged" });
  assert.deepEqual(changeOf(flat, undefined), { dir: "flat", arrow: "→", detail: null, spoken: "unchanged" });
  // No earlier value in the data: only the size of the move, nothing invented.
  assert.deepEqual(changeOf(up, undefined), { dir: "up", arrow: "↑", detail: "0.4 points", spoken: "up 0.4 points" });
  assert.deepEqual(changeOf(down, { text: "x", missing: true }), { dir: "down", arrow: "↓", detail: "£891", spoken: "down £891" });
  assert.equal(changeOf({ text: "Not comparable", direction: null }, earlier), null);
  assert.equal(changeOf({ text: "Not available", missing: true, direction: null }, earlier), null);
  assert.equal(changeOf(undefined, earlier), null);
});

test("spoken text reads naturally: no arrows, brackets, abbreviations or dashes", () => {
  const items = byId(tickerItems(fullFixture(), HREFS));
  assert.equal(spokenText(items.inflation), "Inflation, yearly, September: 3.5%, up from 3.1%");
  assert.equal(spokenText(items.wages), "Pay growth, yearly, June to August: 3.7%, up from 3.6%");
  assert.equal(spokenText(items.unemployment), "Unemployment, June to August: 4.7%, down from 4.9%");
  assert.equal(spokenText(items.rent), "Rent growth, yearly, September: 3.8%, unchanged");
  assert.equal(spokenText(items.energy), "Energy price cap, October to December: £1,723 a year");
  assert.equal(spokenText(items["fuel-petrol"]), "Petrol, week of 19 October: 174.57p a litre, down from 175.28p");
  assert.equal(spokenText(items["bank-rate"]), "Bank Rate: 3.75%");
  for (const item of Object.values(items)) assert.doesNotMatch(spokenText(item), /[↑↓→–()]|prev\.|\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/, item.id);
});

test("a figure with no comparable earlier reading shows just the figure", () => {
  const data = fullFixture();
  data.metrics.cpi = { ...data.metrics.cpi, history: [data.metrics.cpi.history.at(-1)] };
  const inflation = byId(tickerItems(data, HREFS)).inflation;
  assert.equal(itemText(inflation), "Inflation (yearly, Sep): 3.5%", "basis and period stay without a comparison");
  assert.equal(inflation.change, null);
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
  assert.deepEqual(tickerItems({ metrics: {} }, HREFS), []);
});

test("numbers first: no MPC or AI item, Bank Rate is an ordinary figure", () => {
  const items = tickerItems(fullFixture(), HREFS);
  assert.equal(items[0].id, "inflation");
  assert.equal(items.some((item) => item.id === "mpc" || item.kind === "mpc" || item.ai), false);
  for (const item of items) assert.doesNotMatch(itemText(item), /MPC|\bAI\b/, item.id);
  const rate = byId(items)["bank-rate"];
  assert.equal(rate.label, "Bank Rate");
  assert.equal(rate.href, HREFS.bank_rate);
  assert.match(itemText(rate), /^Bank Rate: \d+\.\d+%/);
  // Reports are no longer an input; a third argument changes nothing.
  assert.deepEqual(tickerItems(fullFixture(), HREFS, [{ key: "monetary_policy_report", headline: "x." }]), items);
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

test("the speed button cycles Slow, Normal, Fast, then Slow again", () => {
  assert.equal(nextSpeed("slow"), "normal");
  assert.equal(nextSpeed("normal"), "fast");
  assert.equal(nextSpeed("fast"), "slow");
  assert.equal(nextSpeed("bogus"), "fast", "unknown counts as Normal");
  assert.equal(nextSpeed(undefined), "fast");
});

test("speed scales the loop duration around the Normal reading speed", () => {
  assert.equal(tickerDuration(2500, "normal"), 50);
  assert.equal(tickerDuration(2500, "slow"), 100);
  assert.equal(tickerDuration(2500, "fast"), 25);
  assert.equal(tickerDuration(2500, "bogus"), 50);
  assert.equal(tickerDuration(100, "slow"), 40, "the 20 s floor is a Normal floor");
  assert.equal(tickerDuration(0, "fast"), 45);
  assert.equal(tickerDuration(2500, "normal", 100), 25, "a custom reading speed still applies");
});

test("remembered settings parse from bad or missing storage into defaults", () => {
  const defaults = { collapsed: false, paused: false, speed: "normal" };
  for (const raw of [null, undefined, "", "not json", "{", "[]", "null", "7", '"x"', {}, 42]) {
    assert.deepEqual(parseCrawlSettings(raw), defaults, String(raw));
  }
  assert.deepEqual(parseCrawlSettings('{"collapsed":true,"paused":true,"speed":"fast"}'), { collapsed: true, paused: true, speed: "fast" });
  // Each field is validated on its own.
  assert.deepEqual(parseCrawlSettings('{"collapsed":"yes","paused":true,"speed":"warp"}'), { collapsed: false, paused: true, speed: "normal" });
  assert.deepEqual(parseCrawlSettings('{"collapsed":true,"extra":1}'), { collapsed: true, paused: false, speed: "normal" });
  // Defaults are never shared or mutated.
  parseCrawlSettings('{"collapsed":true}').collapsed = false;
  assert.deepEqual(DEFAULT_CRAWL_SETTINGS, defaults);
  assert.equal(CRAWL_STORAGE_KEY, "finstats.crawl");
});

test("settings round-trip through storage text and drop unknown fields", () => {
  const settings = { collapsed: true, paused: false, speed: "slow" };
  assert.deepEqual(parseCrawlSettings(serializeCrawlSettings(settings)), settings);
  assert.deepEqual(JSON.parse(serializeCrawlSettings({ ...settings, secret: "x", speed: "warp" })), { collapsed: true, paused: false, speed: "normal" });
});

async function renderTicker(props, { reduced = false, storage } = {}) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  const previous = globalThis.window;
  if (reduced || storage) {
    globalThis.window = {
      matchMedia: (query) => ({ matches: reduced && query.includes("reduce") }),
      get localStorage() {
        return storage();
      },
    };
  }
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
const base = { data: fullFixture(), loading: false, error: null, hrefs: HREFS };
const savedSettings = (value) => () => ({ getItem: (key) => (key === "finstats.crawl" ? value : null) });

test("markup: one real list, a hidden unfocusable duplicate, figures only", async () => {
  const html = await renderTicker({ ...base, reports: [{ key: "monetary_policy_report", headline: "Ignored." }] });
  const lists = [...html.matchAll(/<ul class="fs-ticker-list"([^>]*)>([\s\S]*?)<\/ul>/g)];
  assert.equal(lists.length, 2);
  assert.doesNotMatch(lists[0][1], /aria-hidden/);
  assert.match(lists[1][1], /aria-hidden="true"/);
  const count = (markup) => (markup.match(/<li /g) ?? []).length;
  assert.equal(count(lists[0][2]), count(lists[1][2]));
  assert.ok(!/tabindex="-1"/.test(lists[0][2]));
  const links = (lists[1][2].match(/<a /g) ?? []).length;
  assert.equal((lists[1][2].match(/tabindex="-1"/g) ?? []).length, links, "duplicate links are out of the tab order");
  assert.match(html, /<section class="fs-ticker"[^>]*aria-label="Latest figures"[^>]*data-motion="running"/);
  const text = textOfMarkup(lists[0][2]);
  assert.match(text, /^Inflation \(yearly, Sep\) : 3\.5% ↑ \(prev\. 3\.1%\)/, "numbers first, with basis and period");
  assert.doesNotMatch(html, /MPC|fs-ai-tag|Ignored/);
  assert.doesNotMatch(html, /[▲▼]/);
});

test("markup: the arrow is hidden decoration, a spoken phrase carries the direction", async () => {
  const html = await renderTicker(base);
  const first = html.match(/<li class="fs-ticker-item" data-dir="up"><a href="\/prices#figures">([\s\S]*?)<\/a><\/li>/)[1];
  // Everything visible is aria-hidden, so the arrow, brackets and "prev." are never read out.
  assert.match(first, /^<span aria-hidden="true"><span class="fs-ticker-label">Inflation <span class="fs-ticker-context">\(yearly, Sep\)<\/span>:<\/span> <span class="fs-ticker-value">3\.5%<\/span> <span class="fs-ticker-change">↑<\/span> <span class="fs-ticker-prev">\(prev\. 3\.1%\)<\/span><\/span>/);
  assert.match(first, /<span class="fs-sr">Inflation, yearly, September: 3\.5%, up from 3\.1%<\/span>$/);
  // A level with no comparison has no arrow and no basis word.
  const energy = html.match(/<li class="fs-ticker-item" data-dir="flat"><a href="\/prices#household-energy">([\s\S]*?)<\/a>/)[1];
  assert.doesNotMatch(energy, /fs-ticker-change|yearly|monthly/);
  assert.match(energy, /Energy price cap <span class="fs-ticker-context">\(Oct–Dec\)<\/span>/);
});

test("the crawl strip layout is unchanged: items stay one nowrap line in the 44px strip", () => {
  const css = readFileSync(new URL("../../src/styles/ticker.css", import.meta.url), "utf8");
  assert.match(css, /\.fs-ticker-item \{[^}]*white-space: nowrap/);
  assert.match(css, /--fs-ticker-height: 44px/);
  assert.match(css, /\.fs-ticker-context \{\s*font-weight: 500;\s*\}/);
  assert.match(css, /\.fs-ticker-prev \{\s*font-weight: 500;\s*color: var\(--fs-muted\);\s*\}/);
});

test("markup: the Figures button, pause and speed controls are labelled and 44px-targeted", async () => {
  const html = await renderTicker(base);
  assert.match(html, /<button[^>]*class="fs-ticker-fold"[^>]*aria-expanded="true"[^>]*aria-controls="fs-ticker-body"[^>]*><span class="fs-ticker-fold-text">Figures<\/span><svg/);
  assert.match(html, /id="fs-ticker-body"/, "the controlled element exists");
  assert.match(html, /<button[^>]*aria-label="Scrolling speed: normal \(1×\)\. Change speed"[^>]*>1×<\/button>/);
  assert.match(html, /<button[^>]*aria-pressed="false"[^>]*aria-label="Pause scrolling figures"/);
  assert.doesNotMatch(html, /close|dismiss/i, "no close button");
  const css = readFileSync(new URL("../../src/styles/ticker.css", import.meta.url), "utf8");
  assert.match(css, /--fs-ticker-height: 44px/);
  assert.match(css, /min-width: 44px/);
});

test("markup: remembered settings restore collapsed, paused and speed", async () => {
  const collapsed = await renderTicker(base, { storage: savedSettings('{"collapsed":true,"paused":false,"speed":"fast"}') });
  assert.match(collapsed, /data-collapsed="true"/);
  assert.match(collapsed, /aria-expanded="false"/);
  // Folded means gone: no figures at all, just the bar that brings them back.
  assert.match(collapsed, /<button[^>]*class="fs-ticker-fold"[^>]*><span class="fs-ticker-fold-text">Show latest figures<\/span><svg/);
  assert.doesNotMatch(collapsed, /fs-ticker-body|aria-controls/, "nothing to control while folded");
  assert.doesNotMatch(collapsed, /Inflation|Bank Rate|%/, "no figures while folded");
  assert.doesNotMatch(collapsed, /<ul|<li|fs-ticker-controls|Scrolling speed|Pause scrolling/, "folded: static, no crawl, no motion controls");
  assert.match(collapsed, /data-motion="static"/);
  const paused = await renderTicker(base, { storage: savedSettings('{"paused":true,"speed":"slow"}') });
  assert.match(paused, /data-motion="paused"/);
  assert.match(paused, /aria-pressed="true"/);
  assert.match(paused, /Scrolling speed: slow \(0\.5×\)[^>]*>0\.5×</);
});

test("markup: a throwing, missing or corrupt store still renders the open default", async () => {
  const stores = {
    throwing: () => {
      throw new Error("blocked");
    },
    "throwing getItem": () => ({
      getItem: () => {
        throw new Error("denied");
      },
    }),
    empty: savedSettings(null),
    corrupt: savedSettings("{nope"),
    wrongTypes: savedSettings('{"collapsed":"true","speed":9}'),
  };
  for (const [name, storage] of Object.entries(stores)) {
    const html = await renderTicker(base, { storage });
    assert.match(html, /data-motion="running"/, name);
    assert.match(html, /aria-expanded="true"/, name);
    assert.doesNotMatch(html, /data-collapsed/, name);
    assert.match(html, /Scrolling speed: normal/, name);
  }
});

test("markup: reduced motion renders one static list, the fold button and no pause or speed", async () => {
  const html = await renderTicker(base, { reduced: true });
  assert.match(html, /data-motion="static"/);
  assert.equal((html.match(/<ul /g) ?? []).length, 1);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /class="fs-ticker-fold"/);
  assert.doesNotMatch(html, /Pause scrolling|Scrolling speed|fs-ticker-controls/);
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

test("the crawl takes no AI reports: the home page's MPC line is the only MPC text", () => {
  const app = readFileSync(new URL("../../src/app/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /<FiguresTicker [^>]*reports=/);
  assert.match(app, /<MpcLine reports=/);
  const component = readFileSync(new URL("../../src/app/components/FiguresTicker.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /reports|mpc|fs-ai-tag/i);
});

test("tapping pause or speed never freezes the crawl: only the figures hold it still", () => {
  const css = readFileSync(new URL("../../src/styles/ticker.css", import.meta.url), "utf8");
  // The whole strip (controls included) must not pause on hover or focus.
  assert.doesNotMatch(css, /\.fs-ticker:hover\s+\.fs-ticker-track/);
  assert.doesNotMatch(css, /\.fs-ticker:focus-within\s+\.fs-ticker-track/);
  assert.match(css, /@media \(hover: hover\)\s*\{\s*\.fs-ticker-viewport:hover \.fs-ticker-track/);
  assert.match(css, /\.fs-ticker-viewport:focus-within \.fs-ticker-track/);
});
