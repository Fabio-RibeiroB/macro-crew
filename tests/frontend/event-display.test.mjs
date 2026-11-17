import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateParts, daysUntil, eventTime, publisherTag, relativeDayLabel, shortEventTitle } from "../../src/app/data/eventDisplay.mjs";

const ev = (source, title) => ({ source, title });
const OFGEM_TITLE = "Ofgem price cap level announcement due by 25 November 2026; Ofgem may publish earlier (effective period 1 January 2027 to 31 March 2027)";

test("Ofgem price cap title becomes a short title with the dates carried in the detail", () => {
  assert.deepEqual(shortEventTitle(ev("ofgem_energy", OFGEM_TITLE)), {
    title: "Energy price cap announcement",
    detail: "Due by 25 Nov · may be earlier · covers 1 Jan to 31 Mar 2027",
    derived: true,
  });
  // A period that crosses a year keeps both years.
  const crossing = shortEventTitle(ev("ofgem_energy", "Ofgem price cap level announcement due by 25 August 2026; Ofgem may publish earlier (effective period 1 October 2026 to 31 March 2027)"));
  assert.equal(crossing.detail, "Due by 25 Aug · may be earlier · covers 1 Oct 2026 to 31 Mar 2027");
});

test("short titles for each known event type", () => {
  const cases = [
    ["boe_mpc", "MPC decision and minutes", "Bank Rate decision"],
    ["obr", "OBR Economic and fiscal outlook", "Economic and fiscal outlook"],
    ["hm_treasury", "HM Treasury Budget", "Budget"],
    ["desnz_fuel", "Weekly road fuel prices", "Weekly road fuel prices"],
    ["ons", "Consumer price inflation, UK: June 2027", "Inflation (CPI and CPIH)"],
    ["ons", "GDP monthly estimate, UK: May 2027", "Monthly GDP estimate"],
    ["ons", "UK Labour Market: July 2027", "Jobs and unemployment"],
    ["ons", "Employee earnings in the UK: 2027", "Pay and earnings"],
    ["ons", "Earnings and working hours: 2027", "Pay and earnings"],
    ["ons", "Private rent and house prices, UK: October 2026", "Private rents and house prices"],
    ["ons", "Index of Private Housing Rental Prices, UK: September 2026", "Private rents"],
    ["ons", "UK House Price Index: August 2026", "House prices"],
  ];
  for (const [source, title, expected] of cases) {
    const result = shortEventTitle(ev(source, title));
    assert.equal(result.title, expected, title);
    assert.equal(result.derived, true, title);
    assert.ok(result.detail, `${title} has detail`);
  }
  assert.equal(shortEventTitle(ev("ons", "Consumer price inflation, UK: June 2027")).detail, "Covers June 2027");
  assert.equal(shortEventTitle(ev("ons", "Employee earnings in the UK: 2027")).detail, "Covers 2027");
  assert.equal(shortEventTitle(ev("ons", "GDP monthly estimate, UK")).detail, null);
});

test("unrecognised or changed wording keeps the original title and invents nothing", () => {
  for (const [source, title] of [
    ["ons", "GDP monthly estimate, UK corrected"],
    ["ons", "Producer price inflation, UK"],
    ["ons", "Consumer price inflation, UK: June 2027 (revised)"],
    ["boe_mpc", "MPC decision and minutes (special meeting)"],
    ["ofgem_energy", "Ofgem price cap level announcement due by 25 November 2026"],
    ["ofgem_energy", OFGEM_TITLE.replace("25 November", "31 Febtober")],
    ["somebody_new", "Anything at all"],
    ["hasOwnProperty", "Anything at all"],
  ]) {
    assert.deepEqual(shortEventTitle(ev(source, title)), { title, detail: null, derived: false }, title);
  }
  assert.deepEqual(shortEventTitle({}), { title: "", detail: null, derived: false });
  assert.deepEqual(shortEventTitle(null), { title: "", detail: null, derived: false });
});

test("relative day labels use whole London calendar days", () => {
  const at = (iso) => new Date(iso);
  assert.equal(relativeDayLabel("2026-11-17", at("2026-11-17T00:30:00Z")), "Today");
  assert.equal(relativeDayLabel("2026-11-18", at("2026-11-17T09:00:00Z")), "Tomorrow");
  assert.equal(relativeDayLabel("2026-11-25", at("2026-11-17T09:00:00Z")), "in 8 days");
  assert.equal(relativeDayLabel("2026-11-16", at("2026-11-17T09:00:00Z")), null);
  assert.equal(relativeDayLabel("not a date", at("2026-11-17T09:00:00Z")), null);
  assert.equal(relativeDayLabel(undefined), null);
});

test("relative day labels across midnight and clock changes", () => {
  // BST ends 01:00 UTC on 25 Oct 2026 (a 25 hour day). 23:30 UTC on 24 Oct is 00:30 BST on 25 Oct.
  assert.equal(relativeDayLabel("2026-10-25", new Date("2026-10-24T23:30:00Z")), "Today");
  assert.equal(relativeDayLabel("2026-10-26", new Date("2026-10-24T23:30:00Z")), "Tomorrow");
  // After the change London is on GMT: 23:30 UTC on 25 Oct is still 25 Oct, 00:30 UTC on 26 Oct is 26 Oct.
  assert.equal(relativeDayLabel("2026-10-26", new Date("2026-10-25T23:30:00Z")), "Tomorrow");
  assert.equal(relativeDayLabel("2026-10-26", new Date("2026-10-26T00:30:00Z")), "Today");
  // Clocks go forward at 01:00 UTC on 29 Mar 2026 (a 23 hour day). 23:30 UTC on 28 Mar is still 28 Mar (GMT);
  // 23:30 UTC on 29 Mar is 00:30 BST on 30 Mar.
  assert.equal(relativeDayLabel("2026-03-29", new Date("2026-03-28T23:30:00Z")), "Tomorrow");
  assert.equal(relativeDayLabel("2026-03-30", new Date("2026-03-28T23:30:00Z")), "in 2 days");
  assert.equal(relativeDayLabel("2026-03-30", new Date("2026-03-29T23:30:00Z")), "Today");
  assert.equal(relativeDayLabel("2026-03-29", new Date("2026-03-29T23:30:00Z")), null);
  // Counts across the changes are calendar days, not 24 hour blocks.
  assert.equal(daysUntil("2026-03-31", new Date("2026-03-27T23:30:00Z")), 4);
  assert.equal(daysUntil("2026-10-31", new Date("2026-10-23T22:30:00Z")), 8);
  // Summer midnight: 23:30 UTC in July is 00:30 next day in London.
  assert.equal(relativeDayLabel("2026-07-02", new Date("2026-07-01T23:30:00Z")), "Today");
  assert.equal(relativeDayLabel("2026-07-01", new Date("2026-07-01T23:30:00Z")), null);
});

test("date block parts and time", () => {
  const now = new Date("2026-11-17T09:00:00Z");
  assert.deepEqual(dateParts("2026-11-25", now), { weekday: "Wed", day: "25", month: "Nov", year: null, full: "Wednesday, 25 November 2026" });
  assert.equal(dateParts("2027-01-05", now).year, "2027");
  assert.equal(dateParts("2027-01-05", now).day, "5");
  assert.equal(eventTime({ time: "2026-12-17T12:00:00Z" }), "12:00");
  assert.equal(eventTime({ time: "2026-07-21T06:00:00Z" }), "07:00");
  assert.equal(eventTime({ time: null }), null);
});

test("publisher tags map every calendar provider and fall back for unknown ones", () => {
  const expected = { ons: "ONS", boe_mpc: "Bank of England", ofgem_energy: "Ofgem", desnz_fuel: "DESNZ", obr: "OBR", hm_treasury: "HM Treasury" };
  const tones = new Set();
  for (const [source, label] of Object.entries(expected)) {
    const tag = publisherTag(source);
    assert.equal(tag.label, label);
    assert.ok(tag.name.length >= label.length);
    tones.add(tag.tone);
  }
  assert.equal(tones.size, 6, "each publisher has its own colour tone");
  for (const unknown of ["hm_land_registry", "", undefined, null, "toString", "__proto__"]) {
    assert.deepEqual(publisherTag(unknown), { label: "Official", name: "Official source", tone: "other" });
  }
});

test("every tag tone has light and dark colours with at least 4.5:1 text contrast", () => {
  const css = readFileSync(new URL("../../src/styles/events.css", import.meta.url), "utf8");
  const channel = (hex, i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const [light, dark] = [css.match(/^\.fs-root \{([^}]*)\}/m)[1], css.match(/^\.dark \.fs-root \{([^}]*)\}/m)[1]];
  const tones = ["ons", "boe", "ofgem", "desnz", "obr", "hmt", "other"];
  for (const [name, block] of [["light", light], ["dark", dark]]) {
    for (const tone of tones) {
      const fg = new RegExp(`--fs-tag-${tone}-fg:\\s*(#[0-9a-f]{6})`, "i").exec(block)?.[1];
      const bg = new RegExp(`--fs-tag-${tone}-bg:\\s*(#[0-9a-f]{6})`, "i").exec(block)?.[1];
      assert.ok(fg && bg, `${name} ${tone} tokens exist`);
      assert.ok(ratio(fg, bg) >= 4.5, `${name} ${tone} contrast ${ratio(fg, bg).toFixed(2)}`);
    }
  }
  // Every publisher tone is wired to the tokens.
  for (const tone of tones) assert.match(css, new RegExp(`data-tone="${tone}"`));
});
