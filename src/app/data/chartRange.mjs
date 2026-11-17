/** Filter chart points from the latest observation. Does not invent dates or fill gaps. */

export const CHART_RANGES = [
  { id: "1Y", label: "1Y", name: "1 year", years: 1 },
  { id: "5Y", label: "5Y", name: "5 years", years: 5 },
  { id: "10Y", label: "10Y", name: "10 years", years: 10 },
  { id: "All", label: "All", name: "All available history", years: null },
];

export const DEFAULT_CHART_RANGE = "5Y";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const rangeById = new Map(CHART_RANGES.map((range) => [range.id, range]));

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parsePeriod(value) {
  if (typeof value !== "string") return null;
  const daily = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (daily) {
    const year = Number(daily[1]);
    const month = Number(daily[2]);
    const day = Number(daily[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
      return null;
    return { year, month, day, precision: "day" };
  }
  const monthly = /^(\d{4})-(\d{2})$/.exec(value);
  if (!monthly) return null;
  const year = Number(monthly[1]);
  const month = Number(monthly[2]);
  if (month < 1 || month > 12) return null;
  return { year, month, day: null, precision: "month" };
}

function formatKey(period) {
  const month = String(period.month).padStart(2, "0");
  if (period.precision === "month") return `${period.year}-${month}`;
  return `${period.year}-${month}-${String(period.day).padStart(2, "0")}`;
}

function subtractYears(period, years) {
  const year = period.year - years;
  if (period.precision === "month") return { ...period, year };
  return {
    ...period,
    year,
    day: Math.min(period.day, daysInMonth(year, period.month)),
  };
}

function humanPeriod(key) {
  const period = parsePeriod(key);
  const month = MONTHS[period.month - 1];
  if (period.precision === "month") return `${month} ${period.year}`;
  return `${period.day} ${month} ${period.year}`;
}

function pointKey(point) {
  if (!point || typeof point !== "object") return null;
  return parsePeriod(point.date ?? point.period);
}

function copyPoint(point) {
  const copy = { ...point };
  if (copy.value === undefined) copy.value = null;
  return copy;
}

function emptySelection(range) {
  return {
    range,
    points: [],
    latest: null,
    earliest: null,
    requestedStart: null,
    shorterThanRequested: false,
    notice: null,
  };
}

export function moveChartRange(current, key) {
  const index = CHART_RANGES.findIndex((range) => range.id === current);
  if (index < 0) return null;
  const last = CHART_RANGES.length - 1;
  let next = index;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      next = index === last ? 0 : index + 1;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      next = index === 0 ? last : index - 1;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = last;
      break;
    default:
      return null;
  }
  return CHART_RANGES[next].id;
}

export function filterChartRange(points, range = DEFAULT_CHART_RANGE) {
  const selected = rangeById.get(range);
  if (!selected) throw new Error(`Unknown chart range: ${range}`);
  const source = Array.isArray(points) ? points : [];
  const stamped = [];
  for (const point of source) {
    const parsed = pointKey(point);
    if (!parsed) continue;
    stamped.push({ point, key: formatKey(parsed), parsed });
  }
  stamped.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!stamped.length) return emptySelection(range);

  const latest = stamped[stamped.length - 1];
  const first = stamped[0];
  const requested =
    selected.years === null ? null : subtractYears(latest.parsed, selected.years);
  const requestedStart = requested ? formatKey(requested) : null;
  const visible =
    requestedStart === null
      ? stamped
      : stamped.filter((item) => item.key >= requestedStart);
  const earliest = visible[0];
  const shorterThanRequested =
    requestedStart !== null && first.key > requestedStart;
  const span =
    earliest.key === latest.key
      ? humanPeriod(latest.key)
      : `${humanPeriod(earliest.key)} to ${humanPeriod(latest.key)}`;
  return {
    range,
    points: visible.map((item) => copyPoint(item.point)),
    latest: latest.key,
    earliest: earliest.key,
    requestedStart,
    shorterThanRequested,
    notice: shorterThanRequested
      ? `Showing ${span}. Less history is available than ${selected.name}.`
      : null,
  };
}

/**
 * Reduce long series for drawing only; the exact-values table keeps every point.
 * Keeps first/last points, every gap (null) and its neighbours, and every point
 * where the value changes, so step series such as Bank Rate lose nothing visible.
 * If still above `limit`, splits the remaining points into buckets and keeps each
 * bucket's minimum and maximum, so short peaks and troughs stay in the drawn line.
 */
export function simplifyForChart(points, limit = 1500) {
  if (!Array.isArray(points) || points.length <= limit) return points;
  const isNum = (p) => typeof p?.value === "number";
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1];
    if (!isNum(cur) || !isNum(prev) || !isNum(next) || cur.value !== prev.value || cur.value !== next.value) keep[i] = 1;
  }
  let kept = points.filter((_, i) => keep[i]);
  if (kept.length <= limit) return kept;
  const must = (p, i) => i === 0 || i === kept.length - 1 || !isNum(p)
    || !isNum(kept[i - 1]) || !isNum(kept[i + 1]);
  const optionalIdx = [];
  kept.forEach((p, i) => { if (!must(p, i)) optionalIdx.push(i); });
  const budget = Math.max(2, limit - (kept.length - optionalIdx.length));
  const buckets = Math.max(1, Math.floor(budget / 2));
  const size = Math.ceil(optionalIdx.length / buckets);
  const pick = new Uint8Array(kept.length);
  kept.forEach((p, i) => { if (must(p, i)) pick[i] = 1; });
  // Each bucket keeps its lowest and highest point, so a one-point spike or dip survives.
  for (let start = 0; start < optionalIdx.length; start += size) {
    let lo = optionalIdx[start], hi = lo;
    for (const i of optionalIdx.slice(start, start + size)) {
      if (kept[i].value < kept[lo].value) lo = i;
      if (kept[i].value > kept[hi].value) hi = i;
    }
    pick[lo] = 1; pick[hi] = 1;
  }
  return kept.filter((_, i) => pick[i]);
}

const NICE_MULTIPLIERS = [1, 2, 2.5, 5];
const MAX_TICKS = 6;

const clean = (n) => Number.parseFloat(n.toPrecision(12));

function niceAxis(lo, hi, forceZeroMin) {
  const range = hi - lo;
  let exponent = Math.floor(Math.log10(range / 10));
  for (let guard = 0; guard < 40; guard++, exponent++) {
    for (const mult of NICE_MULTIPLIERS) {
      const step = clean(mult * 10 ** exponent);
      const first = forceZeroMin ? 0 : Math.floor(lo / step + 1e-9);
      const last = Math.ceil(hi / step - 1e-9);
      if (last - first + 1 > MAX_TICKS) continue;
      const ticks = [];
      for (let k = first; k <= last; k++) ticks.push(clean(k * step));
      return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
    }
  }
  return { domain: [lo, hi], ticks: [lo, hi] };
}

/**
 * Y-axis domain and tick values on readable steps (1, 2, 2.5 or 5 x 10^n), with
 * about 20% headroom and at most six ticks. Padding never pushes a series that
 * is all zero or above below zero, so a rate that was never negative is not
 * drawn on an axis that suggests it could have been. `include` lists extra values
 * (a reference line) the axis must also span; they never alter the plotted data.
 */
export function chartYAxis(values, include = []) {
  const all = [...values, ...include.filter((v) => Number.isFinite(v))];
  const minVal = all.length ? Math.min(...all) : 0;
  const maxVal = all.length ? Math.max(...all) : 1;
  const padding = (maxVal - minVal) * 0.2 || 0.5;
  let lo = minVal - padding;
  const forceZeroMin = minVal >= 0 && lo < 0;
  if (forceZeroMin) lo = 0;
  return niceAxis(lo, maxVal + padding, forceZeroMin);
}

export function chartYDomain(values) {
  return chartYAxis(values).domain;
}
