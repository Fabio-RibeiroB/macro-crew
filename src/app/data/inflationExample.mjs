// Worked example for the Prices "What it means" row (issue #172, M13). It turns the latest
// verified annual inflation rate into "£100 of shopping then, about £X now". It is a FinStats
// illustration, never a published figure, and it is derived only from the verified rate.
import { inflationTargetLine } from "./chartMeta.mjs";

const MINUS = "−";
const BASE_PENCE = 10000; // £100.00

/** Hundredths of a percentage point, e.g. "3.6" -> 360, parsed from the decimal text so it is exact. */
function rateInHundredths(value) {
  const text = String(value ?? "").trim().replace(MINUS, "-");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Number(`${text}e2`));
}

/** Pence as pounds: whole pounds drop the ".00" (£100), otherwise two decimals (£103.60). */
export function formatPounds(pence) {
  const whole = Math.trunc(pence / 100);
  const rest = Math.abs(pence % 100);
  return rest === 0 ? `£${whole}` : `£${whole}.${String(rest).padStart(2, "0")}`;
}

/** The same calendar month one year before a "YYYY-MM" period, or null. */
export function yearEarlier(period) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period ?? ""));
  return match ? `${Number(match[1]) - 1}-${match[2]}` : null;
}

/**
 * £100 x (1 + rate/100), to the penny (half a penny rounds up). The 2% target comparison is
 * only for CPI: the Bank of England target applies to CPI, not CPIH. Returns null when the
 * verified rate or its month is missing, so the caller renders nothing rather than zeros.
 *
 * @param {"cpi" | "cpih"} kind
 * @param {{ period?: string, value?: string | number | null } | null | undefined} latest
 */
export function inflationExample(kind, latest) {
  const hundredths = rateInHundredths(latest?.value);
  const then = yearEarlier(latest?.period);
  if (hundredths === null || then === null) return null;
  const nowPence = BASE_PENCE + hundredths;
  if (nowPence <= 0) return null;
  const targetRate = kind === "cpi" ? inflationTargetLine("cpi").value : null;
  const targetPence = targetRate === null ? null : BASE_PENCE + Math.round(targetRate * 100);
  return {
    kind,
    label: kind === "cpi" ? "CPI" : "CPIH",
    rateText: `${String(latest.value).trim().replace(/^-/, MINUS)}%`,
    thenPeriod: then,
    nowPeriod: latest.period,
    thenPence: BASE_PENCE,
    nowPence,
    targetPence,
    targetText: targetRate === null ? null : `${targetRate}%`,
    direction: hundredths > 0 ? "up" : hundredths < 0 ? "down" : "flat",
  };
}
