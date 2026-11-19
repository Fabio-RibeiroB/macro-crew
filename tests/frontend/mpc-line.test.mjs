// Overview MPC line (M10 slice 5): the report's optional AI headline, else its first
// sentence, labelled as AI with a link to the full summary; hidden without a report.
import test from "node:test";
import assert from "node:assert/strict";
import { mpcLine, truncateCleanly } from "../../src/app/data/aiSummary.mjs";

const base = {
  key: "monetary_policy_report",
  summary: "The committee held Bank Rate at 3.5% on 19 March. Inflation is expected to stay above 2%. Rates could fall later.",
  source: "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/march-2026",
};

test("the headline is used when present and within the limit", () => {
  const headline = "The Bank held rates and expects inflation to stay high.";
  assert.deepEqual(mpcLine([{ key: "financial_stability_report", summary: "Risks remain." }, { ...base, headline }]), { text: headline, source: "headline" });
});

test("an absent, blank, over-long or non-string headline falls back to the first sentence", () => {
  for (const headline of [undefined, "", "   ", "x".repeat(161), 42]) {
    assert.deepEqual(mpcLine([{ ...base, headline }]), { text: "The committee held Bank Rate at 3.5% on 19 March.", source: "summary" });
  }
});

test("only the Monetary Policy report counts; no report or empty summary hides the line", () => {
  assert.equal(mpcLine([]), null);
  assert.equal(mpcLine(null), null);
  assert.equal(mpcLine([{ key: "financial_stability_report", summary: "Risks remain.", headline: "Risks." }]), null);
  assert.equal(mpcLine([{ ...base, summary: "  " }]), null);
});

test("a long first sentence is cut at a word boundary with an ellipsis", () => {
  const long = `${"Inflation pressure from energy prices ".repeat(8).trim()}.`;
  const cut = truncateCleanly(long);
  assert.ok(cut.length <= 160 && cut.endsWith("…") && !/\s…$/.test(cut), cut);
  assert.ok(long.startsWith(cut.slice(0, -1)));
  assert.equal(truncateCleanly("Short one."), "Short one.");
  const fallback = mpcLine([{ ...base, summary: `${long} Next sentence.` }]);
  assert.equal(fallback.source, "summary");
  assert.equal(fallback.text, cut);
});

test("MpcLine renders the AI-labelled line with a link to the AI summary, and nothing without a report", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { MpcLine } = await server.ssrLoadModule("/src/app/components/MpcLine.tsx");
    const report = { key: "monetary_policy_report", summary: "Rates held at 3.75%. More follows.", headline: "The Bank held rates for now." };
    const html = renderToStaticMarkup(createElement(MpcLine, { reports: [report] }));
    assert.match(html, /<span class="fs-ai-tag">AI summary<\/span>/);
    assert.match(html, /<strong>MPC:<\/strong> The Bank held rates for now\./);
    assert.match(html, /<a class="fs-link" href="\/economy#ai-summary">Read the AI summary<\/a>/);
    const fallback = renderToStaticMarkup(createElement(MpcLine, { reports: [{ ...report, headline: undefined }] }));
    assert.match(fallback, /MPC:<\/strong> Rates held at 3\.75%\./);
    assert.equal(renderToStaticMarkup(createElement(MpcLine, { reports: [] })), "");
    // The overview shows no MPC line before any report has loaded.
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    assert.doesNotMatch(renderToStaticMarkup(createElement(App, { pathname: "/" })), /fs-mpc-line/);
  } finally { await server.close(); }
});

test("a multi-sentence or over-20-word headline is unusable even when short enough in characters", () => {
  const first = { text: "The committee held Bank Rate at 3.5% on 19 March.", source: "summary" };
  assert.deepEqual(mpcLine([{ ...base, headline: "Rates held. Inflation stays high." }]), first);
  const twenty = Array.from({ length: 20 }, () => "a").join(" ");
  const twentyOne = `${twenty} a`;
  assert.deepEqual(mpcLine([{ ...base, headline: `${twenty}.` }]), { text: `${twenty}.`, source: "headline" });
  assert.deepEqual(mpcLine([{ ...base, headline: `${twentyOne}.` }]), first);
  // Decimals and abbreviations are not sentence breaks.
  assert.equal(mpcLine([{ ...base, headline: "Bank Rate held at 3.5% as Report No. 1 warns." }]).source, "headline");
});
