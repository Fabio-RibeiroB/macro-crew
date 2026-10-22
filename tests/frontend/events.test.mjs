import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eventsAreStale, loadEvents, upcomingEvents, validateEventsPayload } from "../../src/app/data/events.mjs";
import { createRefreshController, refreshView } from "../../src/app/data/refresh.mjs";

const event = (id, date, time, status = "scheduled", source = "boe_mpc", indicators = ["uk.bank_rate.daily"]) => ({
  id, title: "MPC decision and minutes", date, time, time_precision: time ? "minute" : "date", status, source,
  source_url: source === "boe_mpc" ? "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates" : "https://www.ons.gov.uk/releases/gdp",
  linked_indicators: indicators,
});
const payload = (events) => {
  const ons = events.filter((item) => item.source === "ons");
  const mpc = events.filter((item) => item.source === "boe_mpc");
  return { schema_version: 1, mode: "official", checked_at: "2026-03-28T12:00:00Z", providers: {
    ons: { status: "ok", qualification: "qualified", retrieved_at: "2026-03-28T12:00:00Z", calendar_url: "https://www.ons.gov.uk/releasecalendar", source_url: "https://api.beta.ons.gov.uk/v1/search/releases?limit=100&fromDate=2026-03-28&toDate=2027-03-28", events: ons },
    boe_mpc: { status: "ok", qualification: "qualified", retrieved_at: "2026-03-28T12:00:00Z", calendar_url: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", source_url: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", events: mpc },
    obr: { status: "unqualified", qualification: "unqualified", events: [] },
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
  assert.deepEqual(calls, [["/events-manifest.json", "no-store"], [`/event-generations/${digest}.json`, "no-store"]]);
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
