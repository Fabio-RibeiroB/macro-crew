import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { chartPoints, formatPeriod, freshness, reportLabel } from "../data/verified.mjs";
import { overviewRows } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { Lines } from "./IndicatorTable";
import { OfficialLink } from "./OfficialLink";

/** One labelled row of a subject block: the fixed label column marks the agreed order. */
function Row({ label, id, labelId, children }: { label: string; id?: string; labelId: string; children: React.ReactNode }) {
  return (
    <div className="fs-row" id={id}>
      <h3 className="fs-row-label" id={labelId}>{label}</h3>
      <div className="fs-row-cell" role="group" aria-labelledby={labelId}>{children}</div>
    </div>
  );
}

/** "3.75%" becomes a large number with a smaller unit; the unit always stays attached. */
function BigValue({ text }: { text: string }) {
  const match = /^([+−£]?[\d,.]+)(.*)$/.exec(text);
  return (
    <p className="fs-fig-v">
      {match ? <>{match[1]}<span className="fs-fig-u">{match[2]}</span></> : text}
    </p>
  );
}

function KeyFigure({ row, metric, publisher, observedLabel }: any) {
  const status = metric?.latest ? freshness(metric) : null;
  return (
    <div className="fs-fig">
      <BigValue text={row.latest[0].text} />
      <dl className="fs-kv">
        <div><dt>Previous</dt><dd><Lines lines={row.previous} /></dd></div>
        <div><dt>Change*</dt><dd><Lines lines={row.change} /></dd></div>
        <div><dt>{observedLabel}</dt><dd><Lines lines={row.period.filter((line: any) => !line.sub)} /></dd></div>
        <div>
          <dt>Next release</dt>
          <dd>{metric?.next_release_date ? formatPeriod(metric.next_release_date) : "See the official calendar"}</dd>
        </div>
      </dl>
      <p className="fs-fig-src">
        {metric?.latest ? <>Official figure · {publisher}</> : "A verified reading is not available yet."}
        {status && status.kind !== "ok" && <span className="fs-fresh-warning"> · {status.label}</span>}
      </p>
    </div>
  );
}

function Sources({ metric, extra }: any) {
  if (!metric?.definition) return <p>Source details appear when a verified reading is available.</p>;
  const { definition } = metric;
  const history = metric.history ?? [];
  return (
    <>
      <dl className="fs-src">
        <div><dt>Series</dt><dd>{definition.title ? `${definition.title}, ` : ""}{definition.dataset} / {definition.series}</dd></div>
        <div>
          <dt>Official release</dt>
          <dd>{metric.source_published_date ? formatPeriod(metric.source_published_date) : "Not supplied by the daily feed"}</dd>
        </div>
        <div><dt>Last successful check</dt><dd>{checkedAt(metric.last_successful_check_at)}</dd></div>
        {history.length > 0 && (
          <div>
            <dt>History</dt>
            <dd>{history.length.toLocaleString("en-GB")} observations, {formatPeriod(history[0].period)} to {formatPeriod(history.at(-1).period)}</dd>
          </div>
        )}
      </dl>
      <OfficialLink href={definition.source_url}>View the official series</OfficialLink>
      {extra}
    </>
  );
}

function AiCommentary({ reports, reportTime }: any) {
  return (
    <div className="fs-ai-box">
      <div className="fs-ai-note">
        <span className="fs-ai-tag">AI commentary</span>
        <p>
          On the latest Bank of England publications{reportTime ? `, generated ${checkedAt(reportTime)}` : ""}.
          It is not checked against the official figures on this site. Use the original publication to confirm facts, dates and forecasts.
        </p>
      </div>
      {reports.map((report: any) => (
        <article className="fs-ai-art" key={report.key}>
          <h4>{reportLabel(report)}, {formatPeriod(report.report_date)}</h4>
          <p>{report.summary}</p>
          <OfficialLink href={report.source}>Original publication</OfficialLink>
        </article>
      ))}
      {!reports.length && (
        <p className="fs-ai-empty">The AI summary could not be loaded. Official figures and links remain available.</p>
      )}
    </div>
  );
}

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
