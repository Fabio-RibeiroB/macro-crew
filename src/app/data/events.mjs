const SOURCES = {
  ons: { calendar: "https://www.ons.gov.uk/releasecalendar", host: "www.ons.gov.uk" },
  boe_mpc: { fetch: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", calendar: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", host: "www.bankofengland.co.uk" },
  obr: { fetch: "https://obr.uk/publications/", calendar: "https://obr.uk/publications/", host: "obr.uk" },
  hm_treasury: { fetch: "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date", calendar: "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date", host: "www.gov.uk" },
  desnz_fuel: { fetch: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices", calendar: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices", host: "www.gov.uk" },
  ofgem_energy: { fetch: "https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026", calendar: "https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap", host: "www.ofgem.gov.uk" },
};
const INDICATORS = new Set([
  "uk.bank_rate.daily", "uk.road_fuel.unleaded_petrol_price", "uk.road_fuel.diesel_price", "uk.energy_price_cap.typical_dual_fuel_bill", "uk.public_debt.net_debt_gdp",
  "uk.cpi.annual_rate", "uk.cpih.annual_rate", "uk.gdp.monthly_growth", "uk.regular_pay.nominal_annual_growth", "uk.regular_pay.real_annual_growth", "uk.unemployment.rate", "uk.private_rent.annual_growth", "uk.private_rent.monthly_level", "uk.house_price.average_level", "uk.house_price.annual_change",
]);
const EXPECTED = {
  boe_mpc: ["uk.bank_rate.daily"],
  desnz_fuel: ["uk.road_fuel.unleaded_petrol_price", "uk.road_fuel.diesel_price"],
  ofgem_energy: ["uk.energy_price_cap.typical_dual_fuel_bill"],
  obr: ["uk.public_debt.net_debt_gdp"],
  hm_treasury: ["uk.public_debt.net_debt_gdp"],
};
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validDate = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validInstant = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
function check(condition) { if (!condition) throw new Error("Invalid official events data"); }
function officialUrl(value, source, event = false) {
  try {
    const url = new URL(value);
    const expected = SOURCES[source];
    if (!expected || url.protocol !== "https:" || url.username || url.password || url.port || url.hostname !== expected.host) return false;
    if (!event) return value === expected.calendar;
    if (source === "ons") return /^\/releases\/[a-zA-Z0-9/_-]+$/.test(url.pathname) && !url.search && !url.hash;
    return value === expected.fetch;
  } catch { return false; }
}
function validateProvider(name, provider) {
  check(SOURCES[name] && isObject(provider));
  check(["ok", "stale", "unavailable", "unqualified"].includes(provider.status));
  check(["qualified", "unqualified"].includes(provider.qualification));
  check(provider.status !== "ok" || provider.qualification === "qualified");
  check(provider.status !== "unqualified" || provider.qualification === "unqualified");
  check(provider.status === "unqualified" || provider.qualification !== "unqualified" || ["stale", "unavailable"].includes(provider.status));
  if (provider.retrieved_at != null) check(validInstant(provider.retrieved_at));
  check(typeof provider.calendar_url === "string" && officialUrl(provider.calendar_url, name));
  if (typeof provider.source_url === "string") {
    let allowed = false;
    try {
      const u = new URL(provider.source_url);
      allowed = name === "ons"
        ? u.protocol === "https:" && !u.username && !u.password && !u.hash && u.hostname === "api.beta.ons.gov.uk" && u.port === "" && u.pathname === "/v1/search/releases" && /^limit=1000&offset=0&sort=release_date_asc&fromDate=\d{4}-\d{2}-\d{2}&toDate=\d{4}-\d{2}-\d{2}$/.test(u.search.slice(1))
        : provider.source_url === SOURCES[name].fetch;
    } catch { /* rejected below */ }
    check(allowed);
  } else check(false);
  const events = provider.events ?? [];
  check(Array.isArray(events) && events.length <= 1000);
  if (provider.status === "unqualified" || provider.status === "unavailable") check(events.length === 0);
  if (provider.status === "ok" || provider.status === "stale") check(validInstant(provider.retrieved_at));
  for (const event of events) validateEvent(event, name);
  return events;
}
function validateEvent(event, source) {
  check(isObject(event) && event.source === source && typeof event.id === "string" && event.id.length > 0 && event.id.length <= 500);
  check(typeof event.title === "string" && event.title.trim().length > 0 && event.title.length <= 240);
  check(validDate(event.date) && ["scheduled", "rescheduled", "cancelled", "published"].includes(event.status));
  if (source === "desnz_fuel") check(event.status === "published");
  if (source === "ofgem_energy") {
    const match = /^Ofgem price cap level announcement due by (\d{1,2} [A-Z][a-z]+ \d{4}); Ofgem may publish earlier \(effective period (\d{1,2} [A-Z][a-z]+ \d{4}) to (\d{1,2} [A-Z][a-z]+ \d{4})\)$/.exec(event.title);
    const titleDate = match && new Date(`${match[1]} 12:00:00Z`);
    const eventDate = new Date(`${event.date}T12:00:00Z`);
    check(match && event.status === "scheduled" && event.time == null && event.time_precision === "date" &&
      Number.isFinite(titleDate.getTime()) && titleDate.toISOString().slice(0, 10) === event.date &&
      Number.isFinite(Date.parse(`${match[2]} 12:00:00Z`)) && Number.isFinite(Date.parse(`${match[3]} 12:00:00Z`)) &&
      Date.parse(`${match[2]} 12:00:00Z`) <= Date.parse(`${match[3]} 12:00:00Z`) && Number.isFinite(eventDate.getTime()));
  }
  check(officialUrl(event.source_url, source, true));
  if (event.time == null) check(event.time_precision === "date");
  else {
    check(validInstant(event.time) && event.time_precision === "minute");
    check(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(event.time)) === event.date);
  }
  check(Array.isArray(event.linked_indicators) && event.linked_indicators.length > 0 && event.linked_indicators.every((id) => INDICATORS.has(id)));
  if (EXPECTED[source]) check(JSON.stringify(event.linked_indicators) === JSON.stringify(EXPECTED[source]));
  if (source === "ons") {
    const title = event.title.replace(/\s+/g, " ").trim();
    const inflation = ["uk.cpi.annual_rate", "uk.cpih.annual_rate"];
    const labour = ["uk.regular_pay.nominal_annual_growth", "uk.regular_pay.real_annual_growth", "uk.unemployment.rate"];
    const earnings = labour.slice(0, 2);
    const rent = ["uk.private_rent.annual_growth", "uk.private_rent.monthly_level"];
    const housing = ["uk.house_price.average_level", "uk.house_price.annual_change"];
    let wanted = [];
    if (/^Consumer price inflation(?:,|:|\b)/i.test(title)) wanted = inflation;
    else if (/^GDP monthly estimate(?:,|:|\b)/i.test(title)) wanted = ["uk.gdp.monthly_growth"];
    else if (/^UK Labour Market(?:,|:|\b)/i.test(title)) wanted = labour;
    else if (/^(?:Employee earnings in the UK|Earnings and working hours)(?:,|:|\b)/i.test(title)) wanted = earnings;
    else if (/^Private rent and house prices, UK(?:,|:|\b)/i.test(title)) wanted = [...rent, ...housing];
    else if (/^Index of Private Housing Rental Prices, UK(?:,|:|\b)/i.test(title)) wanted = rent;
    else if (/^UK House Price Index(?:,|:|\b)/i.test(title)) wanted = housing;
    check(event.id === `ons:${new URL(event.source_url).pathname}` && wanted.length > 0 && JSON.stringify(wanted) === JSON.stringify(event.linked_indicators));
  }
}

export function validateEventsPayload(payload) {
  check(isObject(payload) && payload.schema_version === 1 && payload.mode === "official" && validInstant(payload.checked_at));
  check(isObject(payload.providers) && Object.keys(payload.providers).length === Object.keys(SOURCES).length && Object.keys(SOURCES).every((name) => Object.hasOwn(payload.providers, name)) && Array.isArray(payload.events) && payload.events.length <= 1000);
  const fromProviders = new Map();
  for (const [name, provider] of Object.entries(payload.providers)) {
    for (const event of validateProvider(name, provider)) fromProviders.set(event.id, event);
  }
  const ids = new Set();
  for (const event of payload.events) {
    validateEvent(event, event?.source);
    check(!ids.has(event.id)); ids.add(event.id);
    const providerEvent = fromProviders.get(event.id);
    check(providerEvent && JSON.stringify(providerEvent) === JSON.stringify(event));
  }
  check(payload.events.length === fromProviders.size);
  return payload;
}

export async function loadEvents(baseUrl = "/", fetcher = fetch) {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const manifestResponse = await fetcher(`${root}data/events-manifest.json`, { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("Calendar data unavailable");
  const manifestBytes = await manifestResponse.arrayBuffer();
  check(manifestBytes.byteLength <= 16_384);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  check(isObject(manifest) && manifest.schema_version === 1 && manifest.mode === "official" && /^[a-f0-9]{64}$/.test(manifest.sha256));
  check(manifest.data_url === `event-generations/${manifest.sha256}.json`);
  const payloadResponse = await fetcher(`${root}data/${manifest.data_url}`, { cache: "no-store" });
  if (!payloadResponse.ok) throw new Error("Calendar data unavailable");
  const bytes = await payloadResponse.arrayBuffer();
  check(bytes.byteLength <= 2_000_000);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  check(digest === manifest.sha256);
  return validateEventsPayload(JSON.parse(new TextDecoder().decode(bytes)));
}

const londonDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export function upcomingEvents(events = [], { now = new Date(), limit = Infinity, indicatorIds = null } = {}) {
  const currentInstant = now.getTime();
  const todayLondon = londonDay(now);
  return [...new Map(events.map((event) => [event.id, event])).values()]
    .filter((event) => event.status !== "published" && (event.time ? Date.parse(event.time) >= currentInstant : event.date >= todayLondon))
    .filter((event) => !indicatorIds || event.linked_indicators.some((id) => indicatorIds.includes(id)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ? Date.parse(a.time) : -Infinity) - (b.time ? Date.parse(b.time) : -Infinity) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function eventsAreStale(payload, now = new Date(), maxAgeMs = 24 * 60 * 60 * 1000) {
  return !payload || now.getTime() - Date.parse(payload.checked_at) > maxAgeMs || Object.values(payload.providers).some((p) => p.status === "stale");
}
