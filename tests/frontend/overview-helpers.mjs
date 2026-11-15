import { readFileSync } from "node:fs";
// Overview indicator-table helpers for SSR assertions (not a test file).
/** Map of row id to row markup, e.g. rows(html)["bank-rate"]. */
export function overviewRowsOf(html) {
  return Object.fromEntries(
    [...html.matchAll(/<tr id="overview-([a-z-]+)">([\s\S]*?)<\/tr>/g)].map(([, id, markup]) => [id, markup]),
  );
}
/** Visible text of a markup fragment, whitespace collapsed. Screen-reader-only text is included. */
export const textOf = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const FIXTURES = new URL("../fixtures/verified/", import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
/** All nine overview measures with real values, merged from the recorded producer generations. */
export function fullFixture() {
  const data = load("producer-pay-v1.json");
  data.metrics.household_energy = load("producer-energy-v1.json").metrics.household_energy;
  const fuel = load("producer-fuel-v1.json");
  data.metrics.petrol_price = fuel.metrics.petrol_price;
  data.metrics.diesel_price = fuel.metrics.diesel_price;
  return data;
}
