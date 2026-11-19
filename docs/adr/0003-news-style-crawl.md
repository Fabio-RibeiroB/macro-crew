Superseded in part by ADR 0005 (the MPC-first item).

# ADR 0003: A news-style crawl with an AI MPC headline

Status: accepted, 18 November 2026. Supersedes decision 3 of ADR 0002 (the
figures ticker); the rest of ADR 0002 stands.

## Context

The owner reviewed the figures ticker shipped under ADR 0002 and clarified what
they meant: not a market-data ticker of codes and arrows ("CPI 3.5% ▲0.4pp"),
but a news-channel crawl of short plain-English items, such as "Inflation: 3.5%,
up from 3.1%" and "MPC:" followed by a one-line summary of the latest decision.
The factual Bank Rate wording ("raised to 4.00% (tightening)") does not say what
the Committee decided or why. The owner chose the AI one-line MPC headline for
the crawl, clearly tagged as AI.

## Decision

1. **Plain-English items.** Each official figure reads as a short phrase:
   a plain label, the value and the change in words, for example
   "Inflation: 3.5%, up from 3.1%", "Unemployment: 5.0%, unchanged",
   "House prices: £273,037, up £891". Direction colour (ADR 0002, decision 1)
   still applies to the change words. Values come from the same verified
   overview rows; missing values are skipped, never zero.
2. **The MPC item is the AI headline, tagged.** "MPC:" is followed by the same
   one-line AI text as the overview MPC line (the report `headline`, or its first
   sentence), with a visible "AI" tag and a link to the full AI summary. It is
   never a number source. When no AI report is available, the item falls back to
   the factual Bank Rate wording from official data ("MPC: held Bank Rate at
   4.00%"), without the tag.
3. Motion, pause, reduced motion and screen-reader behaviour are unchanged.

## Consequences

- AI text now appears on every page, so its label must stay visible in the
  crawl; a reader can always tell AI words from official figures.
- The AI report is fetched on every page (about 4 KB), not only on Overview and
  Economy.
- A stale or failed AI run leaves the last published headline; the factual
  fallback covers a missing report.
