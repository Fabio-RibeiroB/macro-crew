// ADR 0003 news-style crawl, narrowed by ADR 0005: official figures only (no MPC or AI
// item), a collapsible strip with a speed setting, and settings remembered per device.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewRows } from "../../src/app/data/overview.mjs";
import {
  CRAWL_STORAGE_KEY,
  DEFAULT_CRAWL_SETTINGS,
  collapsedFigures,
  collapsedSummary,
  itemText,
  motionState,
  nextSpeed,
  parseCrawlSettings,
  serializeCrawlSettings,
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

test("collapsed summary is Inflation then Bank Rate from the crawl's own items", () => {
  const items = tickerItems(fullFixture(), HREFS);
  const byKey = byId(items);
  assert.equal(collapsedSummary(items), `Inflation ${byKey.inflation.value} · Bank Rate ${byKey["bank-rate"].value}`);
  assert.deepEqual(collapsedFigures(items).map((figure) => figure.id), ["inflation", "bank-rate"]);
  // A missing figure is left out, never invented.
  const noRate = items.filter((item) => item.id !== "bank-rate");
  assert.equal(collapsedSummary(noRate), `Inflation ${byKey.inflation.value}`);
  const noInflation = items.filter((item) => item.id !== "inflation");
  assert.equal(collapsedSummary(noInflation), `Bank Rate ${byKey["bank-rate"].value}`);
  assert.equal(collapsedSummary([]), "");
  assert.equal(collapsedSummary(null), "");
  assert.equal(collapsedSummary(items.filter((item) => item.id !== "inflation" && item.id !== "bank-rate")), "");
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
  assert.match(text, /^Inflation: 3\.5% , up from 3\.1%/, "numbers first");
  assert.doesNotMatch(html, /MPC|fs-ai-tag|Ignored/);
  assert.match(lists[0][2], /<span class="fs-ticker-change">up from 3\.1%<\/span>/);
  assert.doesNotMatch(html, /[▲▼]/);
});

test("markup: the Figures button, pause and speed controls are labelled and 44px-targeted", async () => {
  const html = await renderTicker(base);
  assert.match(html, /<button[^>]*class="fs-ticker-fold"[^>]*aria-expanded="true"[^>]*aria-controls="fs-ticker-body"[^>]*>Figures<svg/);
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
  const summary = collapsed.match(/<p class="fs-ticker-summary" id="fs-ticker-body">([\s\S]*?)<\/p>/);
  assert.ok(summary, "the folded bar is the controlled element");
  assert.equal(textOfMarkup(summary[1]), collapsedSummary(tickerItems(base.data, HREFS)).replace(" · ", " "));
  assert.match(textOfMarkup(summary[1]), /^Inflation 3\.5% Bank Rate \S+%$/);
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

test("markup: folded bar leaves out a missing headline figure and invents nothing", async () => {
  const data = fullFixture();
  delete data.metrics.bank_rate;
  const html = await renderTicker({ ...base, data }, { storage: savedSettings('{"collapsed":true}') });
  const text = textOfMarkup(html.match(/<p class="fs-ticker-summary"[^>]*>([\s\S]*?)<\/p>/)[1]);
  assert.match(text, /^Inflation 3\.5%$/);
  assert.doesNotMatch(text, /Bank Rate|0\.00|0%/);
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
