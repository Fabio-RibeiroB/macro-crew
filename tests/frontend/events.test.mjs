import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eventsAreStale, loadEvents, upcomingEvents, validateEventsPayload } from "../../src/app/data/events.mjs";
import { createRefreshController, refreshView } from "../../src/app/data/refresh.mjs";

const event = (id, date, time, status = "scheduled", source = "boe_mpc", indicators = ["uk.bank_rate.daily"], title = "MPC decision and minutes") => ({
  id, title, date, time, time_precision: time ? "minute" : "date", status, source,
  source_url: source === "boe_mpc" ? "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates" : source === "ons" ? `https://www.ons.gov.uk${id.slice(id.indexOf(":") + 1)}` : source === "hm_treasury" ? "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date" : source === "ofgem_energy" ? "https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026" : "https://www.ons.gov.uk/releases/gdp",
  linked_indicators: indicators,
});
const payload = (events) => {
  const ons = events.filter((item) => item.source === "ons");
  const mpc = events.filter((item) => item.source === "boe_mpc");
  return { schema_version: 1, mode: "official", checked_at: "2026-03-28T12:00:00Z", providers: {
    ons: { status: "ok", qualification: "qualified", retrieved_at: "2026-03-28T12:00:00Z", calendar_url: "https://www.ons.gov.uk/releasecalendar", source_url: "https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-03-28&toDate=2027-03-28", events: ons },
    boe_mpc: { status: "ok", qualification: "qualified", retrieved_at: "2026-03-28T12:00:00Z", calendar_url: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", source_url: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", events: mpc },
    obr: { status: "unqualified", qualification: "unqualified", source_url: "https://obr.uk/publications/", calendar_url: "https://obr.uk/publications/", events: [] },
    hm_treasury: { status: "unqualified", qualification: "unqualified", source_url: "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date", calendar_url: "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date", events: [] },
    desnz_fuel: { status: "unqualified", qualification: "unqualified", source_url: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices", calendar_url: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices", events: [] },
    ofgem_energy: { status: "unqualified", qualification: "unqualified", source_url: "https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026", calendar_url: "https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap", events: [] },
  }, events };
};

test("event payload accepts official source evidence and rejects unsafe, mismatched or malformed records", () => {
  const valid = event("boe:mpc:2026-04-30", "2026-04-30", null);
  assert.equal(validateEventsPayload(payload([valid])).events.length, 1);
  assert.throws(() => validateEventsPayload(payload([{ ...valid, source_url: "https://evil.example/calendar" }])), /Invalid official events data/);
  assert.throws(() => validateEventsPayload(payload([{ ...valid, linked_indicators: ["uk.gdp.monthly_growth"] }])), /Invalid official events data/);
  assert.throws(() => validateEventsPayload(payload([{ ...valid, time: "2026-04-30T14:00:00", time_precision: "minute" }])), /Invalid official events data/);
  assert.throws(() => validateEventsPayload(payload([{ ...valid, time: "2026-04-30T23:00:00Z", time_precision: "minute" }])), /Invalid official events data/);
});

test("ONS family links require CPI wording and monthly GDP; producer inflation and quarterly GDP do not qualify", () => {
  const makeOns = (id, title, linked_indicators) => event(`ons:/releases/${id}`, "2026-04-30", null, "scheduled", "ons", linked_indicators, title);
  const monthly = makeOns("gdp", "GDP monthly estimate, UK", ["uk.gdp.monthly_growth"]);
  assert.equal(validateEventsPayload(payload([monthly])).events[0].title, monthly.title);
  const cpi = makeOns("consumer-prices", "Consumer price inflation, UK", ["uk.cpi.annual_rate", "uk.cpih.annual_rate"]);
  assert.equal(validateEventsPayload(payload([cpi])).events[0].title, cpi.title);
  assert.throws(() => validateEventsPayload(payload([makeOns("producer-prices", "Producer price inflation, UK", ["uk.cpi.annual_rate", "uk.cpih.annual_rate"])])), /Invalid official events data/);
  assert.throws(() => validateEventsPayload(payload([makeOns("inflation", "Inflation, UK", ["uk.cpi.annual_rate", "uk.cpih.annual_rate"])])), /Invalid official events data/);
  assert.throws(() => validateEventsPayload(payload([makeOns("quarterly-gdp", "GDP quarterly national accounts, UK", ["uk.gdp.monthly_growth"])])), /Invalid official events data/);
  assert.throws(() => validateEventsPayload(payload([makeOns("unemployment", "Labour market overview, UK", ["uk.regular_pay.nominal_annual_growth", "uk.regular_pay.real_annual_growth", "uk.unemployment.rate"])])), /Invalid official events data/);
});

test("ONS links mirror the producer's reviewed labour, earnings, rent and house-price families", () => {
  const cases = [
    ["labour", "UK Labour Market, October 2026", ["uk.regular_pay.nominal_annual_growth", "uk.regular_pay.real_annual_growth", "uk.unemployment.rate"]],
    ["earnings", "Employee earnings in the UK: 2026", ["uk.regular_pay.nominal_annual_growth", "uk.regular_pay.real_annual_growth"]],
    ["rent-house", "Private rent and house prices, UK: October 2026", ["uk.private_rent.annual_growth", "uk.private_rent.monthly_level", "uk.house_price.average_level", "uk.house_price.annual_change"]],
    ["rent", "Index of Private Housing Rental Prices, UK: September 2026", ["uk.private_rent.annual_growth", "uk.private_rent.monthly_level"]],
    ["house", "UK House Price Index: August 2026", ["uk.house_price.average_level", "uk.house_price.annual_change"]],
  ];
  for (const [id, title, links] of cases) {
    const value = event(`ons:/releases/${id}`, "2026-04-30", null, "scheduled", "ons", links, title);
    assert.equal(validateEventsPayload(payload([value])).events[0].title, title);
  }
});

test("provider qualification can advance while exact source binding remains enforced", () => {
  const value = payload([]);
  value.providers.obr = {
    status: "ok", qualification: "qualified", retrieved_at: value.checked_at,
    source_url: "https://obr.uk/publications/", calendar_url: "https://obr.uk/publications/", events: [],
  };
  assert.equal(validateEventsPayload(value).providers.obr.qualification, "qualified");
  value.providers.obr.source_url = "https://evil.example/publications/";
  assert.throws(() => validateEventsPayload(value), /Invalid official events data/);
});

test("ONS query and Ofgem fetch/calendar URLs stay bound to the producer contract", () => {
  const value = payload([]);
  const ofgemFetch = "https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026";
  const ofgemCalendar = "https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap";
  value.providers.ofgem_energy = {
    status: "ok", qualification: "qualified", retrieved_at: value.checked_at,
    source_url: ofgemFetch, calendar_url: ofgemCalendar, events: [],
  };
  assert.equal(validateEventsPayload(value).providers.ofgem_energy.qualification, "qualified");
  value.providers.ofgem_energy.source_url = `${ofgemFetch}?next=https://evil.example`;
  assert.throws(() => validateEventsPayload(value), /Invalid official events data/);
  value.providers.ofgem_energy.source_url = ofgemFetch;
  value.providers.ons.source_url = "https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-03-28&toDate=2027-03-28&extra=1";
  assert.throws(() => validateEventsPayload(value), /Invalid official events data/);
});

test("Ofgem events use the typical dual-fuel bill ID and exact announced-by deadline wording", () => {
  const sourceUrl = "https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026";
  const calendarUrl = "https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap";
  const deadline = {
    id: "ofgem:price-cap:2026-11-25", title: "Ofgem price cap level announcement due by 25 November 2026; Ofgem may publish earlier (effective period 1 January 2027 to 31 March 2027)",
    date: "2026-11-25", time: null, time_precision: "date", status: "scheduled", source: "ofgem_energy",
    source_url: sourceUrl, linked_indicators: ["uk.energy_price_cap.typical_dual_fuel_bill"],
  };
  const value = payload([deadline]);
  value.providers.ofgem_energy.status = "ok";
  value.providers.ofgem_energy.qualification = "qualified";
  value.providers.ofgem_energy.retrieved_at = value.checked_at;
  value.providers.ofgem_energy.events = [deadline];
  assert.equal(validateEventsPayload(value).events[0].linked_indicators[0], "uk.energy_price_cap.typical_dual_fuel_bill");
  const badDeadline = { ...deadline, title: "Ofgem price cap announcement due by 25 November 2026" };
  const badValue = payload([badDeadline]);
  Object.assign(badValue.providers.ofgem_energy, { status: "ok", qualification: "qualified", retrieved_at: badValue.checked_at, events: [badDeadline] });
  assert.throws(() => validateEventsPayload(badValue), /Invalid official events data/);
  value.events = [{ ...deadline, linked_indicators: ["uk.energy.price_cap"] }];
  value.providers.ofgem_energy.events = value.events;
  assert.throws(() => validateEventsPayload(value), /Invalid official events data/);
});

test("Government event links use the canonical net debt metric ID", () => {
  const fiscal = {
    id: "hm-treasury:autumn-budget:2026-11-04", title: "Autumn Budget", date: "2026-11-04",
    time: null, time_precision: "date", status: "scheduled", source: "hm_treasury",
    source_url: "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date",
    linked_indicators: ["uk.public_debt.net_debt_gdp"],
  };
  const official = payload([fiscal]);
  official.providers.hm_treasury = {
    status: "ok", qualification: "qualified", retrieved_at: official.checked_at,
    source_url: fiscal.source_url, calendar_url: fiscal.source_url, events: [fiscal],
  };
  assert.equal(validateEventsPayload(official).events[0].linked_indicators[0], "uk.public_debt.net_debt_gdp");
  official.events = [{ ...fiscal, linked_indicators: ["uk.public_debt.share_gdp"] }];
  official.providers.hm_treasury.events = official.events;
  assert.throws(() => validateEventsPayload(official), /Invalid official events data/);
});

test("DESNZ history dates must use published classification and stay out of upcoming lists", () => {
  const fuel = {
    id: "desnz:fuel:2026-03-20", title: "Weekly road fuel prices", date: "2026-03-20", time: null,
    time_precision: "date", status: "published", source: "desnz_fuel",
    source_url: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices",
    linked_indicators: ["uk.road_fuel.unleaded_petrol_price", "uk.road_fuel.diesel_price"],
  };
  const data = payload([]);
  data.providers.desnz_fuel = { status: "ok", qualification: "qualified", retrieved_at: data.checked_at,
    source_url: fuel.source_url, calendar_url: fuel.source_url, events: [fuel] };
  data.events = [fuel];
  assert.equal(validateEventsPayload(data).events[0].status, "published");
  assert.deepEqual(upcomingEvents([fuel], { now: new Date("2026-03-28T12:00:00Z") }), []);
  data.events = [{ ...fuel, status: "scheduled" }];
  data.providers.desnz_fuel.events = data.events;
  assert.throws(() => validateEventsPayload(data), /Invalid official events data/);
});

test("upcoming list sorts real instants and London dates, excludes expired and published events, and filters metric links", () => {
  const values = [
    event("late", "2026-03-29", "2026-03-29T10:00:00+01:00"),
    event("date-only", "2026-03-29", null),
    event("early", "2026-03-29", "2026-03-29T09:00:00+01:00"),
    event("old", "2026-03-28", null),
    event("published", "2026-03-29", null, "published"),
    event("gdp", "2026-03-30", null, "scheduled", "ons", ["uk.gdp.monthly_growth"]),
    event("cancelled", "2026-04-01", null, "cancelled"),
    event("gdp", "2026-03-30", null, "scheduled", "ons", ["uk.gdp.monthly_growth"]),
  ];
  const upcoming = upcomingEvents(values, { now: new Date("2026-03-29T00:30:00Z") });
  assert.deepEqual(upcoming.map(({ id }) => id), ["date-only", "early", "late", "gdp", "cancelled"]);
  assert.deepEqual(upcomingEvents(values, { now: new Date("2026-03-29T00:30:00Z"), indicatorIds: ["uk.gdp.monthly_growth"] }).map(({ id }) => id), ["gdp"]);
  assert.equal(upcomingEvents(values, { now: new Date("2026-03-29T00:30:00Z"), limit: 2 }).length, 2);
});

test("reader verifies immutable event generation SHA-256 before validating payload", async () => {
  const value = payload([event("boe:mpc:2026-04-30", "2026-04-30", null)]);
  const bytes = Buffer.from(JSON.stringify(value));
  const digest = createHash("sha256").update(bytes).digest("hex");
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options.cache]);
    return url.endsWith("events-manifest.json")
      ? { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify({ schema_version: 1, mode: "official", data_url: `event-generations/${digest}.json`, sha256: digest })) }
      : { ok: true, arrayBuffer: async () => bytes };
  };
  assert.equal((await loadEvents("/", fetcher)).events.length, 1);
  assert.deepEqual(calls, [["/data/events-manifest.json", "no-store"], [`/data/event-generations/${digest}.json`, "no-store"]]);
  const nestedCalls = [];
  await loadEvents("/preview/", async (url, options) => {
    nestedCalls.push([url, options.cache]);
    return url.endsWith("events-manifest.json")
      ? { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify({ schema_version: 1, mode: "official", data_url: `event-generations/${digest}.json`, sha256: digest })) }
      : { ok: true, arrayBuffer: async () => bytes };
  });
  assert.deepEqual(nestedCalls, [["/preview/data/events-manifest.json", "no-store"], [`/preview/data/event-generations/${digest}.json`, "no-store"]]);
  await assert.rejects(loadEvents("/", async (url) => url.endsWith("events-manifest.json")
    ? { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify({ schema_version: 1, mode: "official", data_url: `event-generations/${"0".repeat(64)}.json`, sha256: "0".repeat(64) })) }
    : { ok: true, arrayBuffer: async () => bytes }), /Invalid official events data/);
});

test("old successful checks are visibly stale even with healthy providers", () => {
  const data = payload([]);
  assert.equal(eventsAreStale(data, new Date("2026-03-29T12:00:01Z")), true);
  data.checked_at = "2026-03-29T12:00:00Z";
  assert.equal(eventsAreStale(data, new Date("2026-03-29T12:00:01Z")), false);
  data.providers.boe_mpc.status = "stale";
  assert.equal(eventsAreStale(data, new Date("2026-03-29T12:00:01Z")), true);
});

test("a failed independent event refresh retains the last accepted calendar", async () => {
  const saved = payload([event("boe:mpc:2026-04-30", "2026-04-30", null)]);
  const owner = createRefreshController({ initialData: saved, load: async () => { throw new Error("network"); } });
  await owner.refresh();
  const view = refreshView(owner.snapshot);
  assert.equal(view.data, saved);
  assert.ok(view.error);
});

test("event list presents source status, explicit cancellation and date-only values without a time", async () => {
  // Deliberately synthetic data stays in this UI fixture; it is never copied to public data.
  const fixture = payload([event("boe:mpc:2026-04-30", "2026-04-30", null, "cancelled")]);
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { EventList } = await server.ssrLoadModule("/src/app/components/EventList.tsx");
    const html = renderToStaticMarkup(createElement(EventList, { payload: fixture, loading: false, error: null, now: new Date("2026-03-28T12:00:00Z") }));
    assert.match(html, /Cancelled/);
    assert.match(html, /Thursday, 30 April 2026/);
    assert.doesNotMatch(html, /14:00|00:00/);
    assert.match(html, /Unqualified sources have not been checked for dated events/);
    assert.match(html, /href="https:\/\/www\.bankofengland\.co\.uk\/monetary-policy\/upcoming-mpc-dates"/);
    const empty = renderToStaticMarkup(createElement(EventList, { payload: { ...fixture, events: [] }, loading: false, now: new Date("2026-03-28T12:00:00Z") }));
    assert.match(empty, /No known upcoming dates are available/);
  } finally { await server.close(); }
});

test("Government route renders a qualified fiscal date linked to the canonical debt metric", async () => {
  const fiscal = {
    id: "hm-treasury:autumn-budget:2026-11-04", title: "Autumn Budget", date: "2026-11-04",
    time: null, time_precision: "date", status: "scheduled", source: "hm_treasury",
    source_url: "https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date",
    linked_indicators: ["uk.public_debt.net_debt_gdp"],
  };
  const official = payload([fiscal]);
  official.providers.hm_treasury = {
    status: "ok", qualification: "qualified", retrieved_at: official.checked_at,
    source_url: fiscal.source_url, calendar_url: fiscal.source_url, events: [fiscal],
  };
  validateEventsPayload(official);
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const html = renderToStaticMarkup(createElement(App, { pathname: "/government-budget", initialEvents: official }));
    assert.match(html, /Autumn Budget/);
    assert.match(html, /href="https:\/\/www\.gov\.uk\/government\/publications\/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date"/);
    assert.ok(html.indexOf("Autumn Budget") > html.indexOf("Public sector net debt"));
    assert.ok(html.indexOf("Autumn Budget") > html.indexOf("Start with who is affected"));
  } finally { await server.close(); }
});
