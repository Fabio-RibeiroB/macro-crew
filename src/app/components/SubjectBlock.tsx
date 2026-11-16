// Shared building blocks for subject pages (ADR 0001): a fixed label column in the
// order Key figure, What it means, Chart, AI summary, Sources.
import { formatPeriod, freshness, reportLabel } from "../data/verified.mjs";
import { checkedAt } from "../data/format.mjs";
import { Lines } from "./IndicatorTable";
import { OfficialLink } from "./OfficialLink";

/** One labelled row of a subject block: the fixed label column marks the agreed order. */
export function Row({ label, id, labelId, children }: { label: string; id?: string; labelId: string; children: React.ReactNode }) {
  return (
    <div className="fs-row" id={id}>
      <h3 className="fs-row-label" id={labelId}>{label}</h3>
      <div className="fs-row-cell" role="group" aria-labelledby={labelId}>{children}</div>
    </div>
  );
}

/** "3.75%" becomes a large number with a smaller unit; the unit always stays attached. */
export function BigValue({ text }: { text: string }) {
  const match = /^([+−£]?[\d,.]+)(.*)$/.exec(text);
  return (
    <p className="fs-fig-v">
      {match ? <>{match[1]}<span className="fs-fig-u">{match[2]}</span></> : text}
    </p>
  );
}

export function KeyFigure({ row, metric, publisher, observedLabel }: any) {
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

export function Sources({ metric, extra }: any) {
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

/**
 * The AI summary section body (ADR 0001): the one visually distinct block. It is
 * AI-written commentary on Bank of England publications, never FinStats data. Any
 * inflation measure or figure in the text is attributed to the Bank's report, because
 * it need not match the headline measure this site shows (CPI or CPIH). The summary
 * text itself is rendered exactly as received.
 */
export function AiCommentary({ reports, reportTime }: any) {
  return (
    <div className="fs-ai-box">
      <div className="fs-ai-note">
        <span className="fs-ai-tag">AI commentary — not checked against the official figures</span>
        <p>
          Summaries of Bank of England publications{reportTime ? `, generated ${checkedAt(reportTime)}` : ""}.
          Figures and inflation measures mentioned are as cited in the Bank of England report. They are not this
          site’s official figures, which are shown above. Use the original publication to confirm facts, dates and forecasts.
        </p>
      </div>
      {reports.map((report: any) => (
        <article className="fs-ai-art" key={report.key}>
          <h4>{reportLabel(report)}</h4>
          <p className="fs-ai-meta">
            {report.report_date ? <>Bank of England report dated {formatPeriod(report.report_date)}</> : "Bank of England report, date not supplied"}
          </p>
          <p>{report.summary}</p>
          <OfficialLink href={report.source}>Read the original Bank of England publication</OfficialLink>
        </article>
      ))}
      {!reports.length && (
        <p className="fs-ai-empty">The AI summary could not be loaded. Official figures and links remain available.</p>
      )}
    </div>
  );
}
