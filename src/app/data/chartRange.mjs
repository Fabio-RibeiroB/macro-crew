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
