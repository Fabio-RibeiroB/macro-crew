// One line on the overview: the latest Monetary Policy Report in a sentence, labelled
// as AI and linking to the full AI summary. It is AI text, never a FinStats figure, and
// it is hidden when there is no report.
import "../../styles/ai-summary.css";
import { mpcLine } from "../data/aiSummary.mjs";

export function MpcLine({ reports }: { reports: any[] }) {
  const line = mpcLine(reports);
  if (!line) return null;
  return (
    <section className="fs-container fs-mpc-line" aria-label="Monetary Policy Committee, AI summary">
      <span className="fs-ai-tag">AI summary</span>
      <p>
        <strong>MPC:</strong> {line.text}
      </p>
      <a className="fs-link" href="/economy#ai-summary">Read the AI summary</a>
    </section>
  );
}
