# ADR 0004: Progressive disclosure of technical detail

Status: accepted, 18 November 2026. Refines ADR 0001 (dense ledger); ADR 0001's
fixed row order (Key figure, What it means, Chart, Sources) stands.

## Context

The owner found subject pages long and wordy, especially on mobile. Every row
showed everything: series codes, model names, base periods, per-series check
timestamps and caveats. Typical example: the gilt Sources text ("Bank of England
Database nominal par yields (IUDSNPY, IUDMNPY and IUDLNPY), fitted with its
Variable Roughness Penalty term-structure model…"). The information is needed
for trust, but most readers need one or two plain sentences. Generic template
labels ("What to look for") added length without meaning.

## Decision

1. **One plain answer is visible; detail is one tap away.** Each "What it means"
   keeps at most two short plain-English sentences visible. Methodology, codes,
   base periods, revision notes and caveats move into a disclosure.
2. **The disclosure is a native `<details>`/`<summary>`.** It opens on tap or
   click, works with the keyboard and screen readers, and needs no script. The
   summary shows a small "?" glyph plus a short label saying what is inside
   ("How it's measured", "Source details"). It is never hover-only (hover does
   not exist on touch screens and hides content from keyboard users) and never
   a floating popover (these clip on small screens). It expands inline, with a
   brief height and opacity transition that is off under reduced motion.
3. **Sources collapse to one line.** The row reads "Bank of England · checked
   18 Nov" (publisher and last check) and expands to the full source list.
4. **Labels must carry meaning.** Key figures name exactly what they are (for
   example "10-year gilt yield"). Values display at the precision a reader
   needs (2 decimal places for yields and rates); exact values stay in the
   chart's table. Eyebrow labels that only decorate are removed.

## Consequences

- Pages get much shorter; nothing is deleted, and trust detail stays one tap
  away.
- Tests that assert technical wording must look inside the disclosure.
- Readers who want everything must open several disclosures; Sources detail is
  printed in full when the page is printed (`<details>` opened for print).
