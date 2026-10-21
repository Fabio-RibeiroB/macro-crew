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
/**
 * Reviewed optional metric members. Absent members stay absent; a present
 * member must match its registered statistical definition exactly, including
 * unit, geography, window metadata and its exact qualified source and
 * download URLs, or the whole generation is rejected. Registry entries are
 * code-owned contracts, not payload-supplied rules.
 */
export const OPTIONAL_METRICS = {
  cpi: {
    metric_id: "uk.cpi.annual_rate",
    series: "D7G7",
    dataset: "MM23",
    frequency: "monthly",
    comparison: "year_on_year",
    adjustment: "not_seasonally_adjusted",
    unit: "percent",
    version: 1,
    geography: "United Kingdom",
    source_url:
      "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23",
    download_url:
      "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data",
  },
  regular_pay_nominal_growth: {
    metric_id: "uk.regular_pay.nominal_annual_growth",
    series: "KAI9",
    dataset: "LMS",
    frequency: "monthly",
    comparison: "year_on_year",
    adjustment: "seasonally_adjusted",
    unit: "percent",
    version: 1,
    geography: "Great Britain",
    window_months: 3,
    source_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms",
    download_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms/data",
  },
  regular_pay_real_growth: {
    metric_id: "uk.regular_pay.real_annual_growth",
    series: "A2FA",
    dataset: "LMS",
    frequency: "monthly",
    comparison: "year_on_year",
    adjustment: "seasonally_adjusted",
    unit: "percent",
    version: 1,
    geography: "Great Britain",
    window_months: 3,
    deflator: "CPIH",
    source_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms",
    download_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms/data",
  },
  unemployment: {
    metric_id: "uk.unemployment.rate",
    series: "MGSX",
    dataset: "LMS",
    title: "Unemployment rate (aged 16 and over, seasonally adjusted): %",
    frequency: "monthly",
    comparison: "previous_published_window",
    adjustment: "seasonally_adjusted",
    unit: "percent",
    version: 1,
    geography: "United Kingdom",
    age_group: "16 and over",
    window_months: 3,
    source_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms",
    download_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data",
    quality_note:
      "The Labour Force Survey unemployment rate's 95% confidence intervals remain wider than before the pandemic.",
    quality_source_url:
      "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/labourforcesurveyqualityupdate/october2026",
  },
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
const isoMonth = (value) =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
function addMonths(month, count) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}
function validateDefinition(definition, spec) {
  const identity = [
    "metric_id",
    "series",
    "dataset",
    "frequency",
    "comparison",
    "adjustment",
  ];
  if (
    identity.some((field) => definition[field] !== spec[field]) ||
    definition.unit !== spec.unit ||
    definition.version !== spec.version ||
    definition.geography !== spec.geography ||
    definition.source_url !== spec.source_url ||
    definition.download_url !== spec.download_url
  )
    fail("Unexpected optional metric definition");
  if (spec.title !== undefined && definition.title !== spec.title)
    fail("Unexpected optional metric title");
  if (spec.window_months !== undefined) {
    if (definition.window_months !== spec.window_months)
      fail("Unexpected optional metric window");
  } else if (definition.window_months !== undefined) {
    fail("Unexpected optional metric window");
  }
  if (spec.age_group !== undefined) {
    if (definition.age_group !== spec.age_group)
      fail("Unexpected optional metric population");
  } else if (definition.age_group !== undefined) {
    fail("Unexpected optional metric population");
  }
  if (spec.deflator !== undefined) {
    if (definition.deflator !== spec.deflator)
      fail("Unexpected optional metric deflator");
  } else if (definition.deflator !== undefined) {
    fail("Unexpected optional metric deflator");
  }
}
function validateReference(point, spec) {
  if (spec.window_months === undefined) {
    if (point.reference !== undefined)
      fail("Unexpected reference metadata");
    return;
  }
  const reference = point.reference;
  if (
    !object(reference) ||
    Object.keys(reference).sort().join(",") !== "end_month,kind,start_month" ||
    reference.kind !== "rolling_months" ||
    !isoMonth(reference.start_month) ||
    !isoMonth(reference.end_month) ||
    reference.end_month !== point.period
  )
    fail("Invalid rolling reference window");
  let month = reference.start_month;
  for (let index = 1; index < spec.window_months; index++)
    month = addMonths(month, 1);
  if (month !== reference.end_month)
    fail("Reference window does not match its definition");
}
function validateOptionalMetric(metric, spec) {
  if (!object(metric) || !object(metric.definition))
    fail("Missing optional metric definition");
  validateDefinition(metric.definition, spec);
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
    return;
  }
  if (
    metric.validation_status !== "verified" ||
    metric.snapshot_evidence_kind !== "official_download" ||
    metric.source_download_url !== spec.download_url ||
    !/^[a-f0-9]{64}$/.test(metric.source_sha256) ||
    !instant(metric.retrieved_at)
  )
    fail("Missing official provenance");
  if (spec.quality_note !== undefined &&
      (metric.quality_note !== spec.quality_note ||
       metric.quality_source_url !== spec.quality_source_url))
    fail("Missing or unexpected unemployment quality evidence");
  if (
    metric.source_published_date !== null &&
    !isoDate(metric.source_published_date)
  )
    fail("Invalid release date");
  if (metric.next_release_date !== null && !isoDate(metric.next_release_date))
    fail("Invalid expected release date");
  if (!metric.history.length) fail("Empty verified history");
  metric.history.forEach((point) => {
    validatePoint(point, spec.frequency);
    validateReference(point, spec);
  });
  if (
    metric.history.some(
      (point, index, arr) => index > 0 && point.period <= arr[index - 1].period,
    )
  )
    fail("History is not ordered and unique");
  validatePoint(metric.latest, spec.frequency);
  validateReference(metric.latest, spec);
  const end = metric.history.at(-1);
  if (
    metric.latest.value === null ||
    metric.latest.period !== end.period ||
    metric.latest.value !== end.value
  )
    fail("Card and chart disagree");
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
  for (const [key, metric] of Object.entries(value.metrics)) {
    if (key in METRICS) continue;
    const spec = OPTIONAL_METRICS[key];
    if (!spec) fail("Unknown metric");
    validateOptionalMetric(metric, spec);
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
/** Return the latest change directly established by adjacent Bank Rate points. */
export function lastRateChange(metric) {
  if (!metric?.history || metric.history.length < 2) return null;
  for (let i = metric.history.length - 1; i > 0; i--) {
    const current = metric.history[i];
    const previous = metric.history[i - 1];
    // An explicit missing observation breaks the evidence chain. Do not bridge it.
    if (current.value === null || previous.value === null) return null;
    const difference = Number(current.value) - Number(previous.value);
    if (difference !== 0) {
      // A change spanning an unobserved weekday has no evidenced date.
      const date = new Date(`${previous.period}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      const end = new Date(`${current.period}T00:00:00Z`);
      while (date < end) {
        const weekday = date.getUTCDay();
        if (weekday !== 0 && weekday !== 6) return null;
        date.setUTCDate(date.getUTCDate() + 1);
      }
      return { period: current.period, difference };
    }
    // Equal observed values across an unobserved weekday are not themselves
    // treated as a change or date; keep looking for a directly evidenced one.
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
      ...(point.reference ? { reference: point.reference } : {}),
    });
  }
  return points;
}
/**
 * Full rolling reference window for a point, or null for ordinary periods.
 * A rolling chart locates the point at its end month, but its tooltip,
 * exact-value table and comparison must show this complete window.
 */
export function referenceWindow(point) {
  const reference = point?.reference;
  if (
    !object(reference) ||
    reference.kind !== "rolling_months" ||
    !isoMonth(reference.start_month) ||
    !isoMonth(reference.end_month)
  )
    return null;
  return { start_month: reference.start_month, end_month: reference.end_month };
}
export function previousPublishedWindow(metric) {
  if (!metric?.latest || metric.history.length < 2) return null;
  const current = metric.latest.reference;
  const previous = metric.history.at(-2);
  if (!current || !previous.reference || previous.value === null) return null;
  const expectedPrevious = new Date(`${previous.period}-01T00:00:00Z`);
  expectedPrevious.setUTCMonth(expectedPrevious.getUTCMonth() + 1);
  if (expectedPrevious.toISOString().slice(0, 7) !== metric.latest.period) return null;
  return previous;
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
