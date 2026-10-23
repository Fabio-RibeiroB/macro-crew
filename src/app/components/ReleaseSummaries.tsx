import { ExternalLink, RefreshCw } from "lucide-react";
import { summariesForSubject, summaryPeriodLabel } from "../data/summaries.mjs";

const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

/** Render only validated producer claims belonging to this page's subject. */
export function ReleaseSummaries({ subject, data, metrics, loading, error, refresh }: any) {
  const claims = summariesForSubject(data, subject, metrics);
  const subjectLabels: Record<string, string> = {
    prices: "Prices", housing: "Housing", "jobs-pay": "Jobs and pay", economy: "The economy", government: "Government and the Budget",
  };
  const title = subjectLabels[subject] ?? "this subject";
  const status = data?.status?.status;
  const unavailable = !data && (loading || error);
  return <section className="fs-container fs-section" aria-labelledby={`release-explanations-${subject}`}>
    <div className="fs-context-card">
      <div className="fs-stat-top">
        <h2 id={`release-explanations-${subject}`}>Official release explanations · {title}</h2>
        <button type="button" className="fs-icon-button" onClick={refresh} aria-label={`Refresh ${title.toLowerCase()} explanations`} disabled={loading}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>
      {unavailable && <p role={error ? "alert" : "status"}>{error ? "Release explanations could not be refreshed. Any previously loaded explanations are retained." : "Checking for release explanations…"}</p>}
      {error && data && <p role="status">The explanation check failed. The previously loaded release periods remain visible.</p>}
      {status === "stale" && <p role="status">The summary publisher reports a stale or failed refresh. Previously published periods remain available below.</p>}
      {status === "disabled" && <p role="status">The summary publisher is disabled. Previously published periods, if any, remain available below.</p>}
      {claims.length === 0 && status !== "disabled" && !unavailable && <p>No compatible published explanations are available for this subject yet.</p>}
      {claims.length > 0 && <ol className="fs-summary-list">{claims.map((claim: any, index: number) => {
        const metric = metrics?.[claim.metric_key];
        const label = claim.matchesCurrent
          ? "Matches the current verified reading"
          : summaryPeriodLabel(claim, metric);
        return <li key={`${claim.key}:${claim.metric_key}:${claim.period}:${index}`}>
          <p className="fs-eyebrow">{label}</p>
          <p>{claim.summaryText}</p>
          <p className="fs-caption">Official release: {dateLabel(claim.release.published_date)} · Explanation generated: {dateLabel(claim.generated_at)}</p>
          <p className="fs-caption">Sources: {claim.citations.map((url: string, citationIndex: number) => <a className="fs-link" key={url} href={url} target="_blank" rel="noopener noreferrer">Official source {citationIndex + 1} <ExternalLink size={13} aria-hidden="true" /></a>)}</p>
        </li>;
      })}</ol>}
      {subject === "economy" && <p className="fs-caption">MPC meeting dates are published, but MPC policy decisions are not covered by the currently qualified release-summary feed.</p>}
      {subject === "government" && <p className="fs-caption">Budget announcements and OBR forecasts are not covered by the currently qualified release-summary feed.</p>}
      <p className="fs-caption">These explanations are independent of verified figures. They do not provide forecasts or individual household advice.</p>
    </div>
  </section>;
}
