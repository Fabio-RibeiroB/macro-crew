// Frozen M1 reader contract from accepted commit 189437f; tests additive-v1 compatibility.
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
