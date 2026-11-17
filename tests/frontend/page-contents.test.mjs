// "On this page" contents on multi-section subject pages (spec M10 slice 7, issue #133).
import test from "node:test";
import assert from "node:assert/strict";
import { fullFixture } from "./overview-helpers.mjs";

const PAGES = {
  "/prices": [["inflation", "Inflation"], ["household-energy", "Household energy"], ["petrol-diesel", "Petrol and diesel"]],
  "/economy": [["interest-rates", "Bank Rate"], ["ai-summary", "AI summary"], ["gdp", "GDP"]],
  "/jobs-pay": [["wages", "Wages"], ["unemployment", "Unemployment"]],
  "/housing": [["rent", "Rent"], ["house-prices", "House prices"]],
  "/government-budget": [["public-debt", "Public debt"], ["gilt-yields", "Gilt yields"]],
};

async function withServer(run) {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try { return await run(server); } finally { await server.close(); }
}

const navOf = (html) => {
  const match = /<nav class="fs-contents" aria-label="On this page">([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(match, "contents nav is rendered");
  return match[1];
};

for (const initialData of [fullFixture(), null]) {
  test(`each subject page lists its sections in order and the links resolve (${initialData ? "with figures" : "without figures"})`, async () => {
    await withServer(async (server) => {
      const { createElement } = await import("react");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
      for (const [pathname, sections] of Object.entries(PAGES)) {
        const html = renderToStaticMarkup(createElement(App, { pathname, initialData }));
        assert.equal((html.match(/aria-label="On this page"/g) ?? []).length, 1, `${pathname} has one contents nav`);
        const links = [...navOf(html).matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map(([, id, label]) => [id, label]);
        assert.deepEqual(links, sections, pathname);
        for (const [id] of links) {
          assert.equal((html.match(new RegExp(`\\sid="${id}"`, "g")) ?? []).length, 1, `${pathname} #${id} exists exactly once`);
        }
        // The nav comes before the first section it points to.
        assert.ok(html.indexOf('aria-label="On this page"') < html.indexOf(`id="${sections[0][0]}"`), pathname);
      }
    });
  });
}

test("pages with a single section or none have no contents nav", async () => {
  await withServer(async (server) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    for (const pathname of ["/", "/sources", "/calendar"]) {
      const html = renderToStaticMarkup(createElement(App, { pathname, initialData: fullFixture() }));
      assert.doesNotMatch(html, /aria-label="On this page"/, pathname);
    }
  });
});

test("hidden sections are omitted and a lone section renders no nav", async () => {
  await withServer(async (server) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PageContents } = await server.ssrLoadModule("/src/app/components/PageContents.tsx");
    const render = (items) => renderToStaticMarkup(createElement(PageContents, { items }));
    const html = render([{ id: "a", label: "A" }, { id: "b", label: "B", show: false }, { id: "c", label: "C" }]);
    assert.deepEqual([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]), ["a", "c"]);
    assert.equal(render([{ id: "a", label: "A" }, { id: "b", label: "B", show: false }]), "");
    assert.equal(render([]), "");
  });
});
