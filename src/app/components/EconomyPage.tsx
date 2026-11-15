import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { chartPoints } from "../data/verified.mjs";
import { overviewRows } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { OfficialLink } from "./OfficialLink";
import { AiCommentary, KeyFigure, Row, Sources } from "./SubjectBlock";

/**
 * Economy: each measure reads in one fixed order, Key figure, What it means, Chart,
 * AI summary, Sources. Anchors from the earlier layout (#interest-rates, #gdp,
 * #ai-summary, #trends, #figures) still resolve.
 */
export function EconomyPage({ data, loading, error, refresh, topics, reports, reportTime, HistoricalTrendCard }: any) {
  const rows = data ? Object.fromEntries(overviewRows(data).map((row: any) => [row.id, row])) : {};
  const bank = data?.metrics?.bank_rate;
  const gdp = data?.metrics?.gdp;
  const chart = (metric: any, props: any) =>
    !data ? (
      <p>Charts will appear when verified figures are available.</p>
    ) : metric?.history?.length ? (
      <Suspense fallback={<p role="status">Loading chart…</p>}>
        <HistoricalTrendCard {...props} data={chartPoints(metric)} />
      </Suspense>
    ) : (
      <p>A verified history is not available yet.</p>
    );
  const figure = (id: string, metric: any, publisher: string, observed: string) =>
    data ? (
      <KeyFigure row={rows[id]} metric={metric} publisher={publisher} observedLabel={observed} />
    ) : error ? (
      <p>Verified figures are unavailable. You can still read the explanations and visit the official sources.</p>
    ) : (
      <p className="fs-loading" role="status">Checking the official-data export…</p>
    );
  return (
    <div className="fs-container fs-economy" id="figures">
      <div className="fs-statusbar">
        <p>
          {data ? <>Figures last updated {checkedAt(data.published_at)} and can be revised. <a href="/sources">How we check the data</a></> : "Official figures"}
        </p>
        <button className="fs-text-button" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={15} className={loading ? "fs-spin" : ""} aria-hidden="true" />
          {loading ? "Checking figures…" : "Check for updates"}
        </button>
      </div>
      {error && (
        <div className="fs-alert" role="status">
          {error}{" "}
          {data ? "The last successfully loaded figures remain below." : "Verified figures are unavailable."}
        </div>
      )}

      <section className="fs-block" id="interest-rates" aria-labelledby="interest-rates-title">
        <h2 id="interest-rates-title">Bank Rate</h2>
        <Row label="Key figure" labelId="bank-key-label">{figure("bank-rate", bank, "Bank of England", "Observed on")}</Row>
        <Row label="What it means" labelId="bank-means-label">
          <div className="fs-means">
            <p>{topics.bank_rate.meaning}</p>
            <p>
              The Bank of England’s Monetary Policy Committee, or MPC, sets Bank Rate to help keep inflation low and
              stable. A change can reach variable-rate borrowers sooner. Fixed mortgage payments usually stay the same
              during the fixed period, but the cost can change when the deal ends. Savings providers do not all pass on
              changes in the same way.
            </p>
            <p>When a rate decision is announced, look at:</p>
            <ul>
              <li><strong>The decision:</strong> did the rate change?</li>
              <li><strong>The votes:</strong> did members agree, and why?</li>
              <li><strong>The outlook:</strong> what evidence could change the next decision?</li>
            </ul>
            <p>{topics.bank_rate.caution} A forecast or a voting split is not a promise about the next meeting.</p>
            <OfficialLink href="https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate">
              Read the latest official rate decision
            </OfficialLink>
          </div>
        </Row>
        <Row label="Chart" id="trends" labelId="bank-chart-label">
          {chart(bank, { title: topics.bank_rate.measurement, label: "Bank Rate", curve: "stepAfter" })}
        </Row>
        <Row label="AI summary" id="ai-summary" labelId="ai-summary-heading">
          <AiCommentary reports={reports} reportTime={reportTime} />
        </Row>
        <Row label="Sources" labelId="bank-sources-label"><Sources metric={bank} /></Row>
      </section>

      <section className="fs-block" id="gdp" aria-labelledby="gdp-title">
        <h2 id="gdp-title">GDP</h2>
        <Row label="Key figure" labelId="gdp-key-label">{figure("gdp", gdp, "Office for National Statistics", "Period")}</Row>
        <Row label="What it means" labelId="gdp-means-label">
          <div className="fs-means">
            <p>{topics.gdp.meaning}</p>
            <p>
              This figure is the change from the previous month, after removing seasonal patterns and price changes. It
              is not a yearly figure.
            </p>
            <p>{topics.gdp.caution}</p>
            <OfficialLink href="https://www.ons.gov.uk/economy/grossdomesticproductgdp">
              Explore the GDP releases
            </OfficialLink>
          </div>
        </Row>
        <Row label="Chart" labelId="gdp-chart-label">
          {chart(gdp, { title: topics.gdp.measurement, label: "GDP" })}
        </Row>
        <Row label="AI summary" labelId="gdp-ai-label">
          <div className="fs-ai-box">
            <p className="fs-ai-empty">There is no AI summary for GDP yet. The official figure and its sources are on this page.</p>
          </div>
        </Row>
        <Row label="Sources" labelId="gdp-sources-label"><Sources metric={gdp} /></Row>
      </section>
      <p className="fs-ledger-note" id="change-note">
        * Change is the latest value minus the previous one, calculated by FinStats from the official series. pp means percentage points.
      </p>
    </div>
  );
}
