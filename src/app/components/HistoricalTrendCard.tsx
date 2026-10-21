import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo, useState } from "react";
import {
  CHART_RANGES,
  DEFAULT_CHART_RANGE,
  filterChartRange,
  moveChartRange,
} from "../data/chartRange.mjs";
import { formatPeriod } from "../data/verified.mjs";

interface TrendPoint {
  date?: string;
  period?: string;
  value: number | null;
  status?: string;
  revision?: string;
  unit?: string;
  reference?: { kind: string; start_month: string; end_month: string };
}

interface HistoricalTrendCardProps {
  title: string;
  label: string;
  unit?: string;
  unitDescription?: string;
  color?: string;
  data: TrendPoint[];
  referenceLine?: { value: number; label: string };
  curve?: "linear" | "stepAfter";
}

function formatAxisDate(dateStr: string) {
  const monthly = /^\d{4}-\d{2}$/.test(dateStr);
  const d = new Date(monthly ? `${dateStr}-01T00:00:00Z` : `${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number | null; payload?: TrendPoint }>;
  label?: string;
  unit: string;
}

function exactValue(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "Missing";
  if (unit === "£") return `£${Number(value).toLocaleString("en-GB")}`;
  return `${value}${unit}`;
}

function revisionText(point: TrendPoint) {
  if (point.revision) return point.revision;
  if (point.value === null || point.value === undefined || point.status === "missing")
    return "Not applicable";
  return "Latest revised value";
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2.5 shadow-xl border text-sm"
      style={{
        background: "var(--dash-tooltip-bg)",
        borderColor: "var(--dash-tooltip-bdr)",
      }}
    >
      <p className="text-xs mb-1" style={{ color: "var(--dash-text-4)" }}>
        {payload[0].payload?.reference
          ? `${formatPeriod(payload[0].payload.reference.start_month)} to ${formatPeriod(payload[0].payload.reference.end_month)}`
          : formatPeriod(label)}
      </p>
      <p
        className="font-bold"
        style={{
          color: "var(--dash-text-1)",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {exactValue(payload[0].value, unit)}
      </p>
    </div>
  );
}

export function HistoricalTrendCard({
  title,
  label,
  unit = "%",
  unitDescription = unit === "£" ? "pounds per month" : unit === "%" ? "percent" : unit,
  color = "#60a5fa",
  data,
  referenceLine,
  curve = "linear",
}: HistoricalTrendCardProps) {
  const [selectedRange, setSelectedRange] = useState(DEFAULT_CHART_RANGE);
  const noteId = useId();
  const selection = useMemo(
    () => filterChartRange(data, selectedRange),
    [data, selectedRange],
  );
  const visibleData = selection.points;

  const values = visibleData
    .map((p) => p.value)
    .filter((v): v is number => typeof v === "number");
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;
  const padding = (maxVal - minVal) * 0.2 || 0.5;
  const yMin = Math.floor((minVal - padding) * 10) / 10;
  const yMax = Math.ceil((maxVal + padding) * 10) / 10;

  const gradId = `grad-${color.replace("#", "")}`;

  function onRangeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = moveChartRange(selectedRange, event.key);
    if (!next) return;
    event.preventDefault();
    setSelectedRange(next);
    const button = event.currentTarget.querySelector<HTMLButtonElement>(
      `[data-range="${next}"]`,
    );
    button?.focus();
  }

  return (
    <div
      className="rounded-xl border overflow-hidden transition-colors duration-200"
      style={{
        background: "var(--dash-card)",
        borderColor: "var(--dash-border)",
      }}
    >
      <div
        className="px-5 pt-5 pb-3 border-b"
        style={{ borderColor: "var(--dash-border)" }}
      >
        <div className="fs-chart-toolbar mb-1.5">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--dash-text-4)" }}
          >
            {label}
          </span>
          <div
            className="fs-range"
            role="radiogroup"
            aria-label={`Historical range for ${label}`}
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
        <p
          className="text-sm font-medium leading-snug"
          style={{ color: "var(--dash-text-2)" }}
        >
          {title}
        </p>
      </div>

      <div className="px-3 py-4">
        {selection.notice && (
          <p className="fs-chart-range-note" id={noteId} role="status">
            {selection.notice}
          </p>
        )}
        {visibleData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm" style={{ color: "var(--dash-text-4)" }}>
                No historical data available yet
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--dash-text-4)", opacity: 0.6 }}
              >
                Data will appear here as it's collected
              </p>
            </div>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={visibleData}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--dash-chart-grid)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatAxisDate}
                  fontSize={10}
                  tick={{ fill: "var(--dash-text-4)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[yMin, yMax]}
                  fontSize={10}
                  tick={{
                    fill: "var(--dash-text-4)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => unit === "£" ? `£${Number(v).toLocaleString("en-GB")}` : `${v}${unit}`}
                  width={54}
                />
                <Tooltip
                  content={<CustomTooltip unit={unit} />}
                  cursor={{ stroke: "var(--dash-border)", strokeWidth: 1 }}
                />
                {referenceLine && (
                  <ReferenceLine
                    y={referenceLine.value}
                    stroke="var(--dash-text-4)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: referenceLine.label,
                      position: "insideTopRight",
                      fontSize: 9,
                      fill: "var(--dash-text-4)",
                      dy: -4,
                    }}
                  />
                )}
                <Area
                  type={curve}
                  connectNulls={false}
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                  isAnimationActive={false}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {visibleData.length > 0 && (
          <details className="fs-chart-values">
            <summary>Exact values ({visibleData.length})</summary>
            <div className="fs-chart-values-scroll">
              <table>
                <caption>
                  {title}. Exact values in {unitDescription}.
                  Latest revised values for each reference period.
                  {selection.notice ? ` ${selection.notice}` : ""}
                </caption>
                <thead>
                  <tr>
                  <th scope="col">Reference period</th>
                    <th scope="col">Value</th>
                    <th scope="col">Revision</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((point) => {
                    const period = point.period ?? point.date ?? "";
                    return (
                      <tr key={period}>
                        <td>{point.reference
                          ? `${formatPeriod(point.reference.start_month)} to ${formatPeriod(point.reference.end_month)}`
                          : formatPeriod(period)}</td>
                        <td>{exactValue(point.value, unit)}</td>
                        <td>{revisionText(point)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
