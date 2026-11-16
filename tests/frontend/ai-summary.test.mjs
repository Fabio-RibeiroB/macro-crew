import test from "node:test";
import assert from "node:assert/strict";

test("AI summary is visible on Economy, linked from the overview, and the unpublished explanation feed shows no false error", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const render = (pathname) => renderToStaticMarkup(createElement(App, { pathname }));
    const economy = render("/economy");
    assert.match(economy, /id="ai-summary"/);
    assert.match(economy, /<h3 class="fs-row-label" id="ai-summary-heading">AI summary<\/h3>/);
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

test("AI summary section is labelled, dated, linked and attributes its figures to the Bank report", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { legacyReports } = await server.ssrLoadModule("/src/app/data/verified.mjs");
    const { AiCommentary } = await server.ssrLoadModule("/src/app/components/SubjectBlock.tsx");
    const raw = JSON.parse(await readFile(new URL("../../public/research_report.json", import.meta.url), "utf8"));
    const reports = legacyReports(raw);
    assert.equal(reports.length, 2);
    const html = renderToStaticMarkup(createElement(AiCommentary, { reports, reportTime: raw.metadata.generated_at }));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Label and attribution: the Bank's inflation measure is not presented as the site's.
    assert.match(html, /<span class="fs-ai-tag">AI commentary — not checked against the official figures<\/span>/);
    assert.match(text, /Figures and inflation measures mentioned are as cited in the Bank of England report\. They are not this site’s official figures/);
    assert.match(text, /generated 22 Mar/);

    // Each report shows its report date and a link to its source document, text unaltered.
    for (const report of reports) {
      assert.ok(html.includes(`href="${report.source}"`), report.key);
      assert.ok(text.includes(report.summary), "summary text is rendered unaltered");
    }
    assert.match(text, /Bank of England report dated 19 March 2026/);
    assert.match(text, /Bank of England report dated 15 December 2025/);
    assert.match(html, /Read the original Bank of England publication/);
    assert.doesNotMatch(text, /Official figure/);

    // An undated report is stated plainly, and an empty feed stays honest.
    assert.match(renderToStaticMarkup(createElement(AiCommentary, { reports: [{ ...reports[0], report_date: null }], reportTime: null })), /date not supplied/);
    assert.match(renderToStaticMarkup(createElement(AiCommentary, { reports: [], reportTime: null })), /The AI summary could not be loaded/);
  } finally { await server.close(); }
});
