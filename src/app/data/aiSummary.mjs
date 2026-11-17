// Presentation helpers for the AI summary (ADR 0002). They only arrange the AI text
// for reading: nothing is rewritten, reworded or dropped, so the sentences returned
// always rejoin (single-spaced) to the original summary.

// Words that end in a full stop without ending the sentence. Compared in lower case,
// without the stop.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sir", "st", "mt", "jr", "sr", "gen", "gov", "sen", "rep", "hon", "rev",
  "vs", "etc", "inc", "ltd", "corp", "approx", "est", "fig", "figs", "vol", "dept", "cf",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);
// "e.g", "i.e", "U.K", "p.m": letters separated by stops (the final stop is the one tested).
const DOTTED = /^(?:[A-Za-z]\.)+[A-Za-z]$/;

const OPENERS = /^[A-Z0-9“"‘'(\[£$€]/;

/** True when the full stop after `word` is part of the word rather than the end of a sentence. */
function isNonTerminal(word) {
  if (!word) return false;
  const bare = word.replace(/^[("“‘'\[]+/, "");
  if (/^[A-Z]$/.test(bare)) return true; // an initial, as in "J. Smith"
  if (DOTTED.test(bare)) return true; // "e.g", "U.K"
  return ABBREVIATIONS.has(bare.toLowerCase());
}

/**
 * Splits text into sentences. A sentence ends at . ! or ? (with any closing quote or
 * bracket) followed by whitespace and a capital letter, digit, quote or bracket.
 * Decimals ("3.5%"), abbreviations ("Mr.", "e.g."), initials and "U.K." never split.
 * When unsure the text stays together, so the split can only under-divide.
 */
export function splitSentences(text) {
  const source = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!source) return [];
  const sentences = [];
  const boundary = /([.!?]+)([”"’')\]]*) /g;
  let start = 0;
  let match;
  while ((match = boundary.exec(source))) {
    const end = match.index + match[1].length + match[2].length;
    const next = source.slice(boundary.lastIndex);
    if (!OPENERS.test(next)) continue;
    if (match[1] === "." && !match[2]) {
      const before = source.slice(start, match.index);
      const word = before.slice(before.lastIndexOf(" ") + 1);
      if (isNonTerminal(word)) continue;
    }
    sentences.push(source.slice(start, end));
    start = boundary.lastIndex;
  }
  if (start < source.length) sentences.push(source.slice(start));
  return sentences;
}

/** The lead sentence in bold and the remaining sentences as short points. */
export function summaryParts(text) {
  const [lead = "", ...points] = splitSentences(text);
  return { lead, points };
}

const MONTH_YEAR = { month: "long", year: "numeric", timeZone: "UTC" };

/** The publication's name without a date: "Monetary Policy Summary and minutes". */
export function publicationTitle(report) {
  const source = String(report?.source ?? "");
  if (source.includes("/monetary-policy-report/")) return "Monetary Policy Report";
  if (source.includes("monetary-policy-summary-and-minutes")) return "Monetary Policy Summary and minutes";
  if (source.includes("financial-stability-report") || report?.key === "financial_stability_report") return "Financial Stability Report";
  return "Monetary Policy Committee publication";
}

/** The publication name with its month, for the note: "March 2026 Monetary Policy Summary and minutes". */
export function publicationName(report) {
  const title = publicationTitle(report);
  const date = report?.report_date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return title;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return title;
  return `${parsed.toLocaleDateString("en-GB", MONTH_YEAR)} ${title}`;
}
