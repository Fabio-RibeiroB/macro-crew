import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useState } from 'react';

interface TrendPoint { date: string; value: number }
type TrendRange = '1Y' | '3Y' | '5Y';

interface HistoricalTrendCardProps {
  title: string;
  label: string;
  unit?: string;
  color?: string;
  data: TrendPoint[];
  referenceLine?: { value: number; label: string };
}

const RANGE_OPTIONS: TrendRange[] = ['1Y', '3Y', '5Y'];

function subtractYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() - years);
  return next;
}

function formatAxisDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = new Date(label ?? '');
  const formattedDate = isNaN(d.getTime())
    ? label
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div
      className="rounded-lg px-3 py-2.5 shadow-xl border text-sm"
      style={{
        background: 'var(--dash-tooltip-bg)',
        borderColor: 'var(--dash-tooltip-bdr)',
      }}
    >
      <p className="text-xs mb-1" style={{ color: 'var(--dash-text-4)' }}>{formattedDate}</p>
      <p className="font-bold" style={{ color: 'var(--dash-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>
        {payload[0].value}{unit}
      </p>
    </div>
  );
}

export function HistoricalTrendCard({ title, label, unit = '%', color = '#60a5fa', data, referenceLine }: HistoricalTrendCardProps) {
  const [selectedRange, setSelectedRange] = useState<TrendRange>('5Y');

  const latestDate = data.reduce<Date | null>((cur, point) => {
    const d = new Date(point.date);
    if (isNaN(d.getTime())) return cur;
    return !cur || d > cur ? d : cur;
  }, null);

  const visibleData = data.filter((point) => {
    if (!latestDate) return false;
    const d = new Date(point.date);
    if (isNaN(d.getTime())) return false;
    const years = selectedRange === '1Y' ? 1 : selectedRange === '3Y' ? 3 : 5;
    return d >= subtractYears(latestDate, years);
  });

  const values = visibleData.map((p) => p.value);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;
  const padding = (maxVal - minVal) * 0.2 || 0.5;
  const yMin = Math.floor((minVal - padding) * 10) / 10;
  const yMax = Math.ceil((maxVal + padding) * 10) / 10;

  const gradId = `grad-${color.replace('#', '')}`;

  return (
    <div
      className="rounded-xl border overflow-hidden transition-colors duration-200"
      style={{ background: 'var(--dash-card)', borderColor: 'var(--dash-border)' }}
    >
      <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--dash-border)' }}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--dash-text-4)' }}>{label}</span>
          {/* Range toggle — always on same row as label, never wraps */}
          <div
            className="flex items-center rounded-lg overflow-hidden border flex-shrink-0"
            style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-bg)' }}
          >
            {RANGE_OPTIONS.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setSelectedRange(range)}
                className="px-3 py-1.5 text-xs font-medium transition-colors duration-150"
                style={{
                  background: selectedRange === range ? 'var(--dash-border)' : 'transparent',
                  color: selectedRange === range ? 'var(--dash-text-1)' : 'var(--dash-text-4)',
                }}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--dash-text-2)' }}>{title}</p>
      </div>

      <div className="px-3 py-4">
        {visibleData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm" style={{ color: 'var(--dash-text-4)' }}>No historical data available yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--dash-text-4)', opacity: 0.6 }}>Data will appear here as it's collected</p>
            </div>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visibleData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--dash-chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatAxisDate}
                  fontSize={10}
                  tick={{ fill: 'var(--dash-text-4)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[yMin, yMax]}
                  fontSize={10}
                  tick={{ fill: 'var(--dash-text-4)', fontFamily: "'JetBrains Mono', monospace" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}${unit}`}
                  width={54}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: 'var(--dash-border)', strokeWidth: 1 }} />
                {referenceLine && (
                  <ReferenceLine
                    y={referenceLine.value}
                    stroke="var(--dash-text-4)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{ value: referenceLine.label, position: 'insideTopRight', fontSize: 9, fill: 'var(--dash-text-4)', dy: -4 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                  isAnimationActive={true}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
