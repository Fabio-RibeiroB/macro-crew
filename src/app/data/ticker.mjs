// News-style crawl items (ADR 0003, narrowed by ADR 0005 and its 19 Nov amendment). Pure
// functions over the same verified snapshot as the overview table: figures and changes come
// straight from `overviewRows`, so the crawl can never disagree with the table. Each figure
// reads as a short phrase that says what it compares and when it is from:
// "Inflation (yearly, Oct): 3.6% ↑ (prev. 3.5%)". Missing values are skipped, never shown
// as zero, and a period that is not in the data is left out, never guessed. The crawl
// carries official figures only: no AI text and no MPC item (the overview already shows
// the MPC line). Also here: the pure helpers for the collapsed summary, the speed setting
// and the remembered per-device settings.
import { overviewRows } from "./overview.mjs";
import { referenceWindow } from "./verified.mjs";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Each period reads as { short, spoken } and always names its year, so an old reading or
// a window across New Year never reads as current: "Oct 2026" / "October 2026",
// "Jul–Sep 2026" / "July to September 2026", "Nov 2025–Jan 2026".
const monthOf = (value) => {
  const found = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(value ?? ""));
  const index = found ? Number(found[2]) - 1 : -1;
  return index >= 0 && index < 12 ? { year: found[1], index } : null;
};
const monthPeriod = (value) => {
  const month = monthOf(value);
  return month === null
    ? null
    : { short: `${MONTHS[month.index]} ${month.year}`, spoken: `${MONTHS_LONG[month.index]} ${month.year}` };
};
const windowPeriod = (start, end) => {
  const from = monthOf(start);
  const to = monthOf(end);
  if (from === null || to === null) return null;
  if (from.year === to.year && from.index === to.index) return monthPeriod(end);
  if (from.year === to.year) {
    return {
      short: `${MONTHS[from.index]}–${MONTHS[to.index]} ${to.year}`,
      spoken: `${MONTHS_LONG[from.index]} to ${MONTHS_LONG[to.index]} ${to.year}`,
    };
  }
  return {
    short: `${MONTHS[from.index]} ${from.year}–${MONTHS[to.index]} ${to.year}`,
    spoken: `${MONTHS_LONG[from.index]} ${from.year} to ${MONTHS_LONG[to.index]} ${to.year}`,
  };
};
const weekPeriod = (value) => {
  const found = /^\d{4}-\d{2}-(\d{2})$/.exec(String(value ?? ""));
  const month = found ? monthOf(value) : null;
  if (month === null) return null;
  const day = Number(found[1]);
  return {
    short: `week of ${day} ${MONTHS[month.index]} ${month.year}`,
    spoken: `week of ${day} ${MONTHS_LONG[month.index]} ${month.year}`,
  };
};
function rollingPeriod(metric) {
  const window = referenceWindow(metric?.latest);
  return window ? windowPeriod(window.start_month, window.end_month) : null;
}

// The one place that says what each crawl figure compares and which period it names.
// basis: "yearly" for a 12-month change, "monthly" for a month-on-month change, null for a
// level (a level carries only its period, never a basis word). It matches each metric's
// registered `comparison` (year_on_year, month_on_month, level); a test enforces that.
// period: read from the metric's own reference (a rolling window, the cap's effective
// dates) or its period; no usable period gives null and the context shows without it.
// Bank Rate is the current rate, so it has none.
export const CRAWL_CONTEXT = {
  inflation: { basis: "yearly", period: (metric) => monthPeriod(metric?.latest?.period) },
  "bank-rate": { basis: null, period: () => null },
  wages: { basis: "yearly", period: rollingPeriod },
  unemployment: { basis: null, period: rollingPeriod },
  rent: { basis: "yearly", period: (metric) => monthPeriod(metric?.latest?.period) },
  "house-prices": { basis: null, period: (metric) => monthPeriod(metric?.latest?.period) },
  energy: {
    basis: null,
    period: (metric) => {
      const reference = metric?.latest?.reference;
      return windowPeriod(reference?.effective_start, reference?.effective_end);
    },
  },
  fuel: { basis: null, period: (metric) => weekPeriod(metric?.latest?.period) },
  gdp: { basis: "monthly", period: (metric) => monthPeriod(metric?.latest?.period) },
};

/** The verified metric behind one crawl line (fuel has one metric per tag). */
const metricFor = (row, line, metrics) => (line.tag ? metrics[`${line.tag}_price`] : metrics[row.kind]);

/** Basis, period and their visible "(yearly, Oct)" and spoken "yearly, October" forms. */
function contextOf(rowId, metric) {
  const entry = CRAWL_CONTEXT[rowId];
  const basis = entry?.basis ?? null;
  const period = entry?.period(metric) ?? null;
  const visible = [basis, period?.short].filter(Boolean);
  const spoken = [basis, period?.spoken].filter(Boolean);
  return {
    basis,
    period: period?.short ?? null,
    context: visible.length ? `(${visible.join(", ")})` : null,
    spokenContext: spoken.length ? spoken.join(", ") : null,
  };
}

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

const ARROWS = { up: "↑", down: "↓", flat: "→" };

/**
 * Direction and the comparison behind it. Direction is an arrow (never colour alone) and
 * a spoken word. The earlier value is named when the verified history has one
 * ("(prev. 3.5%)", spoken "up from 3.5%"); only when it does not does the item give the
 * size of the move ("£891", "0.2 points"), never an invented earlier value. No comparable
 * change gives null, so the item shows just the figure.
 */
export function changeOf(line, previous) {
  if (!line || line.missing || line.sub) return null;
  const dir = line.direction;
  if (dir !== "up" && dir !== "down" && dir !== "flat") return null;
  const arrow = ARROWS[dir];
  const before = previous && !previous.missing ? previous.text.replace(/\/year$/, " a year") : null;
  if (before) {
    return { dir, arrow, detail: `(prev. ${before})`, spoken: dir === "flat" ? "unchanged" : `${dir} from ${before}` };
  }
  if (dir === "flat") return { dir, arrow, detail: null, spoken: "unchanged" };
  const size = line.text.replace(/^[+−-]\s*/, "").trim().replace(/\/year$/, " a year").replace(/ pp$/, " points");
  return { dir, arrow, detail: size, spoken: `${dir} ${size}` };
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
        ...contextOf(row.id, metricFor(row, line, data.metrics)),
        value: valueOf(row, line),
        change: changeOf(changes[index], previous[index]),
        href: hrefs[row.kind] ?? null,
      });
    });
  }
  return items;
}

/** Visible plain text of an item: "Inflation (yearly, Oct): 3.6% ↑ (prev. 3.5%)". */
export function itemText(item) {
  const head = `${item.label}${item.context ? ` ${item.context}` : ""}: ${item.value}`;
  if (!item.change) return head;
  return `${head} ${item.change.arrow}${item.change.detail ? ` ${item.change.detail}` : ""}`;
}

/**
 * What a screen reader gets in place of the visible symbols and abbreviations:
 * "Inflation, yearly, October: 3.6%, up from 3.5%".
 */
export function spokenText(item) {
  const head = `${item.label}${item.spokenContext ? `, ${item.spokenContext}` : ""}: ${item.value}`;
  return item.change ? `${head}, ${item.change.spoken}` : head;
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
