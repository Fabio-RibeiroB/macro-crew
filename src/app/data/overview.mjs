// Rows for the overview indicator table (ADR 0001). Pure functions over the verified
// snapshot: every figure is read from the verified reader's metrics, nothing is
// estimated, and a missing value stays "Not available", never zero. Every number
// carries its unit ("4.00%", "£1,234/year", "174.57p", "+0.25 pp").
import {
  freshness,
  lastRateChange,
  previousPublishedWindow,
  previousReading,
  referenceWindow,
} from "./verified.mjs";

export const NOT_AVAILABLE = "Not available";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUS = "−";

export const monthLabel = (period) => {
  const [year, month] = String(period).split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
};
export const dayLabel = (period) => {
  const [year, month, day] = String(period).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
};
/** "Jul to Sep 2026", or "Nov 2025 to Jan 2026" when the window spans a year. */
export function windowLabel(start, end) {
  if (!start || !end) return NOT_AVAILABLE;
  const [startYear, startMonth] = start.split("-");
  const [endYear] = end.split("-");
  return startYear === endYear
    ? `${MONTHS[Number(startMonth) - 1]} to ${monthLabel(end)}`
    : `${monthLabel(start)} to ${monthLabel(end)}`;
}

/** Published decimal digits are kept as supplied; only thousands are grouped. */
function plain(value) {
  const text = String(value).trim();
  const negative = text.startsWith("-") || text.startsWith(MINUS);
  const [whole, fraction] = text.replace(/^[-−+]/, "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? MINUS : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}
const fixed = (value, places) => {
  const [whole, fraction = ""] = String(value).split(".");
  return `${whole}.${fraction.padEnd(places, "0")}`;
};

/** Exact decimal difference of two decimal strings, e.g. "−0.25", "+1234", "0". */
export function decimalDifference(current, previous) {
  const digits = Math.max((current.split(".")[1] ?? "").length, (previous.split(".")[1] ?? "").length);
  const scale = 10n ** BigInt(digits);
  const integer = (value) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const magnitude = BigInt(whole) * scale + BigInt((fraction + "0".repeat(digits)).slice(0, digits) || "0");
    return negative ? -magnitude : magnitude;
  };
  const difference = integer(current) - integer(previous);
  const negative = difference < 0n;
  const absolute = negative ? -difference : difference;
  const whole = absolute / scale;
  const fraction = digits ? (absolute % scale).toString().padStart(digits, "0").replace(/0+$/, "") : "";
  return `${negative ? MINUS : difference > 0n ? "+" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// Unit formats. `value` is a published decimal string.
const UNITS = {
  percent: { value: (v) => `${plain(v)}%`, change: (d) => `${d} pp` },
  signedPercent: {
    value: (v) => (/^[-−]/.test(String(v).trim()) || Number(v) === 0 ? "" : "+") + `${plain(v)}%`,
    change: (d) => `${d} pp`,
  },
  bankRate: { value: (v) => `${plain(fixed(v, 2))}%`, change: (d) => `${d} pp` },
  pounds: { value: (v) => `£${plain(v)}`, change: (d) => poundChange(d, "") },
  poundsPerYear: { value: (v) => `£${plain(v)}/year`, change: (d) => poundChange(d, "/year") },
  poundsPerMonth: { value: (v) => `£${plain(v)}/month` },
  pence: { value: (v) => `${plain(v)}p`, change: (d) => `${d}p` },
};
function poundChange(difference, suffix) {
  const sign = /^[+−]/.test(difference) ? difference[0] : "";
  return `${sign}£${plain(difference.replace(/^[+−]/, ""))}${suffix}`;
}

const na = (text = NOT_AVAILABLE) => ({ text, missing: true });
const sub = (text) => ({ text, sub: true });
const direction = (difference) => (difference.startsWith("+") ? "up" : difference.startsWith(MINUS) ? "down" : "flat");
function changeLine(current, previous, unit) {
  const difference = decimalDifference(String(current), String(previous));
  const dir = direction(difference);
  return dir === "flat" ? { text: "No change", dir } : { text: UNITS[unit].change(difference), dir };
}
const valueLine = (value, unit, extra = {}) => ({ text: UNITS[unit].value(value), ...extra });

// One-line definitions, shown inline under each measure name.
const DEFINITIONS = {
  inflation: "How much prices have risen over the past 12 months (CPI).",
  inflationCpih: "How much prices, including housing costs, have risen over the past 12 months (CPIH).",
  bank_rate: "The Bank of England's main interest rate. It guides loan and savings rates.",
  wages: "Yearly growth in regular pay (Great Britain), before bonuses. Three-month average.",
  unemployment: "Share of active people aged 16 and over who have no job and are looking for one.",
  rent: "Yearly change in private rents.",
  house_prices: "The average price paid for a home.",
  energy: "Ofgem's price cap for a typical Direct Debit home in Great Britain. It caps rates, not bills.",
  fuel: "Average pump prices in pence per litre.",
  gdp: "How much the economy's output changed compared with the previous month.",
};

const statusOf = (metric) => {
  if (!metric?.latest) return null;
  const status = freshness(metric);
  return status.kind === "ok" ? null : status.label;
};
const missingRow = (base) => ({
  ...base,
  latest: [na()],
  previous: [na()],
  change: [na()],
  period: [na("No verified reading yet")],
  warnings: [],
});

/** The prior value and period when the history proves an adjacent comparable reading. */
function monthlyRow(base, metric, unit) {
  if (!metric?.latest) return missingRow(base);
  const previous = previousReading(metric);
  return {
    ...base,
    latest: [valueLine(metric.latest.value, unit)],
    previous: previous ? [valueLine(previous.value, unit), sub(monthLabel(previous.period))] : [na()],
    change: previous ? [changeLine(metric.latest.value, previous.value, unit)] : [na()],
    period: [{ text: monthLabel(metric.latest.period) }],
    warnings: [statusOf(metric)].filter(Boolean),
  };
}

function rollingRow(base, metric) {
  if (!metric?.latest) return missingRow(base);
  const previous = previousPublishedWindow(metric);
  const current = referenceWindow(metric.latest);
  const earlier = referenceWindow(previous);
  return {
    ...base,
    latest: [valueLine(metric.latest.value, "percent")],
    previous: previous
      ? [valueLine(previous.value, "percent"), sub(earlier ? `${windowLabel(earlier.start_month, earlier.end_month)}` : monthLabel(previous.period))]
      : [na()],
    change: previous ? [changeLine(metric.latest.value, previous.value, "percent")] : [na()],
    period: [{ text: current ? windowLabel(current.start_month, current.end_month) : monthLabel(metric.latest.period) }],
    warnings: [statusOf(metric)].filter(Boolean),
  };
}

function wagesRow(base, nominal, real) {
  const row = rollingRow(base, nominal);
  let line;
  if (real?.latest?.value == null) line = "After inflation: Not available";
  else {
    const nominalWindow = referenceWindow(nominal?.latest);
    const realWindow = referenceWindow(real.latest);
    const same = nominalWindow && realWindow &&
      nominalWindow.start_month === realWindow.start_month && nominalWindow.end_month === realWindow.end_month;
    line = `${UNITS.percent.value(real.latest.value)} after inflation`;
    if (!same) line += ` (CPIH-adjusted, ${realWindow
      ? windowLabel(realWindow.start_month, realWindow.end_month)
      : monthLabel(real.latest.period)}; separate window, not directly matched to nominal pay)`;
    if (real.collection_status !== "ok") line += " · update delayed";
  }
  return { ...row, change: [...row.change, sub(line)] };
}

function bankRateRow(base, metric) {
  if (!metric?.latest) return missingRow(base);
  const change = lastRateChange(metric);
  const at = change ? metric.history.findIndex((point) => point.period === change.period) : -1;
  const before = at > 0 ? metric.history[at - 1] : null;
  return {
    ...base,
    latest: [valueLine(metric.latest.value, "bankRate")],
    previous: before ? [valueLine(before.value, "bankRate"), sub(`Before ${dayLabel(change.period)}`)] : [na()],
    change: before ? [changeLine(metric.latest.value, before.value, "bankRate")] : [na()],
    period: [{ text: dayLabel(metric.latest.period) }],
    warnings: [statusOf(metric)].filter(Boolean),
  };
}

function rentRow(base, growth, level) {
  const row = monthlyRow(base, growth, "percent");
  let line;
  if (level?.latest?.value == null) line = "Average rent: Not available";
  else {
    line = `Average ${UNITS.poundsPerMonth.value(level.latest.value)}`;
    if (growth?.latest && level.latest.period !== growth.latest.period) line += ` (${monthLabel(level.latest.period)})`;
    if (level.collection_status !== "ok") line += " · update delayed";
  }
  return { ...row, change: [...row.change, sub(line)] };
}

function housePriceRow(base, level, growth) {
  const row = monthlyRow(base, level, "pounds");
  let line;
  if (growth?.latest?.value == null) line = "Annual change: Not available";
  else {
    line = `${UNITS.percent.value(growth.latest.value)} on a year earlier`;
    if (!level?.latest || growth.latest.period !== level.latest.period) line += ` (${monthLabel(growth.latest.period)})`;
    if (growth.collection_status !== "ok") line += " · update delayed";
  }
  return { ...row, change: [...row.change, sub(line)] };
}

const energyBasis = (r) => [r.geography, r.payment_method, r.tariff, r.electricity_kwh_per_year,
  r.gas_kwh_per_year, r.consumption_basis, r.tax_treatment].join("|");
/** Earlier cap period on the same consumption and tax basis, or a reason there is none. */
export function comparableEnergyPrevious(metric) {
  const latest = metric?.latest;
  const current = latest?.reference;
  if (!latest || !current) return { kind: "unavailable" };
  if (current.comparison_status === "not_comparable_tax_change") return { kind: "tax_change" };
  const previous = [...(metric.history ?? [])].reverse().find((point) =>
    point.period < latest.period && point.reference && energyBasis(point.reference) === energyBasis(current));
  return previous ? { kind: "comparable", previous } : { kind: "unavailable" };
}

function energyRow(base, metric) {
  if (!metric?.latest) return missingRow(base);
  const reference = metric.latest.reference;
  const comparison = comparableEnergyPrevious(metric);
  const row = {
    ...base,
    latest: [valueLine(metric.latest.value, "poundsPerYear")],
    period: [{ text: reference?.effective_start && reference?.effective_end
      ? windowLabel(reference.effective_start.slice(0, 7), reference.effective_end.slice(0, 7))
      : monthLabel(metric.latest.period) }],
    warnings: [statusOf(metric)].filter(Boolean),
  };
  if (comparison.kind === "comparable") {
    const { previous } = comparison;
    return {
      ...row,
      previous: [valueLine(previous.value, "poundsPerYear"),
        sub(windowLabel(previous.reference.effective_start.slice(0, 7), previous.reference.effective_end.slice(0, 7)))],
      change: [changeLine(metric.latest.value, previous.value, "poundsPerYear")],
    };
  }
  if (comparison.kind === "tax_change")
    return { ...row, previous: [na()], change: [{ text: "Not comparable", dir: "flat" }, sub("Tax treatment changed")] };
  return { ...row, previous: [na()], change: [na()] };
}

function fuelRow(base, petrol, diesel) {
  const fuels = [["petrol", petrol], ["diesel", diesel]];
  const previousOf = (metric) => (metric?.latest ? previousReading(metric) : null);
  const periods = fuels.map(([, metric]) => metric?.latest?.period ?? null);
  const priorDate = fuels.map(([, metric]) => previousOf(metric)?.period).find(Boolean);
  const [petrolPeriod, dieselPeriod] = periods;
  const period = [];
  if (petrolPeriod && dieselPeriod && petrolPeriod !== dieselPeriod) {
    period.push({ text: `Petrol: week of ${dayLabel(petrolPeriod)}` }, { text: `Diesel: week of ${dayLabel(dieselPeriod)}` });
  } else if (petrolPeriod ?? dieselPeriod) {
    period.push({ text: `Week of ${dayLabel(petrolPeriod ?? dieselPeriod)}` });
  } else period.push(na("No verified reading yet"));
  if (priorDate) period.push(sub(`Previous: ${dayLabel(priorDate)}`));
  return {
    ...base,
    latest: fuels.map(([tag, metric]) => metric?.latest ? valueLine(metric.latest.value, "pence", { tag }) : { ...na(), tag }),
    previous: fuels.map(([tag, metric]) => {
      const previous = previousOf(metric);
      return previous ? valueLine(previous.value, "pence", { tag }) : { ...na(), tag };
    }),
    change: fuels.map(([tag, metric]) => {
      const previous = previousOf(metric);
      return previous ? { ...changeLine(metric.latest.value, previous.value, "pence"), tag } : { ...na(), tag };
    }),
    period,
    warnings: fuels.map(([, metric]) => statusOf(metric)).filter(Boolean),
  };
}

function gdpRow(base, metric) {
  if (!metric?.latest) return missingRow(base);
  const previous = previousReading(metric);
  return {
    ...base,
    latest: [valueLine(metric.latest.value, "signedPercent")],
    previous: previous ? [valueLine(previous.value, "signedPercent"), sub(monthLabel(previous.period))] : [na()],
    change: previous ? [changeLine(metric.latest.value, previous.value, "signedPercent")] : [na()],
    period: [{ text: monthLabel(metric.latest.period) }],
    warnings: [statusOf(metric)].filter(Boolean),
  };
}

/** CPI headlines inflation once a verified reading exists; CPIH stays the labelled fallback. */
export function inflationKind(data) {
  return data?.metrics?.cpi?.latest?.value != null ? "cpi" : "cpih";
}

/** The nine headline measures in their agreed order (spec §4). */
export function overviewRows(data) {
  const m = data?.metrics ?? {};
  const kind = inflationKind(data);
  const cpih = kind === "cpih";
  return [
    monthlyRow({ id: "inflation", kind, name: cpih ? "Inflation (CPIH)" : "Inflation", definition: cpih ? DEFINITIONS.inflationCpih : DEFINITIONS.inflation }, m[kind], "percent"),
    bankRateRow({ id: "bank-rate", kind: "bank_rate", name: "Bank Rate", definition: DEFINITIONS.bank_rate }, m.bank_rate),
    wagesRow({ id: "wages", kind: "regular_pay_nominal_growth", name: "Wages", definition: DEFINITIONS.wages }, m.regular_pay_nominal_growth, m.regular_pay_real_growth),
    rollingRow({ id: "unemployment", kind: "unemployment", name: "Unemployment", definition: DEFINITIONS.unemployment }, m.unemployment),
    rentRow({ id: "rent", kind: "private_rent_growth", name: "Rent", definition: DEFINITIONS.rent }, m.private_rent_growth, m.private_rent_level),
    housePriceRow({ id: "house-prices", kind: "house_price_level", name: "House prices", definition: DEFINITIONS.house_prices }, m.house_price_level, m.house_price_growth),
    energyRow({ id: "energy", kind: "household_energy", name: "Household energy", definition: DEFINITIONS.energy }, m.household_energy),
    fuelRow({ id: "fuel", kind: "petrol_price", name: "Petrol & diesel", definition: DEFINITIONS.fuel }, m.petrol_price, m.diesel_price),
    gdpRow({ id: "gdp", kind: "gdp", name: "GDP", definition: DEFINITIONS.gdp }, m.gdp),
  ];
}
