// News-style crawl items (ADR 0003, narrowed by ADR 0005). Pure functions over the same
// verified snapshot as the overview table: figures and changes come straight from
// `overviewRows`, so the crawl can never disagree with the table. Each figure reads as a
// short plain-English phrase ("Inflation: 3.5%, up from 3.1%"). Missing values are
// skipped, never shown as zero. The crawl carries official figures only: no AI text and
// no MPC item (the overview already shows the MPC line). Also here: the pure helpers for
// the collapsed summary, the speed setting and the remembered per-device settings.
import { overviewRows } from "./overview.mjs";

export const TICKER_PX_PER_SECOND = 50;
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
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

/**
 * Crawl items: the overview figures in order, numbers only. `hrefs` maps a metric kind to
 * its subject page anchor. Without figures there is nothing to crawl.
 */
export function tickerItems(data, hrefs = {}) {
  if (!data?.metrics) return [];
  const items = [];
  for (const row of overviewRows(data)) {
    const changes = row.change.filter((line) => !line.sub);
    const previous = row.previous.filter((line) => !line.sub);
    row.latest.forEach((line, index) => {
      if (line.missing || line.sub) return;
      items.push({
        id: line.tag ? `${row.id}-${line.tag}` : row.id,
        kind: row.kind,
        label: labelFor(row, line),
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
  const head = `${item.label}: ${item.value}`;
  return item.change ? `${head}, ${item.change.text}` : head;
}

/** "running" scrolls, "paused" holds position, "static" is a plain scrollable strip. */
export function motionState({ reducedMotion = false, paused = false } = {}) {
  if (reducedMotion) return "static";
  return paused ? "paused" : "running";
}

export const SPEEDS = ["slow", "normal", "fast"];
export const SPEED_FACTORS = { slow: 0.5, normal: 1, fast: 2 };
export const SPEED_LABELS = { slow: "0.5×", normal: "1×", fast: "2×" };
export const DEFAULT_CRAWL_SETTINGS = Object.freeze({ collapsed: false, paused: false, speed: "normal" });
export const CRAWL_STORAGE_KEY = "finstats.crawl";

/** Slow, then Normal, then Fast, then back to Slow. Anything unknown counts as Normal. */
export function nextSpeed(speed) {
  const index = SPEEDS.indexOf(speed);
  return SPEEDS[((index === -1 ? 1 : index) + 1) % SPEEDS.length];
}

/**
 * Seconds for one full loop. Normal reads at TICKER_PX_PER_SECOND and never loops faster
 * than 20 s; Slow takes twice as long and Fast half as long.
 */
export function tickerDuration(listWidthPx, speed = "normal", pxPerSecond = TICKER_PX_PER_SECOND) {
  const factor = SPEED_FACTORS[speed] ?? 1;
  const normal = !Number.isFinite(listWidthPx) || listWidthPx <= 0 ? 90 : Math.max(20, Math.round(listWidthPx / pxPerSecond));
  return Math.round(normal / factor);
}

/**
 * The two headline figures for the collapsed bar, taken from the crawl's own items
 * (never invented): Inflation then Bank Rate, skipping whichever is missing.
 */
export function collapsedFigures(items) {
  const list = Array.isArray(items) ? items : [];
  return ["inflation", "bank-rate"]
    .map((id) => list.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => ({ id: item.id, label: item.label, value: item.value }));
}

/** "Inflation 3.5% · Bank Rate 4.00%", or "" when neither is available. */
export function collapsedSummary(items) {
  return collapsedFigures(items)
    .map((figure) => `${figure.label} ${figure.value}`)
    .join(" · ");
}

/**
 * Settings read back from storage text. Missing, unparseable or wrongly typed parts fall
 * back to the defaults one by one, so bad storage never breaks the strip.
 */
export function parseCrawlSettings(raw) {
  const settings = { ...DEFAULT_CRAWL_SETTINGS };
  let parsed = null;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return settings;
  if (typeof parsed.collapsed === "boolean") settings.collapsed = parsed.collapsed;
  if (typeof parsed.paused === "boolean") settings.paused = parsed.paused;
  if (SPEEDS.includes(parsed.speed)) settings.speed = parsed.speed;
  return settings;
}

/** Storage text for settings: only the three known fields, each validated. */
export function serializeCrawlSettings(settings) {
  const { collapsed, paused, speed } = parseCrawlSettings(JSON.stringify(settings));
  return JSON.stringify({ collapsed, paused, speed });
}
