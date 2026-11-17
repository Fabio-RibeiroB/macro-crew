# ADR 0002: Direction colour, stronger contrast and a figures ticker

Status: accepted, 17 November 2026. Supersedes the "neutral change arrows" line of
ADR 0001's owner review; the rest of ADR 0001 stands.

## Context

After living with the dense ledger (ADR 0001), the owner found the site hard to
scan and dull: one green accent, low-contrast muted text, sections that run into
each other, links that do not look clickable, a plain list of upcoming dates and
long AI paragraphs. They asked for green and red on changes, clearer sections,
and a scrolling ticker in the style of financial news channels.

## Decision

1. **Change colour shows direction, not judgement.** A rise is green, a fall is
   red and no change is neutral, as on market data sites. Rising inflation or
   unemployment is therefore green too; the colour never means "good". The arrow
   and the sign stay, so meaning never depends on colour alone. Tokens:
   `--fs-up`, `--fs-down` and their soft backgrounds `--fs-up-bg`, `--fs-down-bg`,
   defined for light and dark with at least 4.5:1 text contrast.
2. **More contrast and structure.** Muted text is darkened, sections get clear
   headings and separation, and anything clickable looks clickable (underline or
   a chevron on hover and at rest for row links).
3. **A figures ticker** below the header scrolls the headline official figures
   (value plus coloured change) and one MPC item derived only from the official
   Bank Rate: "MPC: raised to 4.00% (tightening)", "cut … (loosening)" or "held
   … (on hold)" from the latest change. No AI text in the ticker. It pauses on
   hover and focus, has a pause button, does not move with
   `prefers-reduced-motion`, and screen readers get the items once as a list.
4. **AI summary wording.** The label says what the text is: an AI summary of the
   named Bank of England publication that can make mistakes, with a link to check
   the original. Long summaries are laid out for reading (bold lead sentence,
   short points) without changing a word of the AI text.

## Consequences

- Colour now carries a convention some readers may read as judgement; the
  ADR records that it is direction only, and the change footnote can say so.
- Motion is new to the site; reduced-motion users get a static strip.
- The overview keeps its table; the ticker repeats a subset of it by design.
