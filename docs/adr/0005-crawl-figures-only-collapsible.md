# ADR 0005: A figures-only crawl that can be folded away

Status: accepted, 19 November 2026. Supersedes decision 2 of ADR 0003 (the MPC
item, AI headline and its factual fallback); decisions 1 and 3 of ADR 0003 stand.

## Context

The crawl appears under the header on every page. Its first item was the MPC
line, but the overview shows the same MPC line directly below the crawl, so the
home page said it twice. The owner also wanted numbers first, and wanted to be
able to get the strip out of the way or slow it down: the crawl is constant
motion above every page, which is tiring on a phone.

## Decision

1. **Official figures only.** The MPC item (both the AI headline and the factual
   Bank Rate wording) is removed. The crawl holds only figures from the verified
   snapshot, with no AI text. Bank Rate stays as an ordinary figure item. The
   one-line MPC summary remains on the overview (`mpcLine`).
2. **Collapsible.** A leading "Figures" button with a chevron folds the strip
   (`aria-expanded`, controlling the strip). Folded, it is a slim static bar
   with the label and the two headline figures, Inflation and Bank Rate, read
   from the same items as the crawl (a missing one is simply left out). There
   is no close button: it can always be opened again.
3. **Speed.** A button next to pause cycles Slow (0.5x), Normal (1x), Fast (2x),
   then Slow again, by scaling the loop duration; Normal is the existing
   reading speed. Pause stays its own button (WCAG 2.2.2). With reduced motion
   the strip stays static and neither pause nor speed shows.
4. **Remembered per device.** Collapsed, paused and speed are kept in
   `localStorage` under `finstats.crawl`. Every read and write is guarded, so
   blocked, full or corrupt storage gives the defaults and the strip still
   works. Nothing is sent anywhere.
5. **Touch first.** Every control is a 44 px tap target; the strip is 44 px high.

## Consequences

- The home page no longer repeats the MPC line, and the AI report is no longer
  an input to the crawl (it is still fetched for the overview and Economy).
- The crawl contains no AI-written words, so the AI tag in the crawl is gone.
- On a 360 px screen the three controls take about half the width; the folded
  bar is the way to give the figures the whole line.
- A reader who folds the crawl keeps it folded on later visits on that device;
  clearing site data resets it.
