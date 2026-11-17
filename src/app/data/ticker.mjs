// Figures ticker items (ADR 0002, decision 3). Pure functions over the same verified
// snapshot as the overview table: values and changes come straight from
// `overviewRows`, so the ticker can never disagree with the table. Missing values
// are skipped, never shown as zero. The MPC item is derived only from the official
// Bank Rate series; no AI text is involved.
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
const ARROWS = { up: "▲", down: "▼", flat: "" };
const TAG_LABELS = { petrol: "Petrol", diesel: "Diesel" };

const labelFor = (row, line) => {
  if (line.tag) return TAG_LABELS[line.tag] ?? line.tag;
  if (row.id === "inflation") return row.kind === "cpi" ? "CPI" : row.kind === "cpih" ? "CPIH" : row.name;
  if (row.id === "energy") return "Energy cap";
  return row.name;
};

/** Change line to display: arrow, unsigned magnitude and the direction used for colour. */
function changeOf(line) {
  if (!line || line.missing || line.sub) return null;
  if (line.dir === "up" || line.dir === "down") {
    return {
      dir: line.dir,
      arrow: ARROWS[line.dir],
      spoken: line.dir,
      text: line.text.replace(/^[+−-]\s*/, "").trim(),
    };
  }
  return { dir: "flat", arrow: "", spoken: "", text: line.text === "No change" ? "no change" : line.text.toLowerCase() };
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** One MPC item from the official Bank Rate series, or null when it cannot be evidenced. */
export function mpcItem(metric, rateText, href = null) {
  if (!metric?.latest || metric.latest.value == null || !rateText) return null;
  const change = lastRateChange(metric);
  if (!change) return null;
  const recent = daysBetween(change.period, metric.latest.period) <= MPC_DECISION_WINDOW_DAYS;
  const date = dayLabel(change.period);
  if (recent) {
    const raised = change.difference > 0;
    return {
      id: "mpc",
      kind: "mpc",
      label: "MPC",
      value: raised ? `raised to ${rateText} (tightening)` : `cut to ${rateText} (loosening)`,
      change: { dir: raised ? "up" : "down", arrow: raised ? ARROWS.up : ARROWS.down, spoken: "", text: "" },
      meta: date,
      href,
    };
  }
  return {
    id: "mpc",
    kind: "mpc",
    label: "MPC",
    value: `held at ${rateText} (on hold)`,
    change: { dir: "flat", arrow: "", spoken: "", text: "" },
    meta: `last change ${date}`,
    href,
  };
}

/** Ticker items in overview order. `hrefs` maps a metric kind to its subject page anchor. */
export function tickerItems(data, hrefs = {}) {
  if (!data?.metrics) return [];
  const items = [];
  for (const row of overviewRows(data)) {
    const changes = row.change.filter((line) => !line.sub);
    row.latest.forEach((line, index) => {
      if (line.missing || line.sub) return;
      items.push({
        id: line.tag ? `${row.id}-${line.tag}` : row.id,
        kind: row.kind,
        label: labelFor(row, line),
        value: line.text,
        change: changeOf(changes[index]),
        meta: null,
        href: hrefs[row.kind] ?? null,
      });
    });
    if (row.id === "bank-rate") {
      const rate = row.latest[0];
      const mpc = mpcItem(data.metrics.bank_rate, rate && !rate.missing ? rate.text : null, hrefs.bank_rate ?? null);
      if (mpc) items.push(mpc);
    }
  }
  return items;
}

/** Plain-text reading of an item, as a screen reader gets it. */
export function itemText(item) {
  const parts = [item.label, item.value];
  if (item.change) parts.push([item.change.spoken, item.change.text].filter(Boolean).join(" "));
  if (item.meta) parts.push(item.meta);
  return parts.filter(Boolean).join(" ");
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
