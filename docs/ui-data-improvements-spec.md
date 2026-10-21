# FinStats UK: UI, data and content specification

Status: **Draft for owner review — not approved for implementation.**

Date: 21 October 2026. Revision 2 incorporates the proposed owner amendments.
Earlier interview decisions are retained except where explicitly revised below.
Homepage substitutions, Jobs & Pay navigation and the gilt alternative remain
recommendations for owner review, not decisions already approved.
Approval of this specification authorises preparing modular GitHub issues; merges,
production activation and deployment remain separate actions.

## 1. Intended outcome

Visitors should see useful UK economic figures immediately on landing, understand
what each figure represents, and reach its detail in one click. Preserve the
existing visual identity for now while removing filler, unnecessary text and
unhelpful navigation. This is a focused improvement, not a complete redesign.

The finished project includes working official-data feeds for all nine headline
indicators, supporting Government statistics, a release calendar, release-driven
explanations and concise summaries of official announcements.
Layout placeholders are acceptable during development, not as completed feeds.

## 2. Branding and shared presentation

- Use **finstats UK** with a small, subtle UK flag. Remove the plant brand mark.
  Keep the UK scope in the document title as well as the visible brand.
- Retain green colours, current fonts, rounded cards and light/dark themes for now.
- Use consistent spacing, readable typography and restrained decoration.
- Remove rhetorical question headings and filler across all pages. Examples to
  remove include “Start with the numbers”, “Your everyday economy”, “Big economic
  news. Everyday meaning.” and “What is Bank Rate?”. Use direct metric/section names.
- Avoid repeated eyebrow/heading/description stacks that say the same thing.
- Keep necessary statistical distinctions, dates, units and failure notices.
  Move technical detail into expandable source/methodology sections.

## 3. Homepage

Content order: compact header/navigation, headline figures, upcoming dates, footer.
Remove the hero introduction, Quick read box and topic-exploration blocks.
No AI commentary or promotional copy is needed on the homepage.

### Everyday relevance review and recommended selection

Recommend replacing Public Debt and 10-year Gilt Yield on the homepage with
Household Energy and a combined Petrol & Diesel card, retaining nine cards.
This is an editorial recommendation based on direct household relevance, not
survey evidence about the audience's preferences.

Inflation describes purchasing power; Bank Rate affects borrowing and saving;
wages and unemployment describe income and work; rent and house prices cover
housing costs and access. Energy has a direct household-budget connection, and
pump prices provide a recognisable transport-cost measure for drivers. GDP stays
as the broad economic context. Public debt and yields are valuable for fiscal
policy context but less directly actionable for most visitors: retain both, with
full data/charts/explanations, on Government rather than dropping their feeds.

Trade-offs: fuel does not represent all transport spending, national housing
averages do not describe every local market, and Ofgem's illustrative bill is
neither an actual average bill nor a UK-wide maximum. Label these limitations.
The shared Prices page provides detail without adding more top-level pages.

Proposed headline order, preserving Inflation then Bank Rate:

1. Inflation
2. Bank Rate
3. Wages
4. Unemployment
5. Rent
6. House Prices
7. Household Energy
8. Petrol & Diesel
9. GDP

Each card contains a direct name, current value, reference period/date, meaningful
comparison and a small information control providing a brief definition. Wages
also shows its agreed after-inflation measure as secondary context. Petrol &
Diesel shows two separately labelled pence-per-litre values and comparisons,
never a blended fuel price. Both values count toward fold/readability acceptance.
Public Debt and yields do not appear as extra homepage cards. Cards do not
contain trend lines, long explanations or repeated official-data badges.

The main card link goes directly to its relevant page section. The information
control works independently: opening a definition must not navigate. Use valid
markup with no button nested inside an anchor. Definitions must work by keyboard,
touch and pointer, not hover alone; dismissal returns focus appropriately.

### Responsive acceptance

- At 1366×768 and 1440×900, all nine primary values and their names are visible
  without scrolling at normal zoom. Proposed layout: three columns, three rows.
- At 390×844, figures begin in the initial viewport. All nine may continue below
  the fold in their agreed order. Proposed layout: two columns, falling back to
  one where text would otherwise become cramped.
- At 320 CSS pixels and at 200% zoom, readable content and reflow take priority
  over fitting the desktop fold. No page-wide horizontal scrolling or truncation
  of essential values/units. Do not shrink text just to meet a fold target.
- These dimensions and column counts are proposed implementation defaults for
  review. Desktop/mobile layouts require browser validation with actual content.

## 4. Navigation and page structure

Recommended menu: **Overview, Prices, Housing, Jobs & Pay, Economy, Government,
Calendar**. Combining labour indicators reduces top-level navigation while keeping
distinct Wages and Unemployment sections directly accessible. This is a proposed
revision to the earlier separate-page decision. Use intuitive everyday language;
ampersands are acceptable when they improve readability, not prohibited by rule.
About and Sources belong in the footer.
Collapse navigation when it cannot fit; do not compress seven links into unreadable
text. Retain accessible menu state, dismissal, focus and current-page indication.

Proposed routes and homepage destinations:

- Overview: `/`.
- Prices: `/prices`; Inflation targets `#inflation`, Household Energy targets
  `#household-energy`, Petrol & Diesel targets `#petrol-diesel`.
- Housing: `/housing`; Rent targets `#rent`, House Prices targets `#house-prices`.
- Jobs & Pay: `/jobs-pay`; Wages targets `#wages`, Unemployment targets
  `#unemployment`. Neither requires an intermediate topic click. If separate
  `/wages` or `/unemployment` URLs have shipped, retain aliases to these sections.
- Economy: `/economy`; Bank Rate targets `#interest-rates`, GDP targets `#gdp`.
- Government: retain `/government-budget`; Public Debt targets `#public-debt`,
  gilt yield targets `#gilt-yields`.
- Calendar: `/calendar`. Footer: `/about` and existing `/sources`.

These are grouped subject pages, not nine separate metric pages. Each relevant
section leads with its figure and chart, then concise explanatory text, upcoming
release/event and official sources. Multi-indicator pages must not require users
to pass unrelated prose to reach the section they clicked.

Retain direct URL loading, native browser back/forward and existing documented
legacy URL/hash destinations, adding aliases when section IDs change. Anchor
targets must not be hidden under a sticky header.

## 5. Statistical definitions and display

Nine cards require more than nine underlying series. Government statistics remain
in scope despite their removal from the proposed homepage. Every headline,
secondary and supporting series needs the same provenance and validation.

### Inflation and Bank Rate

- Inflation: annual all-items **CPI**, ONS D7G7/MM23, monthly. Change from the
  previous reference month in percentage points. Retain CPIH L55O/MM23 alongside
  CPI on Prices with clear definitions; never relabel CPIH as CPI.
- Bank Rate: retain BoE IUDBEDR, annual percentage rate observed daily. Show the
  last actual rate change and its date, not “unchanged since yesterday”. A daily
  observation is not an MPC announcement. Do not infer a last-change date across
  missing history or pretend an observation date proves an announcement time.

### Wages and unemployment

- Wages: annual growth in seasonally adjusted regular average weekly earnings,
  excluding bonuses, for Great Britain, measured over the official three-month
  window. Show nominal growth first and official inflation-adjusted regular pay
  growth alongside it. Retain the geographic label **Great Britain**.
- Proposed real-pay default: ONS CPIH-adjusted measure, explicitly labelled;
  do not imply the CPI homepage headline is its deflator. Do not approximate real
  wage growth by subtracting the latest monthly inflation rate.
- Unemployment: ONS MGSX/LMS, seasonally adjusted rate for UK residents aged 16+.
  Show the full rolling three-month reference window. Keep the source's current
  quality caveats accessible beside the chart; never substitute claimant count.
- For both, compare the latest published reference window with the previous
  published window and label it explicitly; overlapping windows are not a
  non-overlapping quarterly change. Rate changes use percentage points.

### Housing

- Rent: official national annual private-rent growth as the primary value;
  average monthly rent in pounds on Housing as supporting context.
- House Prices: official national average house price in pounds as the primary
  value, annual percentage change alongside it. Chart both via clearly labelled
  controls or separate views; do not put pounds and percentages on one scale.
- Use ONS PIPR and UK HPI releases/downloads. Prefer UK coverage; if a supported
  measure is narrower, label its actual geography rather than implying UK-wide
  coverage. Respect different reference months and revision schedules.
- Use the broadest, simplest national coverage in this phase. No location
  selectors, regional exploration, postcode search or interactive maps.

### Household energy and road fuel

- Household Energy: use Ofgem's illustrative annualised dual-fuel bill at typical
  consumption, Direct Debit, default tariff, Great Britain. Show pounds/year,
  applicable cap period and change from the previous comparable cap period.
  The detail page shows gas/electricity unit rates and standing charges, payment
  assumptions, consumption basis and VAT treatment from the source.
- Explicitly label **Great Britain** and typical consumption. The cap limits
  tariff rates/standing charges; it is not a maximum household bill. Actual costs
  depend on use, tariff and region. Do not imply coverage of Northern Ireland,
  heating oil, fixed tariffs or every household's energy spending.
- Keep announcement date, effective date range and check time separate. An
  announced future cap may appear as upcoming context but must not replace the
  currently effective figure early. Effective-date activation changes evidence.
- Capture the source's typical-consumption assumptions with each observation.
  Check tax treatment and calculation-basis changes as well as consumption
  assumptions. If any of these change, flag the break and avoid an unqualified
  pound or percentage comparison. Show an adjusted like-for-like comparison only
  when the source provides an official, documented comparable basis. Otherwise
  state that the previous-period movement is not directly comparable.
- Petrol & Diesel: DESNZ weekly UK average retail pump prices, separately labelled
  unleaded petrol and diesel, in pence/litre, including the source's tax treatment.
  Compare each with the previous comparable weekly observation in pence/litre.
  Display the source observation/week date, not the FinStats check date.
- Prices contains both fuel series and energy history. Never blend petrol/diesel,
  use wholesale fuel as retail prices, or represent a national mean as a local
  forecourt quote. Validate source sampling/period definitions in qualification.
- Source basis: [DESNZ weekly UK pump prices](https://www.gov.uk/government/statistics/weekly-road-fuel-prices)
  and [Ofgem rates and standing charges](https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges).

### GDP, public debt and gilt yields

- GDP: retain ONS ECYX/MGDP, seasonally adjusted monthly real output growth.
  Label “monthly growth”; comparison is the percentage-point change in this
  growth rate from the previous month, not an annual GDP figure.
- Public Debt: public sector net debt excluding public sector banks as a
  percentage of GDP, ONS HF6X source family. Show month and previous-month
  percentage-point change. Explain the denominator and distinguish debt from
  borrowing/deficit and from net financial liabilities.
- 10-year Gilt Yield: proposed official series BoE **IUDMNPY**, daily 10-year
  nominal par yield. This is a fitted yield-curve measure, not necessarily the
  quoted yield on a specific benchmark bond. Name that distinction in details.
- Show yield change versus the previous available trading observation, with its
  date, preferably in basis points. Do not invent weekend observations.
- Government yield maturity coverage is subject to the qualification and owner
  decision below. Do not label a zero-coupon or forward rate as a par yield.
  Explain that yields indicate market financing conditions, not the average cost
  of all outstanding government debt.

### Gilt-yield qualification finding and approval gate

Checked 21 October 2026: the [BoE instrument catalogue](https://www.bankofengland.co.uk/boeapps/database/CategoryIndex.asp?CategId=6&CategName=INSTRUMENTS&Travel=NIxAZx)
lists nominal par-yield maturities of 5, 10 and 20 years. Its linked series pages
confirm daily **IUDSNPY (5-year), IUDMNPY (10-year), IUDLNPY (20-year)**. Matching
monthly averages/end-month series must not be mistaken for daily observations.

A consistent, routinely downloadable official **2-/10-/30-year nominal par-yield**
set has **not been qualified**. This is not a claim that no official document ever
contains a 2- or 30-year par yield. For example, DMO annual reviews include longer
par-curve observations, but report charts do not establish a maintained daily feed.
The BoE general curve downloads contain other yield concepts and are not evidence
that the requested par series exist. Do not synthesise or mix definitions to fill
those gaps.

**Recommended alternative for explicit owner approval:** Government presents
**5-, 10- and 20-year nominal par yields**, using the confirmed BoE daily family,
with 10-year visually primary. This preserves comparable definitions and retains
shorter/longer maturity context, but changes the requested maturities. Adoption
requires specific owner approval of this alternative, even if other work proceeds.

If 2/10/30 remains essential, a separate source-decision task must qualify either
an official same-definition 2/10/30 curve (accurately named, potentially spot rates)
or an official benchmark-gilt approach with explicit maturity/roll rules, history
and reuse rights. Present the findings and trade-offs for approval before coding
its adapter or UI. No silently substituted maturity, locally derived par curve or
zero-coupon/forward rate. Debt work is independent of this gate.

### Source qualification gate

Before coding each new adapter, record exact download endpoint, series/table,
definition, geography, unit, adjustment, period interpretation, release metadata,
history limits and revision handling. Commit representative recorded fixtures and
source receipts. Verify identifiers against actual official downloads; names
above are not a substitute for validating the source contract.

Remaining technical investigations: precise real-pay series, housing national
tables/endpoints, debt dataset/download, exact fuel/Ofgem download schemas and
reuse terms, the owner-approved gilt alternative, and reliable official calendar/
publication discovery formats. These are bounded implementation prerequisites, not permission to silently choose different metrics.
Report material gaps or unavailable coverage before changing the agreed scope.

## 6. Charts and explanations

- Range controls: 1 year, 5 years, 10 years, All; default five years.
- Filter relative to the latest available observation. Show all available points
  when history is shorter and disclose the actual range. Never fabricate history,
  interpolate missing observations or join incompatible series across a break.
- Use step rendering for Bank Rate and suitable consistent rendering elsewhere.
  Preserve gaps, units, full reference windows and revised-history labels. Energy
  uses effective cap periods and visible consumption-methodology breaks; weekly
  fuel keeps its own observation frequency.
- Provide exact dated values on interaction and an accessible text/table
  alternative. Distinguish nominal/real pay and each gilt maturity in the legend.
- Explain each metric briefly, why it matters, its limitations and release
  cadence. Avoid repetitive general guides and unsupported policy claims.

## 7. Upcoming dates and calendar

- Homepage shows the next five distinct official releases/events, chronologically,
  with date, name, official link and time only where officially confirmed.
- Full Calendar provides a chronological list of known upcoming dates; no complex
  month-grid UI or filtering is required for this phase.
- Cover releases for the homepage and supporting Government indicators, MPC
  decisions, announced Budgets/fiscal statements, OBR forecasts, weekly fuel
  releases, and Ofgem cap announcements/effective dates as distinct event types.
  Daily observations need not generate an event every day. One housing or labour release can cover several indicators.
- Use ONS release schedules, BoE MPC schedules, HM Treasury announcements and OBR
  publication schedules, plus DESNZ and Ofgem official schedules/announcements.
  Do not calculate assumed Budget dates or infer an MPC
  meeting from daily Bank Rate data.
- Store source, retrieval time, date/time precision, event identity and linked
  indicators. Display times in Europe/London with DST handled correctly.
- Deduplicate shared releases; handle changes, cancellations and date-only events.
  Unknown dates stay unknown. If fewer than five are known, show fewer.
- Retain previously fetched schedules on failure with a concise dated warning;
  do not silently present past events as upcoming. Link to the official calendar
  when future dates are unavailable.

## 8. Release-driven explanations and announcement summaries

### Indicator-release explanations

Each significant indicator release gets a short, evidence-grounded explanation
within its existing subject section, after the key data/chart. Proposed length:
2–4 short bullets, flexible enough to say little when little is new. Cover:

- What changed, using the exact measure, period, units and revision status.
- How it compares with recent comparable observations; distinguish a new result
  from revisions to older results and respect rolling windows/methodology breaks.
- Why it may matter to UK households, only as far as source evidence supports.
  Explain uncertainty or distributional limits rather than claiming all residents
  experience the same change.

No forced positive/negative story, generic filler or unsupported causal account.
An unchanged/low-information release can say that the latest reading adds little
new information, with the concrete comparison. It does not need to fill a quota
of bullets. Standard definitions remain static explanatory copy, not repeated AI.

Default significant-release policy for review: new scheduled CPI/CPIH, labour,
housing, GDP and public-finance releases, MPC publications and Ofgem cap
announcements/effective changes qualify, even when the headline is unchanged.
Group shared labour/housing releases into one evidence bundle but provide distinct
indicator explanations where appropriate. A routine daily Bank Rate or yield
observation is not an announcement and must not cause daily narrative generation.
For weekly fuel and daily yields, qualification defines versioned metric-specific
material-movement rules (unit, lookback, threshold, revision and missing-history
handling), with examples for owner review before enabling generation. No generic
one-size-fits-all percentage threshold, and no claim of statistical significance
without source support. Non-qualifying updates still publish numerical data.

### Official-announcement summaries

Economy integrates MPC decisions/minutes and Monetary Policy Reports; Government
integrates Budgets/material fiscal statements and OBR Economic and Fiscal Outlook
publications. Use roughly 3–5 short bullets covering decisions, main reasons and
material official forecasts. Attribute forecasts to their institution/speaker,
with horizon, units and material uncertainty. Clearly distinguish forecasts,
announced policy and measured results. AI must not invent its own predictions.
Upcoming meetings show dates and official links, not speculative summaries.

### Evidence, change detection and versioning

- Label output as an AI explanation/summary of official evidence. Show source
  publication/release date, statistical reference period, generation date and exact
  official links. Attach citations to claims/bullets when multiple sources apply.
- Build a bounded evidence bundle from validated statistics, comparable recent
  history, source revisions and relevant official release text. Retain definition
  versions, source receipts/hashes and the selected observations privately. The
  model may describe supplied numbers; it never becomes their source of truth.
- Compute a canonical semantic evidence fingerprint. Repeated fetches, check
  timestamps, HTML navigation changes, a new unrelated statistical generation or
  cosmetic source edits must not generate new explanations. Changes to relevant
  observations, revisions, definitions, cap effective periods or substantive
  official statements can qualify. Test this distinction explicitly.
- New scheduled releases with unchanged headlines can qualify because the period
  and supporting release evidence changed. Re-fetching that release does not.
  Model/prompt changes alone do not trigger scheduled regeneration; operator
  reprocessing is explicit, versioned and retains the earlier explanation.
- Retain immutable explanation versions with source/release identity, covered
  periods, relevant evidence fingerprint, generation time and supersession status.
  On corrections, regenerate only affected explanations and retain earlier dates.
- Publish independently from numbers. The UI checks that an explanation matches
  the relevant metric evidence, rather than requiring the same global generation
  ID. If a newer metric release arrives first, label the older explanation as
  covering its earlier period, with pending/unavailable for the new release.
  Never silently attach old text to new figures. Unrelated metric updates must
  not hide a still-compatible explanation.
- Latest relevant explanations are integrated inline. Older versions can be
  collapsed there; no separate archive page is required. Preserve legacy artifacts
  without presenting old archived prose as fresh release-driven output.

### Private automation

Use bounded official-source discovery and prefetched evidence. AI receives no
browsing, shell or file tools. Validate structured output, numerical references,
source attribution and citations before publishing escaped text. Reject unsupported
claims or links; keep the last valid version with its original dates. Automated
checks cannot establish every causal claim: include representative human-reviewed
examples in acceptance and prefer omission where evidence does not support a claim.
No arbitrary visitor-supplied URLs or visitor-triggered jobs.

Use a private scheduled worker independent of statistical collection. Deduplicate
before admission/paid calls, lock per evidence item and queue eligible releases.
Retain bounded execution, token/attempt limits, explicit paid-call opt-in and
private failure logs. Plan admission for several same-day releases: the legacy
one-attempt/day default cannot silently discard them. Keep an audited bounded
queue/batch policy, provider spending controls and no unbounded retries; do not
reset ledgers to bypass admission. Delayed commentary is an explicit supported
state, never a reason to delay statistics.

Publish commentary atomically with its own validated manifest and independent
refresh lifecycle. AI failure/disabled budget must not block figures/calendar.
Review service templates/operator configuration separately; do not enable
production AI or make paid calls during implementation or mocked tests.

## 9. About and Sources

About is a short footer-linked page explaining the purpose: a clear view of the
UK economy for residents, using official statistics and useful plain-English
context. State current geographic scope and the role of labelled AI summaries.
Do not invent ownership, endorsements or independence claims.

Sources retains detailed methodology, provenance, revision handling, statistical
limitations and the distinction between official figures and AI explanations.
Keep its links accessible from individual metric sections and the footer.

## 10. Architecture and delivery constraints

Follow CLAUDE.md, README.md and FRONTEND.md; this specification does not duplicate
or replace their shared operational guidance.

Extend `src/finstats` deterministic source contracts, storage and immutable public
delivery. The current reader hardcodes three percent-only metrics and monthly/day
periods. Version the shared contract as required for pounds, pence/litre, weekly
observations, cap effective intervals, consumption assumptions, multiple series,
rolling windows, geography and comparisons; migrate writer and reader together
with an explicit compatibility/cutover plan. Reject unknown/mismatched definitions.

Keep all metric cards/charts on the same verified generation. A metric collection
failure preserves its previous verified observations with visible degraded status;
a never-collected metric stays unavailable. Distinguish collection failure from
normal release cadence. Invalid payload/checksum failures retain the last accepted
generation rather than displaying unvalidated data.

Preserve independent refresh controllers and the documented lifecycle contract.
Use a shared metric presentation registry and reusable cards/sections rather than
nine bespoke implementations. Split page components out of the large App.tsx as
needed for this work; avoid unrelated rewrites or new frameworks.

Only add exact reviewed official hosts/endpoints to source validation as needed.
Keep raw evidence, databases, credentials and model traces outside public output.
No visitor-triggered collection, AI calls or backend API is introduced.

## 11. Demonstrable delivery milestones and modular PRs

These are proposed issue boundaries, not GitHub issues already created. Each
future issue carries context, exact scope, dependencies, interfaces, acceptance
criteria, validation and exclusions so a smaller model can work independently.
One PR per issue, below **5,000 changed lines** including tests, fixtures and docs;
aim for 200–1,200. Split any issue approaching the limit. Never omit tests/evidence
to fit the cap, and do not reformat unrelated files.

### Integration and production-compatibility gate at every milestone

Each milestone extends the previous functional product and ends with a tested,
production-compatible candidate, not a collection of disconnected components.
Implement vertical slices: an added feed includes its presentation, direct links,
source details and failure states before it is considered complete. Final chart
polish can follow, but newly exposed data must already be readable and usable.

- Prefer short PRs against integrated main, with dependencies already landed after
  authorised review. Limit an unavoidable stack to two dependent PRs; integrate
  and test it before starting another. No large stack spanning milestones.
- Run relevant checks per PR. At every milestone, test the combined frontend and
  dependency-light Python suite, build the real release artifact outside served
  paths, and validate a local/staged production-style deployment with public JSON,
  assets, direct URLs, navigation, themes and mobile/desktop layouts.
- Exercise previous-release and candidate data/schema combinations. During schema
  changes use a staged compatible-reader-first or versioned dual-delivery approach;
  explicitly test activation and rollback. Do not require simultaneous untested
  writer/frontend switches or leave deployed readers unable to read their data.
- Replay missing sources, malformed data and failed refreshes. Verify per-metric
  retention, calendar/commentary independence and no fixture-to-official promotion.
- Record integrated head SHA, test/build results, staging URL or reproducible
  local release validation, data compatibility and rollback steps in a milestone
  acceptance record. Periodically test live-source adapters read-only into private
  temporary state, separately from fixture replay; no paid AI is needed.
- Do not expose an empty future route, broken menu destination or permanent
  placeholder as a completed feature. An intermediate release may have fewer
  homepage cards than the final nine; retain existing working coverage and add
  new cards when their feed and section are ready. Genuine runtime outages retain
  the required unavailable/degraded states.
- Present a reviewable candidate at each milestone. Actual merge, deployment and
  production AI activation require instructions covering those actions. If
  production deployment is deferred, staging validation is still required and
  must not be described as production deployment. Do not defer all integration
  and deployment validation to the last milestone.

### M1 — A useful landing page using existing verified data

**Demonstration:** land directly on current Inflation (explicitly CPIH until M2),
Bank Rate and GDP, follow cards to useful sections, and read About/Sources.

Proposed issues/PRs:

1. Shared branding and concise shell: finstats UK/flag, responsive navigation,
   footer, About and purpose copy; expose only functioning routes.
2. Compact homepage and reusable cards: remove filler, independent information
   controls, meaningful Bank Rate comparison and direct section links; simplify
   current Prices/Economy headings. Retain accurate CPIH naming.
3. Shared chart ranges and accessible values: 1/5/10/All, five-year default,
   existing source history/gaps and units.

**Acceptance:** three real feeds remain functional; figures visible immediately;
old links/direct URLs and both themes work; no production data migration required.
Complete the shared milestone gate before expanding coverage.

### M2 — Prices, jobs and pay with a compatible data contract

**Demonstration:** CPI headlines Prices; Jobs & Pay contains distinct working
Wages and Unemployment sections reached directly from their homepage cards.

Proposed issues/PRs:

1. Qualify CPI/labour contracts and extend writer/reader compatibility for units,
   reference windows, geography and optional staged metric additions. Define the
   later weekly/effective-period interfaces without requiring unimplemented feeds.
   Commit a tested compatibility/activation plan; keep M1 data readable.
2. Add CPI end to end, retain CPIH as supporting data and update its definitions.
3. Add nominal/real regular pay end to end with full windows and Sources details;
   create Jobs & Pay with the wages anchor.
4. Add unemployment end to end, quality context and direct anchor in Jobs & Pay.

**Acceptance:** five headline cards backed by verified feeds, no CPI/CPIH relabeling,
no fabricated real-pay subtraction, no incorrect single-month labour labels.
Test compatible reader-first rollout and rollback at the shared milestone gate.

### M3 — Housing in one place

**Demonstration:** Rent and House Prices cards open their sections on Housing.

Proposed issues/PRs:

1. Qualify/add private rent growth and monthly pounds end to end; Housing route,
   chart, source definition, national geography and degraded states.
2. Qualify/add house-price level and annual change end to end on the same page;
   preserve vintages/revisions and independent reference months.

**Acceptance:** seven real headline cards; no regional scope invented; both
Housing links land correctly and distinguish levels from rates. Complete the
shared integration/release gate before adding more feeds.

### M4 — Energy and transport costs on the homepage

**Demonstration:** nine household-focused cards; Prices explains the energy cap
and shows separately labelled petrol/diesel history.

Proposed issues/PRs:

1. Qualify DESNZ weekly downloads/reuse and add both fuel series, pence/litre,
   dated comparisons, combined homepage card and Prices section.
2. Qualify Ofgem download/announcement formats and add effective cap periods,
   typical-consumption assumptions, unit/standing-charge detail, homepage card
   and Prices section. Keep current and announced future rates distinct.

**Acceptance:** final nine-card order and desktop fold targets pass with both fuel
values; GB energy coverage is explicit; future caps do not activate early;
consumption changes and missing weekly data cannot produce misleading comparisons.
Test mixed frequencies and effective-date rollover at the shared milestone gate.

### M5 — A working release calendar

**Demonstration:** next five known events below the homepage cards; Calendar
shows official upcoming releases and major meetings without duplicate entries.

Proposed issues/PRs:

1. Qualify official schedules and build private event collection/publication:
   source precision, stable IDs, shared releases, cancellations and retention.
2. Build Calendar and upcoming list, relevant-page next release context and
   official links; include energy announcement/effective-date distinctions.

**Acceptance:** calendar works without AI; fewer than five known events does not
invent entries; DST/date-only and stale schedules pass. Add supporting Government
release types as M6 feeds land. Complete the shared milestone gate.

### M6 — Supporting public finances and qualified yields

**Demonstration:** Government has debt/GDP and correctly labelled comparable yield
history, with official source links, while homepage remains household-focused.

Proposed issues/PRs:

1. Resolve gilt source decision: record actual 2/10/30 availability findings and
   capture reviewed contracts/fixtures for the owner-approved alternative. This
   is a source/owner gate, not authority to implement an unapproved substitution.
2. Qualify/add public debt end to end with definition, history, source and event
   linkage; this can proceed independently of the gilt-source decision.
3. Add the approved yield family end to end with consistent definitions,
   trading-day comparisons, clear observation dates and source limits.

**Acceptance:** debt and yield statistics are present on Government, not discarded
or reintroduced as homepage clutter. No mixed par/spot/forward comparison. The
candidate records the specific owner-approved maturity/definition decision and
passes the shared integration/release gate. An unresolved yield decision is
reported as incomplete scope rather than accepted as a placeholder.

### M7 — Grounded explanations that follow releases

**Demonstration:** release explanations appear beneath relevant charts and major
announcement summaries appear within Economy/Government, independently of figures.

Proposed issues/PRs:

1. Evidence pipeline: bounded official publication discovery, verified observation
   bundles, recent-trend/revision comparisons, semantic hashes and versioned
   significant-release/material-change rules. Include concrete owner-reviewed
   fuel/yield thresholds and unchanged-release examples before enabling them.
2. Independent summary worker/publication: validated structured explanations,
   source/numeric checks, immutable versions, dates, bounded queue/admission,
   deduplication and safe scheduling templates. Use mocked AI only in tests.
3. Integrate explanations and announcement summaries into existing pages:
   evidence compatibility, source links, official forecasts, dated previous text,
   pending states and retained inline history. No additional top-level page.
4. Representative content/failure review and operational handoff: check examples
   from each source family, little-new-information releases, revisions, concurrent
   arrivals, repeat fetches, AI-disabled/budget failure and rollback. Update About,
   Sources and the deployment runbook to match final behaviour. Include human-
   reviewed examples for (a) inflation slowing while the price level still rises,
   (b) an unemployment change across overlapping three-month windows, (c) revised
   earlier observations without a new reference period, (d) an Ofgem cap announced
   but not yet effective, and (e) an unchanged/low-information release. Check factual
   claims, source and period alignment, and restraint; do not require identical
   model wording.

**Acceptance:** every qualifying release can be explained with no invented story;
unchanged evidence causes no new model call; an unchanged headline in a genuinely
new release can receive a restrained explanation. No stale explanation is attached
to newer numbers and no AI failure interrupts numerical/calendar publication.
Finish the shared milestone gate with mocked AI and reviewed example outputs;
production paid execution remains an explicitly controlled activation step.

## 12. Release acceptance

- All nine headline cards and supporting Government feeds work against reviewed
  official sources; secondary measures, provenance and histories agree with their
  definitions. Homepage substitutions and Jobs & Pay reflect owner approval.
- Desktop numbers are visible immediately; mobile remains readable and begins
  with useful figures. Cards navigate correctly; info controls work independently.
- All subject pages, anchors, old links, direct URLs and browser history work.
- Calendar dates are official, deduplicated and correctly timed; unavailable time
  is not midnight and expired events are not upcoming.
- Explanation/summary tests demonstrate source/trend grounding, restrained output
  when little changed, correct attribution of forecasts, semantic-change triggering,
  retained dates/versions, no duplicate calls and independence from statistics.
- Human review covers the five representative release cases listed under M7 and
  checks factual accuracy, source/period alignment and restrained interpretation,
  not exact wording.
- Meaningful offline tests cover units, windows, gaps, revisions, partial failure,
  schema migration, checksums, release dates and AI-disabled/failure cases.
- Run documented frontend tests/build and dependency-light Python suite. Use mocks
  for paid AI; never publish fixture replay as official production data.
- Browser review covers desktop/mobile, keyboard/touch, themes, zoom, loading,
  no data, failed refresh, charts, calendar and sources.
- Every milestone has a demonstrated integrated candidate and acceptance record.
  A staged release/cutover plan verifies new-schema producer/consumer compatibility,
  actual assets/data/direct routes and rollback. Merging and deploying require
  their own explicit instruction under repository guidance.

## 13. Explicitly deferred

Regional maps/filters, local searches, personalised advice, accounts, alerts,
visitor-triggered AI, live intraday trading feeds, AI-generated forecasts,
additional homepage indicators and a wholesale visual redesign.

## 14. Owner decisions in this revision

The following recommendations are explicit amendments, not silent overrides:

1. Substitute Household Energy and Petrol & Diesel for Public Debt and 10-year
   Gilt Yield on the nine-card homepage; retain full supporting Government data.
2. Combine Wages and Unemployment under Jobs & Pay with distinct direct anchors.
3. Use 5/10/20-year nominal par yields as the documented official alternative
   because the desired 2/10/30 par family has not been qualified. This requires
   explicit owner approval of the substitution before yield implementation.

Release-driven explanations and milestone gates are incorporated as requested.
Exact fuel/yield material-movement policies and any source-definition changes
remain specific review gates during qualification, not guesses delegated to an
implementation model. Other milestones can progress without bypassing those gates.

## 15. Official references checked for this draft

- [CPI D7G7](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7).
- [Average weekly earnings](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/averageweeklyearningsingreatbritain/october2026).
- [Unemployment MGSX/LMS](https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms).
- [Private rent methodology](https://blog.ons.gov.uk/2025/04/01/how-we-measure-rental-price-inflation/).
- [Public sector finances](https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/bulletins/publicsectorfinances/latest).
- [BoE yield curves and definitions](https://www.bankofengland.co.uk/statistics/yield-curves).
- [DMO gilt data](https://www.dmo.gov.uk/data/gilt-market/).
- [BoE 5-year par series catalogue](https://www.bankofengland.co.uk/boeapps/database/FromShowColumns.asp?CategId=6&FromCategoryList=Yes&NewMeaningId=RNPY05).
- [BoE 10-year par series catalogue](https://www.bankofengland.co.uk/boeapps/database/FromShowColumns.asp?CategId=6&FromCategoryList=Yes&NewMeaningId=RNPY10).
- [BoE 20-year par series catalogue](https://www.bankofengland.co.uk/boeapps/database/FromShowColumns.asp?CategId=6&FromCategoryList=Yes&NewMeaningId=RNPY20).
- [DMO annual review: longer par-curve context, not a qualified daily feed](https://www.dmo.gov.uk/media/5rqb2scf/gar2024_final.pdf).
- [DESNZ weekly road fuel prices](https://www.gov.uk/government/statistics/weekly-road-fuel-prices).
- [Ofgem cap rates and standing charges](https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges).
- [Official MPC dates](https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates).
- [OBR Economic and Fiscal Outlook](https://obr.uk/efo/).

References establish the intended statistical families; exact downloads and source
contracts are qualified within the relevant milestone before implementing adapters.
No current numerical values are hardcoded in this specification.
