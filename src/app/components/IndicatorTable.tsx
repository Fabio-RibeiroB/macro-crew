import { overviewRows } from "../data/overview.mjs";
import { ChevronRight } from "lucide-react";

const ARROWS: Record<string, [string, string]> = { up: ["↑", "Up "], down: ["↓", "Down "] };

/**
 * A change value coloured by direction (ADR 0002): green up, red down, neutral otherwise.
 * Colour shows direction only, never good or bad, so the arrow and the sign always stay.
 */
export function Delta({ direction, children }: { direction?: "up" | "down" | "flat" | null; children: React.ReactNode }) {
  const arrow = direction ? ARROWS[direction] : null;
  if (!arrow) return <>{children}</>;
  return (
    <span className={`fs-delta fs-delta-${direction}`}>
      <span className="fs-arrow" aria-hidden="true">{arrow[0]}</span>
      <span className="fs-sr">{arrow[1]}</span>
      {children}
    </span>
  );
}

export function Lines({ lines }: { lines: any[] }) {
  return (
    <>
      {lines.map((line, index) => {
        const classes = ["fs-ln", line.sub && "fs-sub", line.missing && "fs-na", line.direction && `fs-dir fs-dir-${line.direction}`]
          .filter(Boolean).join(" ");
        return (
          <span className={classes} key={index}>
            <Delta direction={line.direction}>{line.text}</Delta>
            {line.tag && <span className="fs-tag"> {line.tag}</span>}
          </span>
        );
      })}
    </>
  );
}

/** The nine headline measures as a dense ledger (ADR 0001). Units sit next to every number. */
export function IndicatorTable({ data, hrefs }: { data: any; hrefs: Record<string, string> }) {
  const rows = overviewRows(data);
  return (
    <table className="fs-ledger">
      <caption className="fs-sr">Nine headline measures with their latest and previous official values</caption>
      <thead>
        <tr>
          <th scope="col" className="fs-col-name">Measure</th>
          <th scope="col" className="fs-num fs-col-latest">Latest</th>
          <th scope="col" className="fs-num">Previous</th>
          <th scope="col" className="fs-num" aria-describedby="change-note">Change<span aria-hidden="true">*</span></th>
          <th scope="col">Period</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row: any) => (
          <tr key={row.id} id={`overview-${row.id}`}>
            <th scope="row" className="fs-col-name">
              <a className="fs-ledger-link" href={hrefs[row.kind]}>
                {row.name}
                <ChevronRight className="fs-ledger-chevron" size={16} strokeWidth={2.5} aria-hidden="true" />
              </a>
              <p className="fs-def">{row.definition}</p>
            </th>
            <td className="fs-num fs-latest" data-label="Latest"><Lines lines={row.latest} /></td>
            <td className="fs-num fs-prev" data-label="Previous"><Lines lines={row.previous} /></td>
            <td className="fs-num fs-chg" data-label="Change"><Lines lines={row.change} /></td>
            <td className="fs-period" data-label="Period">
              <Lines lines={row.period} />
              {[...new Set<string>(row.warnings)].map((warning) => <span className="fs-ln fs-sub fs-warn" key={warning}>{warning}</span>)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
