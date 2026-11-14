import test from "node:test";
import assert from "node:assert/strict";

test("AI summary is visible on Economy, linked from the overview, and the unpublished explanation feed shows no false error", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const render = (pathname) => renderToStaticMarkup(createElement(App, { pathname }));
    const economy = render("/economy");
    assert.match(economy, /id="ai-summary"/);
    assert.match(economy, /<h2 id="ai-summary-heading">AI summary<\/h2>/);
    assert.doesNotMatch(economy, /Earlier AI report summaries|<details class="fs-archive"/);
    assert.ok(economy.indexOf('id="ai-summary"') < economy.indexOf("The Bank’s outlook"));
    assert.match(render("/"), /href="\/economy#ai-summary"/);
    assert.match(render("/about"), /href="\/economy#ai-summary"/);
    for (const path of ["/prices", "/economy", "/jobs-pay", "/housing", "/government-budget"]) {
      const html = render(path);
      assert.doesNotMatch(html, /AI explanations of official data|could not be refreshed/, path);
    }
  } finally { await server.close(); }
});
