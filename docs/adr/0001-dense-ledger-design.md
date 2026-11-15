# 0001 — Dense ledger design for FinStats

Status: accepted, 15 November 2026 (owner decision on issue #86)

## Context

After recovery in November 2026 the owner found the layout confusing across the
board. M8 slice 1 produced three mocked directions: A "Steady" (current look,
larger figures), B "Statement" (dense ledger) and C "Topic colour" (one colour per
subject). The owner prefers dense pages with just the information and little
decoration, so more is visible at once — a modern, better-looking take on the
indicator tables used by economic-data sites such as Trading Economics. That is a
style reference only; FinStats keeps its own name, look and content.

## Decision

Adopt direction B, the dense ledger:

- Overview: a compact indicator table listing all nine headline measures in their
  agreed order, with aligned columns — name, latest official value, previous value,
  reference period, unit and comparison — and a one-line definition shown inline.
  Tabular figures, right-aligned numbers, subtle row dividers and hover states.
  No card grid, no decorative bands or illustrations.
- Polish comes from typography, alignment and spacing rather than ornament:
  crisp hierarchy, restrained colour (green/red only for direction of change,
  always paired with text or a sign), and a clean light and dark theme.
- Subject pages: a fixed label column marks the agreed order — Key figure, What it
  means, Chart, AI summary, Sources — so every page reads the same way.
- One typeface (Atkinson Hyperlegible Next), white/neutral surfaces, one accent
  green and rules for structure. The AI summary is the only visually distinct
  block (dashed outline) and keeps its "AI commentary, not checked against the
  official figures" label.
- Mobile keeps the same order; the label column stacks above each section.

## Consequences

- Definitions are visible inline, replacing the separate information control on
  homepage cards. The spec's card requirements are amended accordingly; the
  definition must still be short and must not navigate.
- The proposed 3×3 grid is dropped; the fold target (all nine values visible on a
  1366×768 desktop) still applies and is easier to meet with a ledger.
- Adds one web font; it must be self-hosted or loaded without new runtime
  dependencies, and text must stay readable at 320px and 200% zoom.
- Fewer visual cues for wayfinding than direction C; headings and the fixed label
  column carry that job. Revisit with a new ADR if browser review shows people
  get lost.
- Page restructure PRs (#87) follow this direction one page at a time.

## Owner review of the refined mock (15 November 2026)

Approved the indicator-table mock with these settings:

- Every value shows its unit with the number: `%` for rates, `£` for money,
  `p` for pence per litre, and the unit name where neither applies.
- No sparklines on the overview (spec unchanged).
- Change arrows are neutral; up/down is not coloured as good or bad.
- The change column is FinStats' own calculation and is footnoted as such.
- "GDP" stays as the headline name; the official series title is shown under
  Sources. The typeface's slashed zero is accepted.

## Owner changes during implementation (issue #87, 15 November 2026)

- The Unit column is removed. The unit sits next to every number instead: `4.00%`,
  `£273,037`, `£1,723/year`, `£1,406/month`, `174.57p`, and changes as `+0.25 pp`,
  `+£891`, `−0.71p`. This applies to the latest, previous and change columns, key
  figures, chart readouts and tables. `pp` is explained in the change footnote.
- The brand already says FinStats UK, so headings and labels do not repeat it. The
  overview heading is "Latest figures". Official series and source titles keep their
  full names, including "UK" where that is the official title.
- The neutral arrows decided above replace the Decision bullet that allowed green and
  red for direction of change. The Latest column keeps a faint tint, and the
  typeface is self-hosted (SIL Open Font License, files in `src/assets/fonts`).
