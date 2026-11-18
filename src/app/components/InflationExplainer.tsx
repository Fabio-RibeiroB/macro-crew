// Pilot visual explainer for CPI inflation (issue #172, M13): a worked example computed from
// the verified rate, and a three-step "how it is measured" diagram. Pure HTML/CSS/SVG.
import { Percent, ShoppingBasket, Tag } from "lucide-react";
import { formatPounds, inflationExample } from "../data/inflationExample.mjs";
import { formatPeriod } from "../data/verified.mjs";
import "../../styles/inflation-explainer.css";

type Props = { kind: "cpi" | "cpih"; latest: { period?: string; value?: string | number | null } | null | undefined };

/** One bar on a shared £ scale from zero: the £100 base, plus a coloured gain or loss. */
function Bar({ pence, scale, tone }: { pence: number; scale: number; tone: "up" | "down" | "flat" | "target" }) {
  const base = Math.min(pence, 10000);
  const diff = Math.abs(pence - 10000);
  return (
    <span className="fs-ex-bar" aria-hidden="true">
      <span className="fs-ex-base" style={{ width: `${(base / scale) * 100}%` }} />
      {diff > 0 && <span className={`fs-ex-diff fs-ex-${tone}`} style={{ width: `${(diff / scale) * 100}%` }} />}
    </span>
  );
}

/** The gap to £100 as a small signed label, in the direction colour (target stays neutral). */
function gain(pence: number, direction: "up" | "down" | "flat") {
  const diff = pence - 10000;
  if (diff === 0) return null;
  const text = `${diff > 0 ? "+" : "\u2212"}${formatPounds(Math.abs(diff))}`;
  return <span className={`fs-ex-gain${direction === "flat" ? "" : ` fs-ex-gain-${direction}`}`}>{text}</span>;
}

export function InflationExplainer({ kind, latest }: Props) {
  const ex = inflationExample(kind, latest);
  if (!ex) return null;
  const then = formatPeriod(ex.thenPeriod);
  const now = formatPeriod(ex.nowPeriod);
  const scale = Math.max(ex.nowPence, ex.targetPence ?? 0, ex.thenPence);
  const target = ex.targetPence === null ? null : formatPounds(ex.targetPence);
  return (
    <figure className="fs-ex" aria-labelledby="inflation-example-title">
      <div className="fs-ex-head">
        <span className="fs-ex-icon" aria-hidden="true"><ShoppingBasket size={20} strokeWidth={1.9} /></span>
        <h4 id="inflation-example-title">What {ex.rateText} means</h4>
      </div>
      <p className="fs-ex-sentence">
        Shopping that cost <strong>{formatPounds(ex.thenPence)}</strong> in {then} costs about{" "}
        <strong>{formatPounds(ex.nowPence)}</strong> in {now}.
        {target && <> At the Bank of England’s {ex.targetText} target it would cost <strong>{target}</strong>.</>}
      </p>
      {/* The sentence above is the text equivalent; the bars repeat it visually only. */}
      <div className="fs-ex-bars" aria-hidden="true">
        <div className="fs-ex-line">
          <span className="fs-ex-name">{then}</span><span className="fs-ex-amt">{formatPounds(ex.thenPence)}</span>
          <Bar pence={ex.thenPence} scale={scale} tone="flat" />
        </div>
        <div className="fs-ex-line fs-ex-now">
          <span className="fs-ex-name">{now}</span><span className="fs-ex-amt">{formatPounds(ex.nowPence)}{gain(ex.nowPence, ex.direction)}</span>
          <Bar pence={ex.nowPence} scale={scale} tone={ex.direction} />
        </div>
        {ex.targetPence !== null && (
          <div className="fs-ex-line fs-ex-ref">
            <span className="fs-ex-name">At the {ex.targetText} target</span><span className="fs-ex-amt">{target}{gain(ex.targetPence, "flat")}</span>
            <Bar pence={ex.targetPence} scale={scale} tone="target" />
          </div>
        )}
      </div>
      <figcaption>FinStats illustration using the official {ex.label} rate</figcaption>
    </figure>
  );
}

/** The sequence behind the headline rate. Basket size: ONS basket article, 2026 (760 items). */
export function InflationSteps() {
  const steps = [
    { Icon: ShoppingBasket, text: <>A basket of <strong>more than 700</strong> everyday goods and services</> },
    { Icon: Tag, text: <>Prices <strong>collected every month</strong></> },
    { Icon: Percent, text: <>Compared with the <strong>same month a year earlier</strong></>, result: "= the inflation rate" },
  ];
  return (
    <ol className="fs-steps">
      {steps.map(({ Icon, text, result }, index) => (
        <li key={index}>
          <span className="fs-step-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.9} /></span>
          <span className="fs-step-text">
            <span className="fs-step-n">Step {index + 1}</span>
            <span>{text}</span>
            {result && <strong className="fs-step-result">{result}</strong>}
          </span>
        </li>
      ))}
    </ol>
  );
}
