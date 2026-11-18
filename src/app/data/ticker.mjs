// News-style crawl items (ADR 0003, superseding ADR 0002 decision 3). Pure functions over
// the same verified snapshot as the overview table: figures and changes come straight
// from `overviewRows`, so the crawl can never disagree with the table. Each figure reads
// as a short plain-English phrase ("Inflation: 3.5%, up from 3.1%"). Missing values are
// skipped, never shown as zero. The first item is "MPC:" with the one-line AI headline
// (`mpcLine`), tagged AI and never a number source; without a report it falls back to
// factual wording from the official Bank Rate series.
import { MPC_CRAWL_MAX, mpcLine } from "./aiSummary.mjs";
import { dayLabel, overviewRows } from "./overview.mjs";
import { lastRateChange } from "./verified.mjs";

export const TICKER_PX_PER_SECOND = 50;
/**
 * A rate change this recent (days before the latest reading) is reported as the latest
 * decision. MPC meetings are at least 42 days apart (2026 schedule), so a shorter window
 * can never report a later hold as "raised" or "cut".
 */
export const MPC_DECISION_WINDOW_DAYS = 35;
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const AI_SUMMARY_HREF = "/economy#ai-summary";
const TAG_LABELS = { petrol: "Petrol", diesel: "Diesel" };
const LABELS = {
  inflation: { cpi: "Inflation", cpih: "Inflation (CPIH)" },
  "bank-rate": "Bank Rate",
  wages: "Pay growth",
  unemployment: "Unemployment",
  rent: "Rent growth",
  "house-prices": "House prices",
  energy: "Energy price cap",
  gdp: "GDP growth",
};

const labelFor = (row, line) => {
  if (line.tag) return TAG_LABELS[line.tag] ?? line.tag;
  const label = LABELS[row.id];
  return (typeof label === "object" ? label[row.kind] : label) ?? row.name;
};

/** Spoken-style value: "£1,723/year" becomes "£1,723 a year", "174.57p" "174.57p a litre". */
function valueOf(row, line) {
  if (line.tag) return `${line.text} a litre`;
  return line.text.replace(/\/year$/, " a year");
}

/**
 * Change phrase and its direction. Percentage-point changes name the earlier value
 * ("up from 3.1%"); money and pence changes give the size ("up £891"). No comparable
 * change gives null, so the item shows just the figure.
 */
function changeOf(line, previous) {
  if (!line || line.missing || line.sub) return null;
  if (line.direction === "flat") return { dir: "flat", text: "unchanged" };
  if (line.direction !== "up" && line.direction !== "down") return null;
  const size = line.text.replace(/^[+−-]\s*/, "").trim().replace(/\/year$/, " a year");
  const phrase = line.direction;
  if (/ pp$/.test(line.text)) {
    return {
      dir: phrase,
      text: previous && !previous.missing ? `${phrase} from ${previous.text}` : `${phrase} ${size.replace(/ pp$/, " points")}`,
    };
  }
  return { dir: phrase, text: `${phrase} ${size}` };
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const shortDay = (period) => dayLabel(period).replace(/ \d{4}$/, "");

/**
 * The AI one-line MPC headline, tagged AI and linked to the full AI summary. The crawl
 * only shows whole sentences; one too long to show whole gives null (factual fallback).
 */
export function mpcAiItem(reports) {
  const line = mpcLine(reports, { max: MPC_CRAWL_MAX, whole: true });
  if (!line) return null;
  return { id: "mpc", kind: "mpc", label: "MPC", ai: true, value: line.text, change: null, href: AI_SUMMARY_HREF };
}

/** Factual MPC item from the official Bank Rate series, or null when it cannot be evidenced. */
export function mpcItem(metric, rateText, href = null) {
  if (!metric?.latest || metric.latest.value == null || !rateText) return null;
  const change = lastRateChange(metric);
  if (!change) return null;
  const recent = daysBetween(change.period, metric.latest.period) <= MPC_DECISION_WINDOW_DAYS;
  const value = recent
    ? `${change.difference > 0 ? "raised" : "cut"} Bank Rate to ${rateText} on ${shortDay(change.period)}`
    : `held Bank Rate at ${rateText}`;
  return { id: "mpc", kind: "mpc", label: "MPC", ai: false, value, change: null, href };
}

/**
 * Crawl items: the MPC item first, then the overview figures in order. `hrefs` maps a
 * metric kind to its subject page anchor. Without figures there is nothing to crawl.
 */
export function tickerItems(data, hrefs = {}, reports = null) {
  if (!data?.metrics) return [];
  const rows = overviewRows(data);
  const bankRate = rows.find((row) => row.id === "bank-rate")?.latest[0];
  const mpc =
    mpcAiItem(reports) ??
    mpcItem(data.metrics.bank_rate, bankRate && !bankRate.missing ? bankRate.text : null, hrefs.bank_rate ?? null);
  const items = mpc ? [mpc] : [];
  for (const row of rows) {
    const changes = row.change.filter((line) => !line.sub);
    const previous = row.previous.filter((line) => !line.sub);
    row.latest.forEach((line, index) => {
      if (line.missing || line.sub) return;
      items.push({
        id: line.tag ? `${row.id}-${line.tag}` : row.id,
        kind: row.kind,
        label: labelFor(row, line),
        ai: false,
        value: valueOf(row, line),
        change: changeOf(changes[index], previous[index]),
        href: hrefs[row.kind] ?? null,
      });
    });
  }
  return items;
}

/** Plain-text reading of an item, as a screen reader gets it. */
export function itemText(item) {
  const head = `${item.label}: ${item.ai ? "AI " : ""}${item.value}`;
  return item.change ? `${head}, ${item.change.text}` : head;
}

/** "running" scrolls, "paused" holds position, "static" is a plain scrollable strip. */
export function motionState({ reducedMotion = false, paused = false } = {}) {
  if (reducedMotion) return "static";
  return paused ? "paused" : "running";
}

/** Seconds for one full loop at the reading speed; never faster than 20 s. */
export function tickerDuration(listWidthPx, pxPerSecond = TICKER_PX_PER_SECOND) {
  if (!Number.isFinite(listWidthPx) || listWidthPx <= 0) return 90;
  return Math.max(20, Math.round(listWidthPx / pxPerSecond));
}
