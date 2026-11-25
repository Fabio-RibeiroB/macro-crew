// Who's who guide: route, anchored institution entries, links in and out, and the
// MPC clarity labels that point readers at it.
import test from "node:test";
import assert from "node:assert/strict";
import { PAGES, FOOTER_PAGES, MENU_ONLY_PAGES, NAV_PAGES, canonicalDestination, resolvePage } from "../../src/app/data/pages.mjs";
import { previewFile, previewTags, renderPreview } from "../../scripts/link-previews.mjs";

const IDS = ["mpc", "boe", "ons", "ofgem", "hm-treasury", "obr", "desnz", "land-registry"];

async function withServer(run) {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try { await run({ server, createElement, render: renderToStaticMarkup }); } finally { await server.close(); }
}

test("/whos-who resolves, is canonical, and sits in the footer and menu but not the desktop nav", () => {
  const page = resolvePage("/whos-who");
  assert.equal(page.id, "whos-who");
  assert.equal(resolvePage("/whos-who/").id, "whos-who");
  assert.equal(canonicalDestination("/whos-who/"), "/whos-who");
  assert.equal(canonicalDestination("/whos-who"), null);
  assert.equal(page.place, "footer");
  assert.ok(FOOTER_PAGES.includes(page));
  assert.ok(MENU_ONLY_PAGES.includes(page));
  assert.ok(!NAV_PAGES.includes(page));
  assert.equal(NAV_PAGES.length, 7);
});

test("the route gets its own link-preview file with page-specific tags", () => {
  const page = PAGES.find((p) => p.id === "whos-who");
  assert.equal(previewFile(page), "whos-who.html");
  const html = renderPreview('<html><head><title>x</title><meta name="description" content="x" /></head><body></body></html>', page);
  assert.match(html, /<link rel="canonical" href="https:\/\/finstats\.fabio\.org\.uk\/whos-who" \/>/);
  assert.match(previewTags(page), /og:title" content="Who’s who in UK economic data \| finstats UK"/);
});

test("the page renders all eight institutions with anchors, FinStats links and official links", async () => {
  await withServer(async ({ server, createElement, render }) => {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const html = render(createElement(App, { pathname: "/whos-who" }));
    const main = html.match(/<main[\s\S]*<\/main>/)[0];
    assert.equal((main.match(/<h1\b/g) || []).length, 1);
    assert.match(main, /<nav[^>]*aria-label="On this page"/);
    for (const id of IDS) {
      assert.match(main, new RegExp(`<section[^>]* id="${id}"`), id);
      assert.ok(main.includes(`href="#${id}"`), `contents link for ${id}`);
    }
    assert.match(main, /Monetary Policy Committee \(MPC\)/);
    assert.match(main, /nine-member/);
    for (const href of ["/economy#interest-rates", "/prices#figures", "/jobs-pay", "/housing#house-prices", "/prices#household-energy", "/prices#petrol-diesel", "/government-budget"])
      assert.ok(main.includes(`<a class="fs-link" href="${href}">`), href);
    const external = [...main.matchAll(/<a class="fs-link" href="(https:[^"]+)" target="_blank" rel="noopener noreferrer"/g)].map((m) => m[1]);
    assert.equal(external.length, IDS.length);
    for (const url of external) assert.equal(new URL(url).protocol, "https:");
    assert.ok(external.includes("https://obr.uk/"));
    assert.ok(external.includes("https://www.ons.gov.uk"));
  });
});

test("/about and /sources link to the guide", async () => {
  await withServer(async ({ server, createElement, render }) => {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    for (const path of ["/about", "/sources"]) {
      const main = render(createElement(App, { pathname: path })).match(/<main[\s\S]*<\/main>/)[0];
      assert.match(main, /<a class="fs-link" href="\/whos-who">Who’s who in UK economic data<\/a>/, path);
    }
  });
});

test("the overview MPC line names the Bank of England, and the AI summary links to who the MPC is", async () => {
  await withServer(async ({ server, createElement, render }) => {
    const { MpcLine } = await server.ssrLoadModule("/src/app/components/MpcLine.tsx");
    const { AiCommentary } = await server.ssrLoadModule("/src/app/components/AiSummary.tsx");
    const mpc = { key: "monetary_policy_report", summary: "Rates held. More follows.", source: "https://www.bankofengland.co.uk/x" };
    const fsr = { key: "financial_stability_report", summary: "Risks remain. More follows.", source: "https://www.bankofengland.co.uk/y" };
    assert.match(render(createElement(MpcLine, { reports: [mpc] })), /<strong>Bank of England \(MPC\):<\/strong>/);
    const html = render(createElement(AiCommentary, { reports: [mpc, fsr] }));
    assert.equal((html.match(/href="\/whos-who#mpc"/g) || []).length, 1);
    assert.match(html, /<a class="fs-link" href="\/whos-who#mpc">Who is the MPC\?<\/a>/);
    assert.match(html, /<a class="fs-link" href="\/whos-who#boe">Who is the Bank of England\?<\/a>/);
    // The link sits after the note, inside the MPC report's own card.
    const card = html.split("</article>")[0];
    assert.ok(card.indexOf("fs-aisum-note") < card.indexOf("/whos-who#mpc"));
    assert.doesNotMatch(render(createElement(AiCommentary, { reports: [fsr] })), /whos-who#mpc/);
  });
});
