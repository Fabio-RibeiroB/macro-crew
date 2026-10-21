# Plain-English topic pages

This UI-only PR leaves collection, revision storage, AI generation and deployment
unchanged. It preserves the sage/cream branding, dark mode, source disclosures,
verified figures and existing lazy chart component.

## Pages and content

| URL | Purpose |
| --- | --- |
| `/` | Brief overview, three compact verified cards and links to household topics |
| `/prices` | Annual CPIH, what inflation means for spending power, the trend and sources |
| `/economy` | Bank Rate, monthly GDP, borrowing/saving and growth guides, relevant charts and earlier AI publication summaries |
| `/government-budget` | Reading taxes/spending announcements, start dates, affected groups, independent OBR forecasts and original publications |
| `/about` | Purpose, current UK coverage and the role of labelled AI summaries |
| `/sources` | Definitions, provenance, revisions, checks and distinctions between fact, forecast and interpretation |

The header links only to pages with working content: Overview, Prices, Economy
and Government. About and Sources stay in the footer. Jobs & Pay (`/jobs-pay`),
housing (`/housing`), calendar (`/calendar`) and separate wage or unemployment
URLs are not linked and are not pages yet. The economy page explains that
limitation. New coverage should add evidence and useful explanations before
adding an empty navigation category.

The Government page is explicitly an educational guide, not a fabricated current
Budget summary. Earlier AI summaries remain labelled, collapsible and linked to
original sources on the Economy page; they are not reattached to fresh statistics.
New source-grounded release explanations are still future work.

## Navigation choice

Use native document links and a small explicit pathname-to-page map, without a
routing library or client-side history interception. The browser owns navigation,
back/forward, link previews, opening in a new tab and refresh. Hashed assets cache
normally; only the relevant static JSON is fetched. Charts load only on the Prices
and Economy pages. Government/Sources fetch neither statistics nor AI archives.
A single app/data reader and reusable card/chart/archive components prevent
parallel data definitions. This trades a small document reload for simpler,
standard browser behaviour on this small static site.

Apache's existing SPA fallback must serve `index.html` for direct topic URLs.
All links are root-relative, matching current root deployment. Vite rejects a
non-root base rather than silently building broken subdirectory links. Known
trailing-slash URLs are replaced by their canonical paths, preserving query and
fragment. Unknown paths are not redirected. Subdirectory hosting remains unsupported. Unknown paths show a useful
not-found page; the static fallback still returns HTTP 200 (no server-side routing).
Page titles and current-navigation indicators update after app load.

Old homepage anchors `#overview`, `#figures` and `#everyday` still work. `#decisions`
replaces to `/economy#interest-rates`, `#reports` to `/economy#publications`,
`#trends` to `/economy#trends`, and `#sources` to `/sources`. Legacy matches are
case-insensitive and run on both initial load and subsequent hash changes. Query
parameters survive replacement; replacement avoids a dead history step.

Fragment scrolling runs once per navigation intent after React mounts, not when
data arrives. Native scroll anchoring handles normal layout changes; a slow
release never causes a second application-initiated jump back to the section.
Native back/forward remains in charge of full-document scroll restoration.

## Refresh ownership

The button and polling timer share one refresh controller. A newer request aborts
and supersedes the previous request. Late results cannot replace the newer data
or clear its loading state, even if a transport ignores abort. A 15-second deadline
settles independently of the transport, with distinct plain-English messages for
timeout, missing file, network, service and validation/integrity failures. Raw
parser diagnostics are not displayed. Last successfully loaded figures remain.

Page hiding cancels requests and polling; a restored back/forward-cache page resumes
them. React unmount removes listeners, deadlines and intervals and blocks late
state updates. The independent archived-summary fetch uses the same lifecycle
controls; its failure never affects the statistics.

## Intentional content moves and preserved access

* Trend charts belong on Prices and The Economy, keeping the overview concise.
* The work/business explanation remains in The Economy (`#work-and-businesses`).
* A short general-information/advice caption is present on every page.
* Both the main OBR site and its Economic and Fiscal Outlook are linked.
* Archived Monetary Policy Reports, MPC/monetary-policy commentary and Financial
  Stability Reports retain distinct labels and original sources.

## Accessibility and checks

The header collapses below 800px, the same breakpoint as `NAV_COLLAPSE_QUERY`.
The labelled button uses `aria-expanded` and `aria-controls`. While collapsed,
the closed menu is `hidden`, so its links are not in the tab order. Opening it
moves focus to the first link. Closing it while focus is inside, including when
the viewport becomes narrow, returns focus to the toggle. Escape does that
immediately. A click or focus move outside the header closes the menu without
pulling focus back. Desktop navigation stays visible, with
`aria-current` on the current header or footer link. There is a keyboard skip
link, one H1 per page, visible focus, reduced-motion support and saved theme
preference. The visible brand is finstats UK with a small flag; the plant mark
is not used.

Node tests exercise the actual refresh and event controllers with deferred
responses, an injected clock and EventTarget browser/document adapters. They cover
out-of-order responses, abort-ignoring transports, deadline races, cleanup, pagehide/
pageshow restoration, live legacy hashes, canonical URLs, scrolling intents,
menu dismissal, error kinds and archive labels. React server-rendering tests cover
all routes, missing data and not-found states, using Vite's existing TSX transform.
No new test/runtime dependency is required. These controller/SSR tests do not claim
to emulate browser layout; collaborative-browser checks cover the mounted page,
mobile controls, direct URLs, native back/forward, source/AI archive and loading.
