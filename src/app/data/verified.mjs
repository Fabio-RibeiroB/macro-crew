/** Runtime contract for the public official-data export. No legacy numerical fallback. */
export const METRICS = {
  bank_rate: [
    "uk.bank_rate.daily",
    "IUDBEDR",
    "IADB",
    "daily",
    "level_per_annum",
    "not_applicable",
  ],
  cpih: [
    "uk.cpih.annual_rate",
    "L55O",
    "MM23",
    "monthly",
    "year_on_year",
    "not_seasonally_adjusted",
  ],
  gdp: [
    "uk.gdp.monthly_growth",
    "ECYX",
    "MGDP",
    "monthly",
    "month_on_month",
    "seasonally_adjusted",
  ],
};
const fail = (message) => {
  throw new Error(message);
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isoDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const instant = (value) =>
  typeof value === "string" &&
  /Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
const decimal = (value) =>
  typeof value === "string" &&
  /^[+-]?\d+(?:\.\d+)?$/.test(value) &&
  Number.isFinite(Number(value));
export function officialUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ["www.ons.gov.uk", "www.bankofengland.co.uk"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
export function parseManifest(value) {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    !/^[a-f0-9]{32}$/.test(value.generation_id) ||
    value.data_url !== `generations/${value.generation_id}/data.json` ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !instant(value.published_at)
  )
    fail("Invalid data manifest");
  return value;
}
function validatePoint(point, frequency) {
  if (!object(point) || typeof point.period !== "string")
    fail("Invalid reference period");
  const validPeriod =
    frequency === "monthly"
      ? /^\d{4}-(0[1-9]|1[0-2])$/.test(point.period)
      : isoDate(point.period);
  if (
    !validPeriod ||
    !(
      (decimal(point.value) && point.status === "observed") ||
      (point.value === null && point.status === "missing")
    )
  )
    fail("Invalid statistical observation");
}
export function parseDataset(value, manifest) {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    value.generation_id !== manifest.generation_id ||
    value.mode !== "official" ||
    value.published_at !== manifest.published_at ||
    !object(value.metrics)
  )
    fail("Mismatched data generation");
  for (const [key, expected] of Object.entries(METRICS)) {
    const metric = value.metrics[key];
    if (!object(metric) || !object(metric.definition))
      fail("Missing metric definition");
    const d = metric.definition;
    const actual = [
      d.metric_id,
      d.series,
      d.dataset,
      d.frequency,
      d.comparison,
      d.adjustment,
    ];
    if (
      actual.some((v, i) => v !== expected[i]) ||
      d.unit !== "percent" ||
      d.version !== 1 ||
      !officialUrl(d.source_url)
    )
      fail("Unexpected metric definition");
    if (!["ok", "degraded", "unavailable"].includes(metric.collection_status))
      fail("Invalid collection state");
    if (
      metric.last_successful_check_at !== null &&
      !instant(metric.last_successful_check_at)
    )
      fail("Invalid check timestamp");
    if (!Array.isArray(metric.history)) fail("Invalid history");
    if (metric.validation_status === "unavailable") {
      if (metric.latest !== null || metric.history.length)
        fail("Unavailable metric has values");
      continue;
    }
    if (
      metric.validation_status !== "verified" ||
      metric.snapshot_evidence_kind !== "official_download" ||
      !officialUrl(metric.source_download_url) ||
      !/^[a-f0-9]{64}$/.test(metric.source_sha256) ||
      !instant(metric.retrieved_at)
    )
      fail("Missing official provenance");
    if (
      metric.source_published_date !== null &&
      !isoDate(metric.source_published_date)
    )
      fail("Invalid release date");
    if (metric.next_release_date !== null && !isoDate(metric.next_release_date))
      fail("Invalid expected release date");
    if (!metric.history.length) fail("Empty verified history");
    metric.history.forEach((p) => validatePoint(p, d.frequency));
    if (
      metric.history.some((p, i, arr) => i > 0 && p.period <= arr[i - 1].period)
    )
      fail("History is not ordered and unique");
    validatePoint(metric.latest, d.frequency);
    const end = metric.history.at(-1);
    if (
      metric.latest.value === null ||
      metric.latest.period !== end.period ||
      metric.latest.value !== end.value
    )
      fail("Card and chart disagree");
  }
  return value;
}
export class VerifiedDataError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "VerifiedDataError";
    this.kind = kind;
  }
}
export async function loadVerified(base = "/", fetcher = fetch) {
  const get = async (url, options) => {
    let response;
    try {
      response = await fetcher(url, options);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new VerifiedDataError("network", "Official-data request failed");
    }
    if (!response.ok)
      throw new VerifiedDataError(
        response.status === 404 ? "missing" : "unavailable",
        "Verified figures are temporarily unavailable",
      );
    return response;
  };
  try {
    const response = await get(`${base}data/current.json`, {
      cache: "no-store",
    });
    const manifest = parseManifest(await response.json());
    const dataResponse = await get(`${base}data/${manifest.data_url}`);
    const bytes = await dataResponse.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== manifest.sha256) fail("The data integrity check failed");
    return parseDataset(JSON.parse(new TextDecoder().decode(bytes)), manifest);
  } catch (error) {
    if (error instanceof VerifiedDataError || error?.name === "AbortError")
      throw error;
    throw new VerifiedDataError(
      "invalid",
      "The data integrity or format check failed",
    );
  }
}
export function previousReading(metric) {
  if (!metric.latest || metric.history.length < 2) return null;
  const previous = metric.history.at(-2);
  if (previous.value === null) return null;
  if (metric.definition.frequency === "monthly") {
    const date = new Date(`${previous.period}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    if (date.toISOString().slice(0, 7) !== metric.latest.period) return null;
  }
  return previous;
}
/** Return the latest change established by adjacent observed Bank Rate points. */
export function lastRateChange(metric) {
  if (!metric?.history || metric.history.length < 2) return null;
  for (let i = metric.history.length - 1; i > 0; i--) {
    const current = metric.history[i];
    const previous = metric.history[i - 1];
    // A missing observation breaks the evidence chain. Do not bridge it.
    if (current.value === null || previous.value === null) return null;
    const difference = Number(current.value) - Number(previous.value);
    if (difference !== 0) return { period: current.period, difference };
  }
  return null;
}
export function chartPoints(metric) {
  const points = [];
  for (const point of metric.history) {
    if (metric.definition.frequency === "monthly" && points.length) {
      const date = new Date(`${points.at(-1).date}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + 1);
      while (date.toISOString().slice(0, 7) < point.period) {
        points.push({ date: date.toISOString().slice(0, 7), value: null });
        date.setUTCMonth(date.getUTCMonth() + 1);
      }
    }
    points.push({
      date: point.period,
      value: point.value === null ? null : Number(point.value),
    });
  }
  return points;
}
export function freshness(metric, now = new Date()) {
  if (!metric.latest) return { label: "Unavailable", kind: "warning" };
  if (metric.collection_status !== "ok")
    return {
      label: "Update delayed · showing last verified figure",
      kind: "warning",
    };
  const checked = Date.parse(metric.last_successful_check_at ?? "");
  if (!Number.isFinite(checked) || now.getTime() - checked > 24 * 3600_000)
    return { label: "Last check over a day ago", kind: "warning" };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (metric.next_release_date && metric.next_release_date < today)
    return { label: "New release awaited", kind: "warning" };
  return { label: "Checked against official data", kind: "ok" };
}
export function formatPeriod(value) {
  if (!value) return "Not available";
  const monthly = /^\d{4}-\d{2}$/.test(value);
  const date = new Date(
    monthly ? `${value}-01T00:00:00Z` : `${value}T00:00:00Z`,
  );
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    ...(monthly ? {} : { day: "numeric" }),
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
export function percent(value) {
  return value === null || value === undefined
    ? "Not available"
    : `${Number(value).toLocaleString("en-GB", { maximumFractionDigits: 4 })}%`;
}
export function legacyReports(value) {
  const reports = value?.current_report_summaries;
  if (!object(reports)) return [];
  return Object.entries(reports)
    .filter(
      ([key, r]) =>
        ["monetary_policy_report", "financial_stability_report"].includes(
          key,
        ) &&
        object(r) &&
        typeof r.summary === "string" &&
        r.summary.trim() &&
        officialUrl(r.source),
    )
    .map(([key, r]) => ({
      ...r,
      key,
      report_date: isoDate(r.report_date) ? r.report_date : null,
    }));
}

export function reportLabel(report) {
  if (report.key === "financial_stability_report")
    return "Financial stability commentary";
  return report.source.includes("/monetary-policy-report/")
    ? "Monetary Policy Report commentary"
    : "MPC / monetary policy commentary";
}
