// The AI summary section body (ADR 0001, ADR 0002). It is AI-written text about Bank
// of England publications, never FinStats data. Any inflation measure or figure in the
// text is the Bank report's own and need not match the headline measure this site
// shows. The summary text itself is never edited: it is only laid out for reading,
// with the first sentence in bold and the rest as short points.
import "../../styles/ai-summary.css";
import { formatPeriod } from "../data/verified.mjs";
import { aiFailureNotice } from "../data/aiStatus.mjs";
import { aiWrittenLabel, publicationName, publicationTitle, summaryParts } from "../data/aiSummary.mjs";
import { OfficialLink } from "./OfficialLink";

const WHO_LINKS: Record<string, { href: string; label: string }> = {
  monetary_policy_report: { href: "/whos-who#mpc", label: "Who is the MPC?" },
  financial_stability_report: { href: "/whos-who#boe", label: "Who is the Bank of England?" },
};

export function AiCommentary({ reports, reportTime, aiStatus = null }: any) {
  const notice = aiFailureNotice(aiStatus, reportTime);
  return (
    <div className="fs-ai-box">
      {notice && <p className="fs-ai-fail" role="status">{notice}</p>}
      {reports.map((report: any) => {
        const { lead, points } = summaryParts(report.summary);
        return (
          <article className="fs-ai-art fs-aisum" key={report.key}>
            <div className="fs-aisum-head">
              <span className="fs-ai-tag">AI summary</span>
              <h4>{publicationTitle(report)}</h4>
            </div>
            <p className="fs-ai-meta">
              {report.report_date ? <>Bank of England report dated {formatPeriod(report.report_date)}</> : "Bank of England report, date not supplied"}
              {" · "}{aiWrittenLabel(report, reportTime)}
            </p>
            <p className="fs-aisum-lead"><strong>{lead}</strong></p>
            {points.length > 0 && (
              <ul className="fs-aisum-points">
                {points.map((point: string, index: number) => <li key={index}>{point}</li>)}
              </ul>
            )}
            <p className="fs-aisum-note">
              Summarised by AI from the Bank of England’s{" "}
              <OfficialLink href={report.source}>{publicationName(report)}</OfficialLink>.
              {" "}AI can make mistakes — check the original publication.
            </p>
            {WHO_LINKS[report.key] && (
              <p className="fs-aisum-who">
                <a className="fs-link" href={WHO_LINKS[report.key].href}>{WHO_LINKS[report.key].label}</a>
              </p>
            )}
          </article>
        );
      })}
      {!reports.length && (
        <p className="fs-ai-empty">The AI summary could not be loaded. Official figures and links remain available.</p>
      )}
    </div>
  );
}
