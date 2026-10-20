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
| `/sources` | Definitions, provenance, revisions, checks and distinctions between fact, forecast and interpretation |

Jobs/pay and housing do not yet have dedicated pages: the verified dataset does
not cover them. The economy page explains that limitation. New coverage should
add evidence and useful explanations before adding an empty navigation category.

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
All links are root-relative, matching current root deployment. Hosting under a URL
subdirectory would need coordinated base/link changes. Unknown paths show a useful
not-found page; the static fallback still returns HTTP 200 (no server-side routing).
Page titles and current-navigation indicators update after app load.

Old homepage anchors `#overview`, `#figures` and `#everyday` still work. `#decisions`
replaces to `/economy#interest-rates`, `#reports` to `/economy#publications`,
`#trends` to `/economy#trends`, and `#sources` to `/sources`. Replacement avoids an
extra dead history step. Fragment targets are followed after React renders, and once initial data arrives,
so late-mounted sections and changed card heights do not strand an old link at the
top of the page. Same-page fragment links still use browser history. No production URL
configuration is changed by this PR.

## Accessibility and checks

Mobile navigation uses a labelled button with `aria-expanded` and `aria-controls`,
large link targets and Escape-to-close/focus-return. Desktop navigation stays
visible, with `aria-current`. There is a keyboard skip link, one H1 per page,
visible focus, reduced-motion support and saved theme preference.

Node tests check routes, legacy anchors and actual server-rendered React pages,
including missing data and not-found states, using Vite's existing TSX transform
(no extra test framework). Existing data-contract tests remain. Browser validation
covers direct URLs, links/back/forward, refresh, old anchors, source/AI archive,
chart presence, small/mobile/desktop layouts, menu/theme and failed data loading.
