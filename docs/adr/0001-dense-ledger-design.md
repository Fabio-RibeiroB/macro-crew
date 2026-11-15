# 0001 — Dense ledger design for FinStats

Status: accepted, 15 November 2026 (owner decision on issue #86)

## Context

After recovery in November 2026 the owner found the layout confusing across the
board. M8 slice 1 produced three mocked directions: A "Steady" (current look,
larger figures), B "Statement" (dense ledger) and C "Topic colour" (one colour per
subject). The owner prefers dense pages with just the information and little
decoration, so more is visible at once.

## Decision

Adopt direction B, the dense ledger:

- Overview: a ledger listing all nine headline measures in their agreed order,
  each row with name, official value, reference period, comparison and a one-line
  definition shown inline. No card grid, no decorative bands or illustrations.
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
