// M13 slice 1 (issue #171): the update chip replaces the long status sentence on
// every figures page, the disclosure is one contained box, and chart headers are
// one title plus one subtitle.
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";
import { updatedShort } from "../../src/app/data/format.mjs";

async function withServer(run) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try { return await run({ server, createElement, renderToStaticMarkup }); } finally { await server.close(); }
}

test("updatedShort gives a compact UK-time stamp and nothing for a missing or invalid instant", () => {
  assert.equal(updatedShort("2026-11-18T17:01:00Z"), "18 Nov, 17:01");
  assert.equal(updatedShort("2026-07-01T12:00:00Z"), "1 Jul, 13:00", "summer time is UK time");
  assert.equal(updatedShort(null), null);
  assert.equal(updatedShort("not a date"), null);
});

test("UpdatedChip shows a short stamp with a hidden clock icon and a How we check link", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { UpdatedChip } = await server.ssrLoadModule("/src/app/components/UpdatedChip.tsx");
    const html = renderToStaticMarkup(createElement(UpdatedChip, { value: "2026-11-18T17:01:00Z" }));
    assert.match(html, /<p class="fs-updated">/);
    assert.match(html, /<svg[^>]*aria-hidden="true"/, "the clock icon is decorative");
    assert.match(html, /<time dateTime="2026-11-18T17:01:00Z">18 Nov, 17:01<\/time>/);
    assert.match(textOf(html), /^Last updated 18 Nov, 17:01 UK time How we check$/);
    assert.match(html, /<a class="fs-statusbar-link" href="\/sources">How we check<\/a>/);
    assert.doesNotMatch(html, /30 minutes|updates itself/, "the schedule lives on /sources");
  });
});

test("UpdatedChip without a timestamp shows no invented time but keeps the link", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { UpdatedChip } = await server.ssrLoadModule("/src/app/components/UpdatedChip.tsx");
    for (const value of [undefined, null, "soon"]) {
      const html = renderToStaticMarkup(createElement(UpdatedChip, { value }));
      assert.doesNotMatch(html, /Last updated|<time/);
      assert.match(html, /href="\/sources"/);
    }
  });
});

test("every figures page uses the chip and drops the old status sentence", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const data = fullFixture();
    for (const pathname of ["/", "/prices", "/economy", "/jobs-pay", "/housing", "/government-budget"]) {
      const html = renderToStaticMarkup(createElement(App, { pathname, initialData: data }));
      assert.match(html, /<p class="fs-updated">/, `${pathname} has the chip`);
      assert.match(textOf(html), /Last updated \d{1,2} \w{3}, \d{2}:\d{2}/, `${pathname} chip text`);
      assert.doesNotMatch(html, /Figures last updated|We check official sources every 30 minutes/, `${pathname} drops the sentence`);
    }
  });
});

test("the Sources page states the 30-minute check schedule", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const html = renderToStaticMarkup(createElement(App, { pathname: "/sources", initialData: fullFixture() }));
    assert.match(textOf(html), /We check the official sources every 30 minutes/);
  });
});

test("MoreDetail is one contained box: summary bar with glyph, label and chevron, then a padded body", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { MoreDetail } = await server.ssrLoadModule("/src/app/components/MoreDetail.tsx");
    const html = renderToStaticMarkup(createElement(MoreDetail, { label: "How it's measured" }, createElement("p", null, "Detail")));
    const match = /^<details class="fs-more"><summary>(.*?)<\/summary><div class="fs-more-body">(.*)<\/div><\/details>$/.exec(html);
    assert.ok(match, "details > summary + .fs-more-body and nothing outside the box");
    const bar = match[1];
    assert.ok(bar.indexOf("fs-more-q") < bar.indexOf("fs-more-label"), "glyph, then label");
    assert.ok(bar.indexOf("fs-more-label") < bar.indexOf("fs-more-chev"), "chevron on the right, after the label");
  });
});

test("the box styles give a bordered 44px bar, a tinted open panel with a header rule, and print behaviour", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../../src/styles/more-detail.css", import.meta.url), "utf8");
  const rule = (selector) => new RegExp(`${selector.replace(/[.[\]>()]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  assert.match(rule(".fs-more"), /border:\s*1px solid/);
  assert.match(rule(".fs-more"), /border-radius/);
  assert.match(rule(".fs-more > summary"), /min-height:\s*44px/);
  assert.match(rule(".fs-more[open]"), /background:\s*var\(--fs-soft\)/);
  assert.match(rule(".fs-more[open] > summary"), /border-bottom:\s*1px solid/);
  assert.match(rule(".fs-more-body"), /padding:/);
  assert.match(css, /@media print[\s\S]*\.fs-more-chev\s*\{\s*display:\s*none/);
});

test("a chart header is one title and one muted subtitle that merges the latest reading and update date", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const data = [{ date: "2026-09", period: "2026-09", value: 3.4 }, { date: "2026-10", period: "2026-10", value: 3.6 }];
    const html = renderToStaticMarkup(createElement(HistoricalTrendCard, {
      title: "CPI inflation, 12-month change",
      label: "CPI inflation",
      data,
      updated: { kind: "published", date: "2026-11-14", label: "Updated 14 Nov 2026" },
    }));
    assert.equal((html.match(/class="fs-chart-title"/g) ?? []).length, 1);
    assert.equal((html.match(/class="fs-chart-sub"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /fs-chart-readout|fs-chart-updated/);
    const sub = textOf(/<p class="fs-chart-sub">([\s\S]*?)<\/p>/.exec(html)[1]);
    assert.equal(sub, "Latest: 3.6%, October 2026 · Updated 14 Nov 2026");
    // Accessible names and the exact-values table survive the new header.
    assert.match(html, /aria-label="Historical range for CPI inflation"/);
    assert.match(html, /aria-label="1Y, 1 year"|aria-label="1Y,/);
    assert.match(html, /Exact values \(2\)/);
  });
});
