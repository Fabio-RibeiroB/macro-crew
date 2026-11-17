// Display helpers for upcoming dates. Everything is derived from the validated
// event fields; nothing is invented. Unknown shapes fall back to the original
// title so a source wording change never hides or distorts an event.

const TZ = "Europe/London";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_ALT = MONTHS.join("|");

// One entry per publisher key used by the calendar providers. `tone` selects the
// colour tokens in src/styles/events.css (--fs-tag-<tone>-fg / -bg).
const PUBLISHERS = {
  ons: { label: "ONS", name: "Office for National Statistics", tone: "ons" },
  boe_mpc: { label: "Bank of England", name: "Bank of England", tone: "boe" },
  ofgem_energy: { label: "Ofgem", name: "Ofgem", tone: "ofgem" },
  desnz_fuel: { label: "DESNZ", name: "Department for Energy Security and Net Zero", tone: "desnz" },
  obr: { label: "OBR", name: "Office for Budget Responsibility", tone: "obr" },
  hm_treasury: { label: "HM Treasury", name: "HM Treasury", tone: "hmt" },
};
const UNKNOWN_PUBLISHER = { label: "Official", name: "Official source", tone: "other" };

export function publisherTag(source) {
  return (typeof source === "string" && Object.hasOwn(PUBLISHERS, source)) ? PUBLISHERS[source] : UNKNOWN_PUBLISHER;
}

const londonDay = (instant) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

// Whole London calendar days from `now` to the event date. Uses date strings, so
// midnight and the clock changes (23 or 25 hour days) cannot shift the count.
export function daysUntil(eventDate, now = new Date()) {
  if (typeof eventDate !== "string" || !/^\d{4}-\d\d-\d\d$/.test(eventDate)) return null;
  return Math.round(dayNumber(eventDate) - dayNumber(londonDay(now)));
}

export function relativeDayLabel(eventDate, now = new Date()) {
  const days = daysUntil(eventDate, now);
  if (days === null || !Number.isFinite(days) || days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

// Weekday, day number, short month (and year when it is not the current London year).
export function dateParts(eventDate, now = new Date()) {
  const at = new Date(`${eventDate}T12:00:00Z`);
  const format = (options) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(at);
  const year = Number(eventDate.slice(0, 4));
  const currentYear = Number(londonDay(now).slice(0, 4));
  return {
    weekday: format({ weekday: "short" }),
    day: String(Number(eventDate.slice(8, 10))),
    month: format({ month: "short" }),
    year: year === currentYear ? null : String(year),
    full: format({ dateStyle: "full" }),
  };
}

export function eventTime(event) {
  if (!event?.time) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.time));
}

// "25 November 2026" -> { day: "25", month: "Nov", year: "2026" }
function parseLong(value) {
  const m = new RegExp(`^(\\d{1,2}) (${MONTH_ALT}) (\\d{4})$`).exec(value);
  return m && { day: m[1], month: m[2].slice(0, 3), year: m[3] };
}
const LONG_DATE = `\\d{1,2} (?:${MONTH_ALT}) \\d{4}`;
const OFGEM = new RegExp(`^Ofgem price cap level announcement due by (${LONG_DATE}); Ofgem may publish earlier \\(effective period (${LONG_DATE}) to (${LONG_DATE})\\)$`);

function ofgem(title) {
  const m = OFGEM.exec(title);
  if (!m) return null;
  const [due, from, to] = [parseLong(m[1]), parseLong(m[2]), parseLong(m[3])];
  if (!due || !from || !to) return null;
  const start = from.year === to.year ? `${from.day} ${from.month}` : `${from.day} ${from.month} ${from.year}`;
  return {
    title: "Energy price cap announcement",
    detail: `Due by ${due.day} ${due.month} · may be earlier · covers ${start} to ${to.day} ${to.month} ${to.year}`,
  };
}

// ONS release families, matching the families the calendar validator accepts.
const ONS_FAMILIES = [
  [/^Consumer price inflation/i, "Inflation (CPI and CPIH)"],
  [/^GDP monthly estimate/i, "Monthly GDP estimate"],
  [/^UK Labour Market/i, "Jobs and unemployment"],
  [/^(?:Employee earnings in the UK|Earnings and working hours)/i, "Pay and earnings"],
  [/^Private rent and house prices, UK/i, "Private rents and house prices"],
  [/^Index of Private Housing Rental Prices, UK/i, "Private rents"],
  [/^UK House Price Index/i, "House prices"],
];
const PERIOD = new RegExp(`^(?:(?:${MONTH_ALT}) )?\\d{4}$`);

function ons(title) {
  const clean = title.replace(/\s+/g, " ").trim();
  for (const [pattern, shortTitle] of ONS_FAMILIES) {
    const m = pattern.exec(clean);
    if (!m) continue;
    // What follows the family name must be nothing, or a plain period such as
    // "June 2027" or "2026". Anything else (e.g. "corrected") keeps the original.
    const rest = clean.slice(m[0].length).replace(/^,?\s*UK\b/i, "").replace(/^\s*[:,]\s*/, "").trim();
    if (rest === "") return { title: shortTitle, detail: null };
    if (PERIOD.test(rest)) return { title: shortTitle, detail: `Covers ${rest}` };
    return null;
  }
  return null;
}

const FIXED = {
  boe_mpc: new Map([["MPC decision and minutes", { title: "Bank Rate decision", detail: "Monetary Policy Committee decision and minutes" }]]),
  obr: new Map([["OBR Economic and fiscal outlook", { title: "Economic and fiscal outlook", detail: "Office for Budget Responsibility forecasts" }]]),
  hm_treasury: new Map([["HM Treasury Budget", { title: "Budget", detail: "Date announced by HM Treasury" }]]),
  desnz_fuel: new Map([["Weekly road fuel prices", { title: "Weekly road fuel prices", detail: "Official weekly price update" }]]),
};

// Returns { title, detail, derived }. `derived` is false when the original title is kept.
export function shortEventTitle(event) {
  const original = typeof event?.title === "string" ? event.title : "";
  let result = null;
  try {
    if (event?.source === "ofgem_energy") result = ofgem(original);
    else if (event?.source === "ons") result = ons(original);
    else if (Object.hasOwn(FIXED, event?.source)) result = FIXED[event.source].get(original) ?? null;
  } catch { result = null; }
  return result ? { ...result, derived: true } : { title: original, detail: null, derived: false };
}
