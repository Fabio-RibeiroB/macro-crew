/**
 * Chart annotations that come only from the verified snapshot: when the data was
 * last updated and which periods have no official figure. Nothing is invented:
 * without a usable date there is no label, and a missing value stays absent.
 */
import { formatPeriod } from "./verified.mjs";

const SHORT_DATE = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
};

/**
 * Prefer the official release date (`source_published_date`); fall back to the
 * moment FinStats retrieved the download (`retrieved_at`). The last-successful-check
 * time is deliberately not used: a check that finds nothing new is not an update.
 */
export function chartUpdated(metric) {
  const published = metric?.source_published_date;
  if (typeof published === "string" && /^\d{4}-\d{2}-\d{2}$/.test(published)) {
    const date = new Date(`${published}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === published) {
      return {
        kind: "published",
        date: published,
        label: `Updated ${new Intl.DateTimeFormat("en-GB", SHORT_DATE).format(date)}`,
      };
    }
  }
  const retrieved = metric?.retrieved_at;
  if (typeof retrieved === "string") {
    const date = new Date(retrieved);
    if (!Number.isNaN(date.getTime())) {
      const day = new Intl.DateTimeFormat("en-GB", {
        ...SHORT_DATE,
        timeZone: "Europe/London",
      }).format(date);
      return {
        kind: "retrieved",
        date: retrieved,
        label: `Retrieved ${day}`,
      };
    }
  }
  return null;
}

const keyOf = (point) => point?.date ?? point?.period ?? "";
const isMissing = (point) => typeof point?.value !== "number";

/**
 * Runs of consecutive missing values in a date-ordered series. `before` and
 * `after` are the neighbouring observed points, used to shade the break.
 */
export function gapSpans(points) {
  const spans = [];
  if (!Array.isArray(points)) return spans;
  for (let i = 0; i < points.length; i++) {
    if (!isMissing(points[i])) continue;
    let end = i;
    while (end + 1 < points.length && isMissing(points[end + 1])) end++;
    spans.push({
      start: keyOf(points[i]),
      end: keyOf(points[end]),
      before: i > 0 ? keyOf(points[i - 1]) : null,
      after: end + 1 < points.length ? keyOf(points[end + 1]) : null,
      count: end - i + 1,
    });
    i = end;
  }
  return spans;
}

/** Plain-text list of the gaps, shared by the visible note and the chart's accessible name. */
export function describeGaps(spans, limit = 3) {
  const text = (span) =>
    span.start === span.end
      ? formatPeriod(span.start)
      : `${formatPeriod(span.start)} to ${formatPeriod(span.end)}`;
  const listed = spans.slice(0, limit).map(text).join("; ");
  const more = spans.length - limit;
  return more > 0 ? `${listed}; and ${more} more` : listed;
}

/**
 * The Bank of England's 2% inflation target, drawn as context on the CPI and CPIH
 * charts only. The target is set for CPI, so the CPIH label and text say so rather
 * than implying CPIH has a target. It is a constant, never derived from the data.
 */
export function inflationTargetLine(kind) {
  if (kind === "cpi") {
    return {
      value: 2,
      label: "2% target",
      description: "Dashed line: Bank of England 2% inflation target (CPI).",
    };
  }
  if (kind === "cpih") {
    return {
      value: 2,
      label: "2% target (set for CPI)",
      description:
        "Dashed line: Bank of England 2% inflation target, which is set for CPI, not CPIH. Shown for context.",
    };
  }
  return undefined;
}
