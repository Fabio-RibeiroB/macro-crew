// A short plain-English reading of the verified figures just below it on the overview.
// It is built by fixed rules from the same snapshot as the table (never AI, never a
// forecast) and is hidden when no core figure is available.
import "../../styles/takeaway.css";
import { overviewTakeaway } from "../data/takeaway.mjs";

export function OverviewTakeaway({ data }: { data: any }) {
  const takeaway = overviewTakeaway(data);
  if (!takeaway) return null;
  return (
    <section className="fs-takeaway" aria-labelledby="takeaway-title">
      <h2 id="takeaway-title" className="fs-takeaway-tag">Takeaway</h2>
      <p className="fs-takeaway-text">{takeaway.text}</p>
      <p className="fs-takeaway-note">Summarised from the official figures below, not written by AI.</p>
    </section>
  );
}
