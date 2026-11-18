// MoreDetail disclosure and one-line Sources (ADR 0004, issue #153).
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture, textOf } from "./overview-helpers.mjs";
import { checkedBrief } from "../../src/app/data/format.mjs";

async function withServer(run) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try { return await run({ server, createElement, renderToStaticMarkup }); } finally { await server.close(); }
}

test("Sources renders a collapsed details with a one-line publisher and check summary", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const data = fullFixture();
    const html = renderToStaticMarkup(createElement(App, { pathname: "/economy", initialData: data }));
    const start = html.indexOf('id="bank-sources-label"');
    assert.ok(start >= 0, "Sources row exists");
    const row = html.slice(start, html.indexOf("</section>", start));
    assert.match(row, /<details class="fs-more">/);
    assert.doesNotMatch(row, /<details[^>]* open/, "collapsed by default");
    const summary = textOf(/<summary>([\s\S]*?)<\/summary>/.exec(row)[1]);
    const expected = checkedBrief(data.metrics.bank_rate.last_successful_check_at);
    assert.equal(summary, `Source: Bank of England · ${expected}`);
    assert.match(summary, /^Source: Bank of England · checked \d{1,2} \w{3}, \d{2}:\d{2}$/);
    // The full list stays in the markup inside the disclosure body.
    const body = textOf(/<div class="fs-more-body">([\s\S]*)<\/details>/.exec(row)[1]);
    assert.match(body, /Last successful check/);
    assert.match(body, /View the official series/);
  });
});

test("MoreDetail is a native disclosure with decorative glyphs hidden from assistive technology", async () => {
  await withServer(async ({ server, createElement, renderToStaticMarkup }) => {
    const { MoreDetail } = await server.ssrLoadModule("/src/app/components/MoreDetail.tsx");
    const html = renderToStaticMarkup(createElement(MoreDetail, { label: "How it is measured" }, createElement("p", null, "Detail text")));
    assert.match(html, /^<details class="fs-more"><summary>/);
    assert.equal((html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length, 2);
    assert.match(textOf(html), /^How it is measured Detail text$/);
  });
});

test("checkedBrief shows a short UK-time check and an honest unchecked state", () => {
  assert.equal(checkedBrief("2026-11-18T15:30:00Z"), "checked 18 Nov, 15:30");
  assert.equal(checkedBrief("2026-07-01T12:00:00Z"), "checked 1 Jul, 13:00");
  assert.equal(checkedBrief(null), "not yet checked");
});
