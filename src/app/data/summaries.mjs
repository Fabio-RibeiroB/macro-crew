const LIMITS = { manifest: 65_536, status: 4_096, version: 65_536, entries: 100, claims: 8, citations: 8 };
const SOURCES = new Set(["ons", "boe", "boe_mpc", "obr", "hm_treasury", "desnz", "desnz_fuel", "ofgem"]);
const METRICS = {
  cpi: { subject: "prices", unit: "percent" }, cpih: { subject: "prices", unit: "percent" },
  household_energy: { subject: "prices", unit: "GBP_per_year" }, petrol_price: { subject: "prices", unit: "pence_per_litre" }, diesel_price: { subject: "prices", unit: "pence_per_litre" },
  private_rent_growth: { subject: "housing", unit: "percent" }, private_rent_level: { subject: "housing", unit: "GBP_per_month" }, house_price_level: { subject: "housing", unit: "GBP" }, house_price_growth: { subject: "housing", unit: "percent" },
  regular_pay_nominal_growth: { subject: "jobs-pay", unit: "percent" }, regular_pay_real_growth: { subject: "jobs-pay", unit: "percent" }, unemployment: { subject: "jobs-pay", unit: "percent" },
  gdp: { subject: "economy", unit: "percent" }, bank_rate: { subject: "economy", unit: "percent" },
  public_debt: { subject: "government", unit: "percent" }, gilt_5y: { subject: "government", unit: "percent" }, gilt_10y: { subject: "government", unit: "percent" }, gilt_20y: { subject: "government", unit: "percent" },
};
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const date = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const instant = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
const decimal = (value) => typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
const officialUrl = (value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && ["www.ons.gov.uk", "www.bankofengland.co.uk", "www.gov.uk", "obr.uk", "www.ofgem.gov.uk"].includes(url.hostname); }
  catch { return false; }
};
function fail(message) { throw new Error(message); }
function exactKeys(value, keys) { return isObject(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(","); }
function validWindow(value) {
  if (typeof value === "string") return value.length > 0 && value.length <= 80 && /^[a-z][a-z0-9_]*$/.test(value);
  return exactKeys(value, ["kind", "start_month", "end_month"]) && value.kind === "rolling_months" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.start_month) && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.end_month) && value.start_month <= value.end_month;
}
function validateClaim(claim) {
  if (!exactKeys(claim, ["metric_key", "unit", "period", "reference_window", "value", "previous_value", "provenance"]) ||
      !Object.hasOwn(METRICS, claim.metric_key) || claim.unit !== METRICS[claim.metric_key].unit || !/^\d{4}-(0[1-9]|1[0-2])$/.test(claim.period) || !validWindow(claim.reference_window) ||
      (typeof claim.reference_window === "object" && claim.period !== claim.reference_window.end_month) || !decimal(claim.value) ||
      (claim.previous_value !== null && !decimal(claim.previous_value)) || !["current_observation", "previous_observation", "revision"].includes(claim.provenance) ||
      (claim.provenance === "revision") !== (claim.previous_value !== null)) fail("Invalid summary claim");
}
function canonicalWindow(window) { return typeof window === "string" ? window : JSON.stringify({ kind: window.kind, start_month: window.start_month, end_month: window.end_month }); }
function renderClaim(claim) {
  const label = claim.metric_key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
  const window = typeof claim.reference_window === "string" ? claim.reference_window : `rolling months ${claim.reference_window.start_month} to ${claim.reference_window.end_month}`;
  const unit = { percent: "%", GBP: "GBP", GBP_per_month: "GBP/month", GBP_per_year: "GBP/year", pence_per_litre: "pence/litre" }[claim.unit] ?? claim.unit;
  const context = `${label} (${claim.period}; ${window})`;
  if (claim.provenance === "revision") return `${context} was revised from ${claim.previous_value} to ${claim.value} ${unit}.`;
  if (claim.provenance === "previous_observation") return `Previous ${context}: ${claim.value} ${unit}.`;
  return `${context}: ${claim.value} ${unit}.`;
}
function validateVersion(value, key, entry) {
  if (!exactKeys(value, ["schema_version", "release", "generated_at", "evidence_identity", "summary"]) || value.schema_version !== 1 ||
      !(exactKeys(value.release, ["source", "id", "published_date", "source_url"]) || exactKeys(value.release, ["source", "id", "published_date"])) || !SOURCES.has(value.release.source) || typeof value.release.id !== "string" || !/^[\w:./-]{1,180}$/.test(value.release.id) ||
      !date(value.release.published_date) || (value.release.source_url != null && !officialUrl(value.release.source_url)) || !instant(value.generated_at) || !/^[a-f0-9]{64}$/.test(value.evidence_identity) ||
      !exactKeys(value.summary, ["summary", "claims", "citations"]) || typeof value.summary.summary !== "string" || value.summary.summary.length > 1_200 ||
      !Array.isArray(value.summary.claims) || value.summary.claims.length < 1 || value.summary.claims.length > LIMITS.claims ||
      !Array.isArray(value.summary.citations) || value.summary.citations.length < 1 || value.summary.citations.length > LIMITS.citations ||
      value.summary.citations.some((url) => !officialUrl(url)) || new Set(value.summary.citations).size !== value.summary.citations.length) fail("Invalid summary version");
  if (`${value.release.source}:${value.release.id}` !== key || value.release.published_date !== entry.published_date || value.generated_at !== entry.generated_at || value.evidence_identity !== entry.evidence_identity) fail("Summary release identity mismatch");
  const periods = [];
  for (const claim of value.summary.claims) { validateClaim(claim); if (!periods.includes(claim.period)) periods.push(claim.period); }
  if (JSON.stringify(periods) !== JSON.stringify(entry.reference_periods) || value.summary.summary !== value.summary.claims.map(renderClaim).join(" ")) fail("Summary claims and manifest disagree");
  return value;
}
async function sha256Text(value) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function validateManifest(value) {
  if (!exactKeys(value, ["schema_version", "updated_at", "summaries"]) || value.schema_version !== 1 || !instant(value.updated_at) || !isObject(value.summaries) || Object.keys(value.summaries).length > LIMITS.entries) fail("Invalid summary manifest");
  for (const [key, entry] of Object.entries(value.summaries)) {
    if (!/^[a-z_]+:[\w:./-]{1,180}$/.test(key) || !exactKeys(entry, ["published_date", "reference_periods", "generated_at", "evidence_identity", "version"]) ||
        !date(entry.published_date) || !instant(entry.generated_at) || !/^[a-f0-9]{64}$/.test(entry.evidence_identity) || !Array.isArray(entry.reference_periods) || entry.reference_periods.length > LIMITS.claims ||
        entry.reference_periods.some((period) => typeof period !== "string" || !/^[\w-]{1,32}$/.test(period)) || new Set(entry.reference_periods).size !== entry.reference_periods.length ||
        typeof entry.version !== "string" || !/^summary-versions\/[a-f0-9]{64}\/\d{4}-\d{2}-\d{2}-[a-f0-9]{64}\.json$/.test(entry.version)) fail("Invalid summary manifest entry");
  }
  return value;
}
function validateStatus(value) {
  if (!(exactKeys(value, ["schema_version", "status", "updated_at"]) || exactKeys(value, ["schema_version", "status", "updated_at", "reason"])) || value.schema_version !== 1 || !["disabled", "current", "stale"].includes(value.status) || !instant(value.updated_at) || (value.reason != null && (typeof value.reason !== "string" || !/^[a-z_]{1,80}$/.test(value.reason)))) fail("Invalid summary status");
  return value;
}
async function readJson(fetcher, url, signal, maxBytes) {
  const response = await fetcher(url, { cache: "no-store", signal });
  if (!response.ok) fail("Release explanations are unavailable");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) fail("Release explanation file exceeds its limit");
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function loadSummaries(base = "/", fetcher = fetch, signal) {
  if (typeof base !== "string" || !base.startsWith("/") || base.startsWith("//") || base.includes("..") || /[?#]/.test(base)) fail("Invalid public data base");
  const root = `${base.endsWith("/") ? base : `${base}/`}data/`;
  const [rawManifest, rawStatus] = await Promise.all([
    readJson(fetcher, `${root}summary-manifest.json`, signal, LIMITS.manifest),
    readJson(fetcher, `${root}summary-status.json`, signal, LIMITS.status),
  ]);
  const manifest = validateManifest(rawManifest); const status = validateStatus(rawStatus);
  const summaries = await Promise.all(Object.entries(manifest.summaries).map(async ([key, entry]) => {
    const version = validateVersion(await readJson(fetcher, `${root}${entry.version}`, signal, LIMITS.version), key, entry);
    if (entry.version !== `summary-versions/${await sha256Text(key)}/${version.release.published_date}-${version.evidence_identity}.json`) fail("Summary version path does not match its release");
    return { key, entry, version };
  }));
  return { manifest, status, summaries };
}
function exactPeriodWindow(claim, metric) {
  if (!metric?.latest || metric.validation_status !== "verified" || metric.latest.value === null || claim.unit !== metric.definition?.unit || claim.period !== metric.latest.period) return false;
  const currentWindow = metric.latest.reference ?? metric.definition.comparison;
  return canonicalWindow(claim.reference_window) === canonicalWindow(currentWindow) && claim.value === metric.latest.value && ["current_observation", "revision"].includes(claim.provenance);
}
export function summariesForSubject(data, subject, metrics) {
  const claims = [];
  for (const item of data?.summaries ?? []) for (const claim of item.version.summary.claims) {
    if (METRICS[claim.metric_key]?.subject !== subject) continue;
    const metric = metrics?.[claim.metric_key];
    claims.push({ ...claim, key: item.key, release: item.version.release, generated_at: item.version.generated_at, citations: item.version.summary.citations, summaryText: renderClaim(claim), matchesCurrent: exactPeriodWindow(claim, metric) });
  }
  return claims.sort((a, b) => b.release.published_date.localeCompare(a.release.published_date) || a.metric_key.localeCompare(b.metric_key));
}
export function summarySubjects() { return METRICS; }
