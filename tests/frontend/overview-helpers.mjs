// Overview indicator-table helpers for SSR assertions (not a test file).
/** Map of row id to row markup, e.g. rows(html)["bank-rate"]. */
export function overviewRowsOf(html) {
  return Object.fromEntries(
    [...html.matchAll(/<tr id="overview-([a-z-]+)">([\s\S]*?)<\/tr>/g)].map(([, id, markup]) => [id, markup]),
  );
}
/** Visible text of a markup fragment, whitespace collapsed. Screen-reader-only text is included. */
export const textOf = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
