// Deterministic plain-English takeaway for the overview. Pure functions over the same
// verified snapshot as `overviewRows`: every number is printed with the table's own
// formatter, nothing is estimated or forecast, no AI text is read, and a missing value
// is left out rather than shown as zero. It states what the latest figures show and
// makes no judgement or advice. `null` means there is nothing to say (card hidden).
import { comparableEnergyUpcoming, dayLabel, decimalDifference, formatFigure, inflationKind } from "./overview.mjs";

export const INFLATION_TARGET = 2;

/** A published decimal as a finite number, or null when absent, blank or not numeric. */
function numeric(metric) {
  const raw = metric?.latest?.value;
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(String(raw).replace("−", "-"));
  return Number.isFinite(value) ? value : null;
}
const unsigned = (raw) => String(raw).trim().replace(/^[-−+]/, "");
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Where inflation sits against the 2% target: "well_above", "above", "close" or "below". */
export function inflationBand(value) {
  if (value >= 3) return "well_above";
  if (value >= 2.3) return "above";
  if (value >= 1.7) return "close";
  return "below";
}
/** How real regular pay growth compares with prices: "strong", "narrow", "level" or "negative". */
export function realPayBand(value) {
  if (value >= 0.5) return "strong";
  if (value > 0) return "narrow";
  return value === 0 ? "level" : "negative";
}
/** Monthly GDP direction: "growing" (> 0.2), "modest" (> 0), "flat" or "contracted". */
export function gdpBand(value) {
  if (value > 0.2) return "growing";
  if (value > 0) return "modest";
  return value === 0 ? "flat" : "contracted";
}

const INFLATION_WORDS = {
  well_above: "well above",
  above: "above",
  close: "close to",
  below: "below",
};

function inflationClause(data) {
  const kind = inflationKind(data);
  const metric = data?.metrics?.[kind];
  const value = numeric(metric);
  if (value === null) return null;
  const band = inflationBand(value);
  const label = kind === "cpih" ? "Inflation (CPIH)" : "Inflation";
  return { band, text: `${label} is ${INFLATION_WORDS[band]} the ${INFLATION_TARGET}% target (${formatFigure(metric.latest.value, "percent")})` };
}

function payClause(data) {
  const metric = data?.metrics?.regular_pay_real_growth;
  const value = numeric(metric);
  if (value === null) return null;
  const band = realPayBand(value);
  const figure = formatFigure(metric.latest.value, "signedPercent");
  const text = {
    strong: `average regular pay is growing faster than prices (${figure} in real terms)`,
    narrow: `average regular pay is only just ahead of inflation (${figure} in real terms)`,
    level: `average regular pay is roughly matching inflation (${figure} in real terms)`,
    negative: `average regular pay is rising more slowly than prices (${figure} in real terms)`,
  }[band];
  return { band, text };
}

/** Sentence 1: prices and pay. "but" only where the two point in opposite directions. */
function pricesAndPay(data) {
  const inflation = inflationClause(data);
  const pay = payClause(data);
  if (inflation && pay) {
    const high = inflation.band === "well_above" || inflation.band === "above";
    const ahead = pay.band === "strong" || pay.band === "narrow";
    const contrast = (high && ahead) || (!high && pay.band === "negative");
    return `${inflation.text}${contrast ? ", but " : " and "}${pay.text}.`;
  }
  return inflation ? `${inflation.text}.` : pay ? `${capitalise(pay.text)}.` : null;
}

function rentClause(data) {
  const metric = data?.metrics?.private_rent_growth;
  const value = numeric(metric);
  if (value === null) return null;
  const figure = formatFigure(unsigned(metric.latest.value), "percent");
  if (value > 0) return `private rents are up ${figure} over the year`;
  if (value < 0) return `private rents are down ${figure} over the year`;
  return "private rents are flat over the year";
}

function gdpClause(data) {
  const metric = data?.metrics?.gdp;
  const value = numeric(metric);
  if (value === null) return null;
  const figure = formatFigure(unsigned(metric.latest.value), "percent");
  return {
    growing: `the economy grew ${figure} in the latest month`,
    modest: `the economy grew modestly (${figure} in the latest month)`,
    flat: "the economy was flat in the latest month",
    contracted: `the economy shrank ${figure} in the latest month`,
  }[gdpBand(value)];
}

function bankRateClause(data) {
  const metric = data?.metrics?.bank_rate;
  return numeric(metric) === null ? null : `Bank Rate sits at ${formatFigure(metric.latest.value, "bankRate")}`;
}

/** Only an announced cap on the same tax basis as the effective cap; never across a tax change. */
function energyClause(data) {
  const metric = data?.metrics?.household_energy;
  if (numeric(metric) === null) return null;
  const result = comparableEnergyUpcoming(metric);
  if (result.kind !== "comparable") return null;
  const { upcoming } = result;
  const start = upcoming.reference.effective_start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^-?\d+(\.\d+)?$/.test(String(upcoming.value))) return null;
  const change = decimalDifference(String(upcoming.value), String(metric.latest.value));
  const direction = change.startsWith("+") ? "rise" : change === "0" ? "stay the same" : "fall";
  const to = direction === "stay the same" ? "at" : "to";
  const verb = direction === "stay the same" ? "stay" : direction;
  return `the energy price cap is set to ${verb} ${to} ${formatFigure(upcoming.value, "poundsPerYear")} on ${dayLabel(start)}`;
}

/** Sentence 2: household costs and the wider economy, as a short list of verified facts. */
function householdAndEconomy(data) {
  const parts = [rentClause(data), gdpClause(data), bankRateClause(data), energyClause(data)].filter(Boolean);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${capitalise(list)}.`;
}

/**
 * `{ text, sentences }` for the overview, or null when no core figure (inflation, real
 * pay, rents, GDP, Bank Rate) is available. The energy cap only adds to other facts.
 */
export function overviewTakeaway(data) {
  const metrics = data?.metrics;
  if (!metrics || typeof metrics !== "object") return null;
  const hasCore = Boolean(
    inflationClause(data) || payClause(data) || rentClause(data) || gdpClause(data) || bankRateClause(data),
  );
  if (!hasCore) return null;
  const sentences = [pricesAndPay(data), householdAndEconomy(data)].filter(Boolean);
  return { text: sentences.join(" "), sentences };
}
