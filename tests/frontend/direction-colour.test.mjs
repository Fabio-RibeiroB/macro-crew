// ADR 0002: change values are coloured by direction (never good or bad), with the arrow
// and sign kept, and the colour tokens keep readable contrast in both themes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changeDirection, decimalDifference, overviewRows } from "../../src/app/data/overview.mjs";
import { fullFixture, overviewRowsOf } from "./overview-helpers.mjs";

const css = readFileSync(new URL("../../src/styles/friendly.css", import.meta.url), "utf8");

async function render(pathname, initialData) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    return renderToStaticMarkup(createElement(App, { pathname, initialData }));
  } finally { await server.close(); }
}

test("changeDirection classifies signed differences, including zero", () => {
  assert.equal(changeDirection("+0.25"), "up");
  assert.equal(changeDirection("−0.25"), "down");
  assert.equal(changeDirection("-0.25"), "down");
  assert.equal(changeDirection("+891"), "up");
  assert.equal(changeDirection("−0.71"), "down");
  assert.equal(changeDirection("0"), "flat");
  assert.equal(changeDirection(decimalDifference("1406", "1406")), "flat");
  assert.equal(changeDirection(decimalDifference("3.75", "4.00")), "down");
  assert.equal(changeDirection(decimalDifference("4.00", "3.75")), "up");
});

test("every overview change line exposes a direction as data, per unit", () => {
  const rows = Object.fromEntries(overviewRows(fullFixture()).map((row) => [row.id, row]));
  const dir = (id, i = 0) => rows[id].change[i].direction;
  assert.equal(dir("inflation"), "up", "pp, rising");
  assert.equal(dir("unemployment"), "down", "pp, falling");
  assert.equal(dir("gdp"), "down", "signed percent measured in pp");
  assert.equal(dir("house-prices"), "up", "pounds");
  assert.equal(rows["house-prices"].change[0].text, "+£891");
  assert.equal(dir("fuel", 0), "down", "pence");
  assert.equal(dir("fuel", 1), "down", "pence");
  assert.equal(rows.fuel.change[0].text, "−0.71p");
  assert.equal(dir("rent"), "flat", "no change is flat");
  assert.equal(rows.rent.change[0].text, "No change");
  assert.equal(dir("energy"), null, "not comparable has no direction");
  assert.equal(rows.energy.change[0].text, "Not comparable");
  // Secondary lines (sub text) are never directional.
  for (const row of Object.values(rows))
    for (const line of row.change.filter((l) => l.sub)) assert.equal(line.direction ?? null, null, line.text);
});

test("missing values have a null direction and are not coloured", async () => {
  const data = fullFixture();
  data.metrics.gdp = null;
  const rows = Object.fromEntries(overviewRows(data).map((row) => [row.id, row]));
  assert.equal(rows.gdp.change[0].missing, true);
  assert.equal(rows.gdp.change[0].direction, null);
  const html = await render("/", data);
  assert.doesNotMatch(overviewRowsOf(html).gdp, /fs-delta|fs-dir-/);
});

test("the table colours up and down changes, keeps arrow and sign, and leaves the rest neutral", async () => {
  const rows = overviewRowsOf(await render("/", fullFixture()));
  assert.match(rows.inflation, /<span class="fs-delta fs-delta-up"><span class="fs-arrow" aria-hidden="true">↑<\/span><span class="fs-sr">Up <\/span>\+0\.4 pp<\/span>/);
  assert.match(rows.unemployment, /<span class="fs-delta fs-delta-down"><span class="fs-arrow" aria-hidden="true">↓<\/span><span class="fs-sr">Down <\/span>−0\.2 pp<\/span>/);
  assert.match(rows["house-prices"], /fs-delta-up[^>]*>.*\+£891/);
  assert.equal((rows.fuel.match(/fs-delta-down/g) ?? []).length, 2, "petrol and diesel both fell");
  for (const id of ["rent", "energy"]) assert.doesNotMatch(rows[id], /fs-delta-(up|down)/, `${id} is neutral`);
  assert.match(rows.rent, /No change/);
  assert.match(rows.energy, /Not comparable/);
});

test("overview rows look clickable: underline and chevron at rest, chevron hidden from assistive tech", async () => {
  const rows = overviewRowsOf(await render("/", fullFixture()));
  for (const markup of Object.values(rows))
    assert.match(markup, /<a class="fs-ledger-link"[^>]*>[^<]+<svg[^>]*fs-ledger-chevron[^>]*aria-hidden="true"/);
  assert.match(css, /\.fs-ledger-link\s*\{[^}]*text-decoration:\s*underline/);
  assert.match(css, /\.fs-ledger tbody tr\s*\{\s*cursor:\s*pointer/);
});

test("a subject page colours its key-figure change and the footnote says colour is direction only", async () => {
  const html = await render("/jobs-pay", fullFixture());
  assert.match(html, /fs-delta fs-delta-up/);
  assert.match(html, /fs-delta fs-delta-down/);
  assert.match(html, /Green and red show direction only, not good or bad/);
  const overview = await render("/", fullFixture());
  assert.match(overview, /Green and red show direction only, not good or bad/);
});

// WCAG relative-luminance contrast computed from the tokens in friendly.css.
const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tokens = (selector) => {
  const block = css.match(new RegExp(`(?:^|\\n)${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`))[1];
  return Object.fromEntries([...block.matchAll(/(--fs-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map(([, k, v]) => [k, v]));
};

for (const [theme, selector] of [["light", ".fs-root"], ["dark", ".dark .fs-root"]]) {
  test(`${theme} theme keeps muted text at 7:1 and direction colours at 4.5:1`, () => {
    const t = { ...tokens(".fs-root"), ...tokens(selector) };
    for (const surface of ["--fs-bg", "--fs-tint", "--fs-hover", "--fs-band"])
      assert.ok(contrast(t["--fs-muted"], t[surface]) >= 7, `muted on ${surface}`);
    for (const [fg, bg] of [["--fs-up", "--fs-up-bg"], ["--fs-down", "--fs-down-bg"], ["--fs-up", "--fs-bg"], ["--fs-down", "--fs-bg"], ["--fs-up", "--fs-hover"], ["--fs-down", "--fs-hover"]])
      assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}`);
  });
}
