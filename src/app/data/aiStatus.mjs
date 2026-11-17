// Optional public status of the daily AI summary job (written by scheduler.py as
// ai_status.json). It is never numerical data: a missing, malformed or unknown file
// simply shows nothing extra, and it can never affect verified figures.
export const AI_STATUS_SCHEMA_VERSION = 1;

const FAILURE_REASONS = {
  credit: "the AI service account is out of credit",
  auth: "the AI service did not accept its access key",
  rate_limit: "the AI service was limiting requests",
  timeout: "the update took too long to finish",
  validation: "the new summary did not pass its checks",
  other: "the update did not complete",
};

const validTime = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

/** Returns a normalised status, or null for anything missing or not understood. */
export function parseAiStatus(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.schema_version !== AI_STATUS_SCHEMA_VERSION) return null;
  if (raw.outcome !== "ok" && raw.outcome !== "failed") return null;
  if (!validTime(raw.last_attempt_at)) return null;
  const kind = raw.failure_kind ?? null;
  if (raw.outcome === "failed" && kind !== null && !Object.hasOwn(FAILURE_REASONS, kind)) return null;
  return {
    outcome: raw.outcome,
    failureKind: raw.outcome === "failed" ? kind ?? "other" : null,
    lastAttemptAt: raw.last_attempt_at,
    lastSuccessAt: validTime(raw.last_success_at) ? raw.last_success_at : null,
  };
}

const longDate = (iso) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })
    .format(new Date(iso));

/**
 * The notice text for a failed latest attempt, or null. `summaryTime` is the shown
 * summary's own generated time. If that summary is newer than the failed attempt
 * (for example a later manual run), the notice would be stale and is not shown.
 */
export function aiFailureNotice(status, summaryTime = null) {
  if (!status || status.outcome !== "failed") return null;
  if (validTime(summaryTime) && Date.parse(summaryTime) > Date.parse(status.lastAttemptAt)) return null;
  const shownFrom = validTime(summaryTime) ? summaryTime : status.lastSuccessAt;
  const reason = FAILURE_REASONS[status.failureKind] ?? FAILURE_REASONS.other;
  return (
    `The AI summary could not be updated on ${longDate(status.lastAttemptAt)} (${reason}). ` +
    (shownFrom ? `Showing the summary from ${longDate(shownFrom)}. ` : "") +
    "Official figures are unaffected."
  );
}

export async function loadAiStatus(baseUrl, fetcher, signal) {
  try {
    const response = await fetcher(`${baseUrl}ai_status.json`, { cache: "no-store", signal });
    if (!response.ok) return null;
    return parseAiStatus(await response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
