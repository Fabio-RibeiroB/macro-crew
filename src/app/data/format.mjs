/** "20 Oct, 12:00 UK time", or "Not yet checked" when there is no timestamp. */
export function checkedAt(value) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }) + " UK time"
    : "Not yet checked";
}

/** Short form for one-line summaries: "checked 20 Oct, 12:00" (UK time). */
export function checkedBrief(value) {
  return value
    ? "checked " + new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "not yet checked";
}

const hasInstant = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

/** "15 Nov 2026" in UK time, or null when the value is not a usable timestamp. */
export function shortDate(value) {
  return hasInstant(value)
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
    : null;
}

/** "15 Nov" in UK time (no year), or null when the value is not a usable timestamp. */
export function shortDay(value) {
  return hasInstant(value)
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })
    : null;
}
