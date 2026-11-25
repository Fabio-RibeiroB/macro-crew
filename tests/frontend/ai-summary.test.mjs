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
      // The unpublished feed leaves no empty "AI summary" heading on pages with no AI commentary.
      if (path !== "/economy") assert.doesNotMatch(html, /id="ai-summary-title"|id="ai-summary"/, path);
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
    assert.match(html, /<span class="fs-ai-tag">AI summary<\/span>/);
    assert.doesNotMatch(text, /AI commentary|not checked against the official figures/);
    assert.match(text, /Summarised by AI from the Bank of England’s March 2026 Monetary Policy Summary and minutes ?\. AI can make mistakes — check the original publication\./);
    assert.match(text, /December 2025 Financial Stability Report ?\. AI can make mistakes/);
    // One sub-heading per report; the first sentence is bold and the rest are points.
    assert.match(html, /<h4>Monetary Policy Summary and minutes<\/h4>/);
    assert.match(html, /<h4>Financial Stability Report<\/h4>/);
    assert.equal((html.match(/<strong>/g) ?? []).length, 2);
    assert.equal((html.match(/<li>/g) ?? []).length, 6);

    // Each report shows its report date and a link to its source document, text unaltered.
    for (const report of reports) {
      assert.ok(html.includes(`href="${report.source}"`), report.key);
      assert.ok(text.includes(report.summary), "summary text is rendered unaltered");
    }
    assert.match(text, /Bank of England report dated 19 March 2026/);
    assert.match(text, /Bank of England report dated 15 December 2025/);
        assert.doesNotMatch(text, /Official figure/);

    // An undated report is stated plainly, and an empty feed stays honest.
    assert.match(renderToStaticMarkup(createElement(AiCommentary, { reports: [{ ...reports[0], report_date: null }], reportTime: null })), /date not supplied/);
    assert.match(renderToStaticMarkup(createElement(AiCommentary, { reports: [], reportTime: null })), /The AI summary could not be loaded/);

    // Opening remarks PDFs render with the opening remarks title rather than "Monetary Policy Report".
    const remarksHtml = renderToStaticMarkup(
      createElement(AiCommentary, {
        reports: [
          {
            key: "monetary_policy_report",
            summary: "The Governor outlined the committee's inflation outlook.",
            report_date: "2026-11-05",
            source: "https://www.bankofengland.co.uk/-/media/boe/files/monetary-policy-report/2026/november/opening-remarks-november-2026",
          },
        ],
        reportTime: null,
      }),
    );
    assert.match(remarksHtml, /<h4>Monetary Policy Report opening remarks<\/h4>/);
    assert.match(remarksHtml, /November 2026 Monetary Policy Report opening remarks/);
  } finally { await server.close(); }
});

test("AI summary text is only split and laid out, never changed", async () => {
  const { splitSentences, summaryParts, publicationName, publicationTitle } = await import("../../src/app/data/aiSummary.mjs");
  const rejoin = (text) => splitSentences(text).join(" ");

  // Simple and multi-sentence text.
  assert.deepEqual(splitSentences("Rates held. Inflation fell! Will it last? Maybe."), ["Rates held.", "Inflation fell!", "Will it last?", "Maybe."]);
  assert.deepEqual(splitSentences("Report No. 1 found rates steady. Then it ended."), ["Report No. 1 found rates steady.", "Then it ended."]);
  assert.deepEqual(summaryParts("One. Two. Three."), { lead: "One.", points: ["Two.", "Three."] });
  assert.deepEqual(summaryParts("Only one sentence."), { lead: "Only one sentence.", points: [] });
  assert.deepEqual(summaryParts(""), { lead: "", points: [] });
  assert.deepEqual(summaryParts(null), { lead: "", points: [] });

  // Decimals, percentages and prices do not split.
  assert.deepEqual(splitSentences("Bank Rate stayed at 3.5% in 2026. CPI was 2.8% and GDP rose 0.1%. It cost £1.50 per litre."), [
    "Bank Rate stayed at 3.5% in 2026.", "CPI was 2.8% and GDP rose 0.1%.", "It cost £1.50 per litre.",
  ]);
  // Abbreviations, initials and dotted acronyms do not split.
  const tricky = [
    "Mr. Bailey said rates could fall.",
    "Dr. J. Smith, e.g. an economist, agreed.",
    "The U.K. economy grew, i.e. it expanded.",
    "Prices rose in Jan. 2026, vs. 2025.",
  ];
  for (const sentence of tricky) assert.deepEqual(splitSentences(sentence), [sentence]);
  assert.deepEqual(splitSentences("Mr. Bailey spoke. The Governor agreed."), ["Mr. Bailey spoke.", "The Governor agreed."]);
  // A stop followed by lower case or a missing space is not a boundary.
  assert.deepEqual(splitSentences("It rose by 2 pp. over the year, and fell later."), ["It rose by 2 pp. over the year, and fell later."]);
  assert.deepEqual(splitSentences("See www.bankofengland.co.uk for more. Thanks."), ["See www.bankofengland.co.uk for more.", "Thanks."]);
  // Closing quotes and brackets stay with their sentence.
  assert.deepEqual(splitSentences("It was “data dependent.” Rates held (for now.) Next came 2027."), ["It was “data dependent.”", "Rates held (for now.)", "Next came 2027."]);

  // Rejoined sentences equal the original text (whitespace normalised): no word is lost or changed.
  const raw = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../../public/research_report.json", import.meta.url), "utf8"));
  for (const report of Object.values(raw.current_report_summaries)) assert.equal(rejoin(report.summary), report.summary.replace(/\s+/g, " ").trim());
  for (const sentence of tricky) assert.equal(rejoin(sentence), sentence);

  // Publication names come from the source document and the report date.
  const mpr = { key: "monetary_policy_report", source: "https://www.bankofengland.co.uk/monetary-policy-report/2026/february-2026", report_date: "2026-02-05" };
  assert.equal(publicationTitle(mpr), "Monetary Policy Report");
  assert.equal(publicationName(mpr), "February 2026 Monetary Policy Report");
  assert.equal(publicationName({ ...mpr, report_date: null }), "Monetary Policy Report");
  assert.equal(publicationName({ ...mpr, report_date: "not a date" }), "Monetary Policy Report");

  // Press conference opening remarks PDFs are labelled as opening remarks, not the full report.
  const remarks = {
    key: "monetary_policy_report",
    source: "https://www.bankofengland.co.uk/-/media/boe/files/monetary-policy-report/2026/november/opening-remarks-november-2026",
    report_date: "2026-11-05",
  };
  assert.equal(publicationTitle(remarks), "Monetary Policy Report opening remarks");
  assert.equal(publicationName(remarks), "November 2026 Monetary Policy Report opening remarks");
  assert.equal(
    publicationTitle({ ...remarks, source: `${remarks.source}.pdf` }),
    "Monetary Policy Report opening remarks",
  );
  assert.equal(
    publicationTitle({
      ...remarks,
      source: "https://www.bankofengland.co.uk/-/media/boe/files/monetary-policy-report/2026/november/Opening-Remarks-November-2026.PDF",
    }),
    "Monetary Policy Report opening remarks",
  );
  // FSR opening remarks and unrelated conference speeches must not be mislabelled as MPR.
  assert.equal(
    publicationTitle({
      key: "financial_stability_report",
      source: "https://www.bankofengland.co.uk/speech/2025/december/andrew-bailey-opening-remarks-financial-stability-report-press-conference",
    }),
    "Financial Stability Report opening remarks",
  );
  assert.equal(
    publicationTitle({
      source: "https://www.bankofengland.co.uk/speech/2026/october/opening-remarks-at-a-conference",
    }),
    "Monetary Policy Committee publication",
  );
});
