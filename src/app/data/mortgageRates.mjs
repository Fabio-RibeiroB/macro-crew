/**
 * Housing "Mortgage rates": Bank of England quoted rates for new fixed-rate mortgages at
 * 75% loan-to-value (monthly), with Bank Rate for context. Pure helpers, no rendering.
 * Everything is read from the verified snapshot. An absent or unavailable member stays
 * absent: it is never replaced by zero and the section hides when neither rate has a
 * verified reading.
 */
import { NOT_AVAILABLE, changeDirection, decimalDifference, monthLabel } from "./overview.mjs";
import { chartPoints, previousReading } from "./verified.mjs";

/** The wording the owner asked for; shown above every mortgage figure and chart. */
export const MORTGAGE_BASIS = "Bank of England quoted rates, 75% loan-to-value, new mortgages";

export const MORTGAGE_RATES = [
  { key: "mortgage_2y_fixed_75", name: "2-year fixed", short: "2-year fixed rate" },
  { key: "mortgage_5y_fixed_75", name: "5-year fixed", short: "5-year fixed rate" },
];

const MINUS = "−";
const percent = (value) => `${String(value).replace(/^-/, MINUS)}%`;
const na = (text = NOT_AVAILABLE) => ({ text, missing: true, direction: null });

/** Mortgage members that carry a verified latest reading, in display order. */
export function mortgageMetrics(data) {
  return MORTGAGE_RATES.map((rate) => ({ ...rate, metric: data?.metrics?.[rate.key] }))
    .filter(({ metric }) => metric?.latest && metric.history?.length);
}

/** True when there is anything to show. Absent or unavailable members hide the section. */
export const hasMortgageRates = (data) => mortgageMetrics(data).length > 0;

/**
 * Lines for KeyFigure. The change is against the previous calendar month only
 * (previousReading returns null across a gap), in percentage points.
 */
export function mortgageFigureRow(metric) {
  if (!metric?.latest) {
    return { latest: [na()], previous: [na()], change: [na()], period: [na("No verified reading yet")] };
  }
  const previous = previousReading(metric);
  let change = [na()];
  if (previous) {
    const difference = decimalDifference(metric.latest.value, previous.value);
    const direction = changeDirection(difference);
    change = [direction === "flat" ? { text: "No change", direction } : { text: `${difference} pp`, direction }];
  }
  return {
    latest: [{ text: percent(metric.latest.value) }],
    previous: previous ? [{ text: percent(previous.value) }, { text: monthLabel(previous.period), sub: true }] : [na()],
    change,
    period: [{ text: monthLabel(metric.latest.period) }],
  };
}

/**
 * Bank Rate on the last day of each month it has a figure. Bank Rate is daily; the
 * mortgage series is monthly. This is a month-end reading, not an average, and it is
 * drawn as a step. Months without any Bank Rate observation are simply absent.
 */
export function bankRateMonthEnd(bankRate) {
  const byMonth = new Map();
  for (const point of bankRate?.history ?? []) {
    if (point.value === null || point.value === undefined) continue;
    byMonth.set(String(point.period).slice(0, 7), Number(point.value));
  }
  return byMonth;
}

/**
 * Rows for the combined chart: one per month on the mortgage-rate axis. Missing
 * months (and a missing Bank Rate month) are null, so the line breaks rather than
 * drawing zero or joining across them.
 */
export function mortgageChart(data) {
  const present = mortgageMetrics(data);
  if (!present.length) return null;
  const lines = new Map(present.map(({ key, metric }) => [key, new Map(chartPoints(metric).map((p) => [p.date, p.value]))]));
  const months = [...new Set([...lines.values()].flatMap((line) => [...line.keys()]))].sort();
  const bank = data?.metrics?.bank_rate;
  const bankByMonth = bank?.history?.length ? bankRateMonthEnd(bank) : new Map();
  const series = [
    ...present.map(({ key, name }) => ({ key, name, kind: "rate" })),
    ...(bankByMonth.size ? [{ key: "bank_rate", name: "Bank Rate (end of month)", kind: "bank" }] : []),
  ];
  const rows = months.map((date) => ({
    date,
    ...Object.fromEntries(series.map(({ key }) => [
      key,
      (key === "bank_rate" ? bankByMonth.get(date) : lines.get(key)?.get(date)) ?? null,
    ])),
  }));
  return { series, rows };
}
