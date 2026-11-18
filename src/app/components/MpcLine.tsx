// One line on the overview: the latest Monetary Policy Report in a sentence, labelled
// as AI and linking to the full AI summary. It is AI text, never a FinStats figure, and
// it is hidden when there is no report.
import "../../styles/ai-summary.css";
import { aiWrittenShort, mpcLine } from "../data/aiSummary.mjs";

export function MpcLine({ reports, reportTime = null }: { reports: any[]; reportTime?: string | null }) {
  const line = mpcLine(reports);
  if (!line) return null;
  const report = reports.find((item) => item?.key === "monetary_policy_report");
  const written = aiWrittenShort(report, reportTime);
  return (
    <section className="fs-container fs-mpc-line" aria-label="Monetary Policy Committee, AI summary">
      <span className="fs-ai-tag">AI summary</span>
      <p>
        <strong>MPC:</strong> {line.text}
        {written && <span className="fs-mpc-date"> {written}</span>}
      </p>
      <a className="fs-link" href="/economy#ai-summary">Read the AI summary</a>
    </section>
  );
}
