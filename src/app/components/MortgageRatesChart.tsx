import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useId, useMemo, useState } from "react";
import {
  CHART_RANGES,
  DEFAULT_CHART_RANGE,
  chartYAxis,
  filterChartRange,
  moveChartRange,
} from "../data/chartRange.mjs";
import { describeGaps, gapSpans } from "../data/chartMeta.mjs";
import { formatPeriod } from "../data/verified.mjs";
import "../../styles/mortgage-rates.css";

type Row = { date: string; [key: string]: number | string | null };
type Series = { key: string; name: string; kind: "rate" | "bank" };

/**
 * How each line looks. Colour is never the only cue: the lines differ in dash pattern
 * and the legend repeats each pattern beside its name. Bank Rate is a step line.
 */
const STYLE: Record<string, { stroke: string; width: number; dash?: string; curve: "linear" | "stepAfter" }> = {
  mortgage_2y_fixed_75: { stroke: "var(--fs-accent)", width: 2.5, curve: "linear" },
  mortgage_5y_fixed_75: { stroke: "var(--fs-ink)", width: 2, dash: "8 4", curve: "linear" },
  bank_rate: { stroke: "var(--fs-muted)", width: 1.75, dash: "2 3", curve: "stepAfter" },
};

const exact = (value: unknown) => (typeof value === "number" ? `${value}%` : "Missing");

function formatAxisDate(value: string) {
  const date = new Date(`${value}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function Swatch({ id }: { id: string }) {
  const style = STYLE[id];
  return (
    <svg className="fs-mortgage-swatch" width="30" height="10" viewBox="0 0 30 10" aria-hidden="true" focusable="false">
      <line x1="1" y1="5" x2="29" y2="5" stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} />
    </svg>
  );
}

function MortgageTooltip({ active, payload, label, series }: { active?: boolean; payload?: any[]; label?: string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="fs-mortgage-tip">
      <p className="fs-mortgage-tip-date">{formatPeriod(label ?? row.date)}</p>
      <ul>
        {series.map((line) => (
          <li key={line.key}>
            <Swatch id={line.key} />
            <span>{line.name}</span>
            <strong>{exact(row[line.key])}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Both mortgage rates and Bank Rate on one percent axis. Exact values stay in a table,
 * gaps stay as breaks in the line and nothing is estimated or shown as zero.
 */
export function MortgageRatesChart({ rows, series, updated }: { rows: Row[]; series: Series[]; updated?: { date: string; label: string } | null }) {
  const [selectedRange, setSelectedRange] = useState(DEFAULT_CHART_RANGE);
  const noteId = useId();
  const selection = useMemo(() => filterChartRange(rows, selectedRange), [rows, selectedRange]);
  const visible = selection.points as Row[];
  const values = visible.flatMap((row) => series.map(({ key }) => row[key])).filter((v): v is number => typeof v === "number");
  const { domain: [yMin, yMax], ticks } = chartYAxis(values);
  const gaps = useMemo(
    () => series.map((line) => ({
      line,
      spans: gapSpans(visible.map((row) => ({ date: row.date, value: row[line.key] as number | null }))),
    })).filter(({ spans }) => spans.length),
    [visible, series],
  );
  const latest = visible.at(-1);

  function onRangeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = moveChartRange(selectedRange, event.key);
    if (!next) return;
    event.preventDefault();
    setSelectedRange(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-range="${next}"]`)?.focus();
  }

  const names = series.map((line) => line.name).join(", ");
  return (
    <div className="fs-chart">
      <div className="fs-chart-head">
        <div className="fs-chart-heading">
          <p className="fs-chart-title">Quoted mortgage rates and Bank Rate</p>
          <p className="fs-chart-sub">
            <span>Percent per year, monthly. Mortgage rates are averages of quoted rates, not offers.</span>
            {updated?.label && (
              <>
                <span aria-hidden="true" className="fs-chart-sep"> · </span>
                <span className="fs-chart-upd"><time dateTime={updated.date}>{updated.label}</time></span>
              </>
            )}
          </p>
        </div>
        <div
          className="fs-range"
          role="radiogroup"
          aria-label="Historical range for mortgage rates"
          aria-describedby={selection.notice ? noteId : undefined}
          onKeyDown={onRangeKeyDown}
        >
          {CHART_RANGES.map((range) => {
            const checked = selectedRange === range.id;
            return (
              <button
                key={range.id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${range.label}, ${range.name}`}
                data-range={range.id}
                tabIndex={checked ? 0 : -1}
                onClick={() => setSelectedRange(range.id)}
              >
                {range.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="fs-chart-head-legend">
        <ul className="fs-mortgage-legend" aria-label="Chart key">
          {series.map((line) => (
            <li key={line.key}><Swatch id={line.key} />{line.name}</li>
          ))}
        </ul>
      </div>
      <div className="fs-chart-body">
        {selection.notice && <p className="fs-chart-range-note" id={noteId} role="status">{selection.notice}</p>}
        <div
          className="h-64"
          role="img"
          aria-label={`Line chart of ${names}, ${visible.length} months${latest ? ` to ${formatPeriod(latest.date)}` : ""}. Bank Rate is the rate on the last day of each month. Exact values are in the table below.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visible} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--dash-chart-grid)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatAxisDate} fontSize={10} tick={{ fill: "var(--dash-text-4)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[yMin, yMax]} ticks={ticks} fontSize={10} tick={{ fill: "var(--dash-text-4)", fontVariantNumeric: "tabular-nums" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={54} />
              <Tooltip content={<MortgageTooltip series={series} />} cursor={{ stroke: "var(--dash-border)", strokeWidth: 1 }} />
              {series.map((line) => {
                const style = STYLE[line.key];
                return (
                  <Line
                    key={line.key}
                    type={style.curve}
                    dataKey={line.key}
                    name={line.name}
                    stroke={style.stroke}
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                    connectNulls={false}
                    dot={false}
                    activeDot={{ r: 4, fill: style.stroke, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {gaps.length > 0 && (
          <p className="fs-chart-gap-note">
            <span className="fs-chart-gap-key" aria-hidden="true" />
            Gaps in a line are months with no figure: {gaps.map(({ line, spans }) => `${line.name}, ${describeGaps(spans)}`).join("; ")}. Nothing is estimated or shown as zero.
          </p>
        )}
        <details className="fs-chart-values">
          <summary>Exact values ({visible.length})</summary>
          <div className="fs-chart-values-scroll">
            <table>
              <caption>
                Quoted mortgage rates and Bank Rate, in percent. Latest revised values for each month.
                {selection.notice ? ` ${selection.notice}` : ""}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  {series.map((line) => <th scope="col" key={line.key}>{line.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.date}>
                    <td>{formatPeriod(row.date)}</td>
                    {series.map((line) => <td key={line.key}>{exact(row[line.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
