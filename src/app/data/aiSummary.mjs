// Presentation helpers for the AI summary (ADR 0002). They only arrange the AI text
// for reading: nothing is rewritten, reworded or dropped, so the sentences returned
// always rejoin (single-spaced) to the original summary.

// Words that end in a full stop without ending the sentence. Compared in lower case,
// without the stop.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sir", "st", "mt", "jr", "sr", "gen", "gov", "sen", "rep", "hon", "rev",
  "vs", "etc", "inc", "ltd", "corp", "approx", "est", "fig", "figs", "vol", "dept", "cf", "no",
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

import { shortDate, shortDay } from "./format.mjs";

/**
 * When the AI wrote this summary: the report's own `generated_at` when it has a usable
 * one, otherwise the file-level time (`metadata.generated_at`). Null when neither is
 * known, so no date is ever invented.
 */
export function aiWrittenAt(report, fileTime = null) {
  for (const value of [report?.generated_at, fileTime]) {
    if (shortDate(value)) return value;
  }
  return null;
}

/** "AI summary written 15 Nov 2026", or "AI summary date not recorded". */
export function aiWrittenLabel(report, fileTime = null) {
  const date = shortDate(aiWrittenAt(report, fileTime));
  return date ? `AI summary written ${date}` : "AI summary date not recorded";
}

/** "AI · 15 Nov" for the overview line, or null when no time is known. */
export function aiWrittenShort(report, fileTime = null) {
  const day = shortDay(aiWrittenAt(report, fileTime));
  return day ? `AI · ${day}` : null;
}

const MONTH_YEAR = { month: "long", year: "numeric", timeZone: "UTC" };

/** The publication's name without a date: "Monetary Policy Summary and minutes". */
export function publicationTitle(report) {
  const source = String(report?.source ?? "");
  const lower = source.toLowerCase();
  const isFsr = lower.includes("financial-stability-report") || report?.key === "financial_stability_report";
  if (isFsr) return lower.includes("opening-remarks") ? "Financial Stability Report opening remarks" : "Financial Stability Report";
  if (lower.includes("opening-remarks") && (lower.includes("/monetary-policy-report/") || report?.key === "monetary_policy_report")) {
    return "Monetary Policy Report opening remarks";
  }
  if (lower.includes("/monetary-policy-report/")) return "Monetary Policy Report";
  if (lower.includes("monetary-policy-summary-and-minutes")) return "Monetary Policy Summary and minutes";
  return "Monetary Policy Committee publication";
}

export const MPC_LINE_MAX = 160;
const MPC_HEADLINE_WORDS = 20;

/** Shortens text to at most `max` characters at a word boundary, ending with an ellipsis. */
export function truncateCleanly(text, max = MPC_LINE_MAX) {
  const source = String(text ?? "").replace(/\s+/g, " ").trim();
  if (source.length <= max) return source;
  const room = source.slice(0, max - 1);
  const cut = room.lastIndexOf(" ");
  const kept = (cut > max / 2 ? room.slice(0, cut) : room).replace(/[\s,;:–—-]+$/, "");
  return `${kept}…`;
}

/**
 * The one-line MPC summary for the overview: the report's optional AI `headline`, or
 * the first sentence of its summary when there is none (or it is unusable). Returns
 * null when there is no Monetary Policy report, so the line is hidden.
 */
export function mpcLine(reports, { max = MPC_LINE_MAX } = {}) {
  const report = (Array.isArray(reports) ? reports : []).find((item) => item?.key === "monetary_policy_report");
  if (!report) return null;
  const headline = typeof report.headline === "string" ? report.headline.replace(/\s+/g, " ").trim() : "";
  // A headline is one short sentence: a multi-sentence or wordy one is unusable, so the summary's first sentence is used.
  const oneLine = headline && headline.length <= max && splitSentences(headline).length === 1 && headline.split(" ").length <= MPC_HEADLINE_WORDS;
  if (oneLine) return { text: headline, source: "headline" };
  const first = splitSentences(report.summary)[0];
  if (!first) return null;
  return { text: truncateCleanly(first, max), source: "summary" };
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
