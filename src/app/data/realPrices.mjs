/**
 * House prices after inflation: a FinStats calculation, not an official statistic.
 *
 *   real price(month) = nominal price(month) x CPI index(base month) / CPI index(month)
 *
 * The base month is the latest month that has a usable value in both series, so
 * the real series ends at the latest nominal figure that can be deflated and is
 * expressed in that month's prices. A month missing (or unusable) in either series
 * is a gap (`null`): nothing is interpolated, carried forward or set to zero.
 * Inputs are the verified history arrays of `house_price_level` and `cpi_index`.
 */

const usable = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const addMonth = (period) => {
  const date = new Date(`${period}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
};

/**
 * @param {{period: string, value: string|number|null}[]} nominal monthly prices
 * @param {{period: string, value: string|number|null}[]} index monthly CPI index
 * @returns {{base: string, points: {date: string, value: number|null}[],
 *            latest: {period: string, value: number}} | null}
 *   null when the two series share no month. Values are whole pounds.
 */
export function realPriceSeries(nominal, index) {
  if (!Array.isArray(nominal) || !Array.isArray(index)) return null;
  const prices = new Map();
  for (const point of nominal) {
    if (/^\d{4}-\d{2}$/.test(point?.period) && usable(point.value) !== null) prices.set(point.period, usable(point.value));
  }
  const indices = new Map();
  for (const point of index) {
    if (/^\d{4}-\d{2}$/.test(point?.period) && usable(point.value) !== null) indices.set(point.period, usable(point.value));
  }
  const common = [...prices.keys()].filter((period) => indices.has(period)).sort();
  if (!common.length) return null;
  const base = common.at(-1);
  const baseIndex = indices.get(base);
  const first = [...prices.keys()].sort()[0];
  const points = [];
  for (let period = first; period <= base; period = addMonth(period)) {
    const price = prices.get(period);
    const cpi = indices.get(period);
    points.push({
      date: period,
      value: price === undefined || cpi === undefined ? null : Math.round((price * baseIndex) / cpi),
    });
  }
  return { base, points, latest: { period: base, value: points.at(-1).value } };
}

/** "2026-08" becomes "August 2026". */
export function baseMonthLabel(period) {
  const date = new Date(`${period}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Chart title that names the calculation, its deflator and the base month. */
export function realPriceTitle(base) {
  return `After inflation (FinStats calculation using ONS CPI, ${baseMonthLabel(base)} prices)`;
}
