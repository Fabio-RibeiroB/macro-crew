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
