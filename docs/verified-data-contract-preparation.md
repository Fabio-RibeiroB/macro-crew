# Verified-data contract: #26 preparation

Status: **proposal for review; no schema implementation or activation**.
Prepared 21 October 2026 against `8f5083d1f05eeb995d01263816c1a66ca144caa8`.

The [canonical specification](ui-data-improvements-spec.md), especially sections
5, 10 and M2, owns product scope. [#26] owns live progress and dependencies. This
document supplies a concrete proposed interface and compatibility rehearsal; it
does not replace either source or claim source qualification is complete.

[#26]: https://github.com/Fabio-RibeiroB/macro-crew/issues/26
[#48]: https://github.com/Fabio-RibeiroB/macro-crew/issues/48

## Entry gate and preparation boundary

At inspection, #23, #24 and #25 are closed, but [#48] is open. Its Bank Rate
last-change correction is an M1 acceptance gap. Source research and contract
design can proceed now. Schema code, migration, rollout and new feeds wait until
#48 is integrated and the combined M1 candidate has an acceptance record under
the canonical milestone gate. Closed M1 implementation issues alone do not prove
acceptance. Recheck live issues and integrated main before implementation.

That record must identify the combined SHA, frontend/core checks, clean release
build, reproducible production-style route/data/assets and layout review,
compatibility and rollback. This preparation does not assert those checks passed.
No runtime, fixture, database, public JSON, service or deployment change accompanies
this document. Proposed field names below remain reviewable until #26 implements
and tests the contract; this is not an accepted ADR.

## Short implementation checklist and proposed PR boundaries

Updated from oversight's handoff: PR #49 addresses #48 but is unmerged and under
correction following real-data review. M1 acceptance and implementation release
belong to oversight thread `18d7abd2-585d-4833-a0ba-5897b9c3fb93`. Do not investigate
or duplicate that fix. This checklist supersedes the earlier preference for
mandatory v2/dual delivery below; the detailed source evidence remains unchanged.

### Facts, gaps and choices

- **Known facts:** source IDs, inspected endpoints/formats, A2FA's blank unit,
  MGSX's label-based windows and release-date timezone behavior are recorded in
  the source-evidence section. Existing M1 readers ignore extra metric keys;
  existing stored definitions require byte-identical serialization.
- **Qualification gaps:** package exact recorded bytes/receipts; resolve cross-year
  labels, pay ending-month semantics, direct A2FA/CPIH linkage, missing/withdrawn
  conventions, history/revision limits, population mapping and reuse exceptions.
  Reuse the completed research; do not repeat endpoint discovery. Record unknowns
  as unknowns, including `updateDate` semantics. A feed cannot start before its
  own material gaps are closed with evidence.
- **Proposed choices:** JSON for new ONS feeds; flat independently verified series;
  explicit full labour windows and geography; presentation-derived comparisons;
  and the additive compatibility approach below. These are design recommendations,
  not newly established source facts or permission to implement.

### Smallest compatibility approach to prove

Recommend testing an **additive extension of the existing v1 envelope first**.
Keep `data/current.json`, its checksum/immutable-generation flow and the three
core metric objects unchanged. Add only reviewed optional metric members, using
their explicit statistical definition versions and reference metadata. New readers
validate every included metric against registered definitions/units; old readers
ignore additional members and display only their unchanged three measures. An
old reader ignoring an unconsumed member must never imply that it verified or
displayed that member. No unregistered data is rendered by the new reader.

This uses the producer/reader behavior already observed; it still needs executable
compatibility proof. Do not add a new contract-revision flag merely to duplicate
existing envelope/definition versions. If a real supported consumer rejects the
additive extension, or a necessary core semantic/shape change emerges, use the
retained v2 dual-delivery fallback below. Oversight must accept this interpretation
of #26's compatibility requirement before implementation; no silent decision.

Avoid mandatory `reference` objects on unchanged core observations, a wire
`movement.method` taxonomy for rules already owned by presentation, permissive
future-unit registration, a universal population/basis object, or a SQLite
migration without demonstrated need. Keep necessary rolling-window metadata on
the new measures. Define weekly/effective-period requirements here, but leave their
runtime validators, rollover and energy basis handling to the qualified feed
slices. Retain one local presentation registry and preserve #48's final behavior.

### Implementation sequence after oversight releases the M1 gate

1. **First proposed PR — #26-A: qualify evidence and add compatible reader support.**
   Include this currently untracked document in that short-lived branch/PR; do
   not open a separate long-lived documentation approval PR. Preserve the shared
   root copy and explicitly copy it into an implementation worktree if used,
   because worktrees start from committed files. Do not commit on shared main.
   Package the remaining source evidence and lock the minimal contract, then add
   optional-metric validation/normalization while the production writer remains
   unchanged. No new feed collection, cards or routes.
   Files: this document; `tests/fixtures/official/README.md`, `receipts.json` and
   recorded responses as required; small labelled synthetic wire fixtures under
   `tests/fixtures/verified/`; `src/app/data/verified.mjs` and
   `tests/frontend/verified.test.mjs`. Touch `chartRange.mjs`,
   `HistoricalTrendCard.tsx` and their tests only where full-window display cannot
   be preserved through existing helpers. No planned `App.tsx` rewrite.
   New tests: actual M1 payload acceptance; absent optional members; valid added
   definitions; wrong IDs/units/geography/windows fail closed; MGSX-labelled
   fixture windows consistent with end-month keys, including year boundaries;
   exact full-window display; gaps and
   mismatched pay windows. Parser-specific BST/unit tests belong with the adapters
   below, including parsing MGSX labels into window keys. If those helpers are
   not implemented here, keep their tests there too.
2. **Second proposed PR — #26-B: producer compatibility and rollback proof.**
   Depends on #26-A's integrated reader and reviewed contract. Files:
   `src/finstats/publication.py`, `delivery.py`, and their Python tests; source/store
   changes only when required to preserve new snapshot metadata without altering
   existing serialization. Share labelled wire fixtures with frontend tests and
   update `docs/dashboard-cutover.md` with the proven procedure. Do not enable
   new official feeds or modify collection scheduling. New tests: old reader +
   candidate producer, new reader + old/candidate producer, frontend rollback,
   exact unchanged core definitions/figures/receipts, checksum/card-history
   identity, partial-source retention, fixture rejection/public-field privacy,
   and opening/replaying the existing store without changed hashes. Inject export
   and manifest-replacement failure; retain the prior generation. If additive
   delivery requires no producer code change yet, make this a focused executable
   compatibility/rollback slice rather than inventing export machinery.
3. **Then existing #27/#28/#29 own their vertical feeds.** Each depends on the
   integrated #26 contract and its qualified evidence. They own source parsers,
   collection/definition registration, storage round-trip, publication, reader
   registration, real UI/source/failure states and feed-specific tests. Include
   A2FA blank-unit exceptions, BST date conversion, source-window mapping and
   revisions there. Coordinate the Jobs & Pay page between #28/#29; no duplicate
   shell or schema framework. Reader support precedes producer emission for every
   new member. Later unit/weekly/effective-period adapters stay with later issues.

Before calling #26 complete, test the chosen approach's activation and rollback
on an integrated production-style candidate under the canonical milestone gate.
For additive delivery, no v2 fallback fetch, dual-pointer lock/prune mechanism or
two-channel acceptance matrix is needed. Never mix generations or per-metric
fallbacks. Keep the documented refresh lifecycle intact.

**Tracking proposal for oversight, not issues created:** use #26 as parent and
create exactly #26-A “Qualify CPI/labour evidence and extend the compatible reader”
and #26-B “Prove publisher/reader compatibility and rollback” if two PRs are needed.
Do not create feed implementation subissues overlapping #27–#29. Oversight decides
the additive-v1 approach versus evidence-required v2 fallback, and whether to track
these two slices separately. No other design approval round is proposed.

## What the existing code actually requires

- `sources.py`: three `Definition` entries, all `percent`; daily Bank Rate and
  monthly CPIH/GDP. `comparison` means the statistic's basis (`year_on_year`,
  `month_on_month`, `level_per_annum`), not the card's comparison algorithm.
  Observations contain `period`, decimal-text `value`, `status` and private row.
- `storage.py`: SQLite schema is already version 2, independently of public JSON
  version 1. Definitions are compared as complete serialized dataclasses; changing
  one in place stops opening the store. Snapshot semantic hashes, receipts,
  source-date/first-seen ordering and the v1 receipt migration depend on the
  existing serialization. The observation primary key is `(snapshot_id, period)`.
- `publication.py`: one DB read transaction selects metrics and health into an
  immutable private shadow generation; a manifest activates it afterward.
- `delivery.py`: accepts JSON version 1, validates stored definitions, projects
  only whitelisted fields and three metrics, excludes fixture evidence and private
  rows, trims public histories to five years, then atomically replaces the public
  manifest. Pruning understands only one root's active generation and `data.json`.
- `verified.mjs`: fetches `data/current.json`, verifies SHA-256 and JSON version 1,
  requires all three known definitions, percent units and day/month strings. It
  currently iterates known metrics rather than rejecting additional metric keys.
  Its link check allows two official hosts, not exact series-specific endpoints.
- `App.tsx`: owns the presentation topics and three-card order, percent formatting,
  previous-reading arithmetic and source disclosures. Charts use `chartPoints`,
  `chartRange.mjs` and `HistoricalTrendCard.tsx`; date formatting assumes day/month.
  Chart range controls cannot recover history omitted by the delivery exporter.

These constraints require a reviewed contract extension, but do not alone prove
that the enclosing JSON version must change. Changing a consumed core metric's
unit, treating rolling data as ordinary monthly data, or changing
`Definition` globally would not be a compatible additive release.

## Retained v2 design alternative and statistical requirements

The short checklist above now recommends proving additive v1 compatibility first.
The v2 envelope, mandatory core reference wrappers and movement fields below are
an earlier design alternative, not requirements for the first PR. Statistical
identity, units, full windows, provenance and failure rules still apply to any
consumed new measure. Future-feed descriptions are interface notes, not #26 code.

### Envelope, metric membership and definitions

Keep `generation_id`, UTC `published_at`, `mode: "official"`, and `metrics`.
Set payload and manifest `schema_version: 2`. Keep the manifest's fixed relative
`generations/<32-hex-id>/data.json` path and SHA-256 of the exact payload bytes.
Validate matching schema, generation and publication time before accepting data.

Keep metrics flat, one independently verified measure per key. The mandatory core
keys remain `bank_rate`, `cpih`, `gdp`. Proposed M2 additions are `cpi`,
`regular_pay_nominal_growth`, `regular_pay_real_growth`, `unemployment`.
These are application keys, distinct from official series IDs. The evidence below
identifies D7G7/MM23, KAI9/LMS, A2FA/LMS and MGSX/LMS; raw fixture capture and the
remaining interpretation checks still precede adapter implementation.

Each reader release explicitly registers the definitions it can accept. Core
entries must be present, possibly unavailable. Registered optional entries may be
absent during staged addition; normalize absence to an unavailable view, never a
zero. An included unavailable entry still needs its reviewed definition, with
`latest: null` and `history: []`. Reject unregistered keys, mismatched definitions,
unknown units/reference kinds and unsupported versions for the entire candidate
generation. Retain the previous accepted generation through the refresh controller.
Do not silently omit malformed optional data or let payloads define their own
validation rules. Feed PRs add registry support before their writer emits a key.

Retain existing definition identity fields: `metric_id`, `series`, `dataset`,
`title`, `frequency`, `adjustment`, `comparison`, `source_url`, `download_url`,
`unit`, `version`. Add explicit reviewed `geography`, `population`,
`reference_kind`, and `movement: { method, unit }`; add `window_months: 3` only
for rolling three-month measures. Real pay also declares `deflator: "CPIH"`.
`frequency` denotes publication/observation cadence, independently of window size.
`version` versions the statistical definition, not the enclosing JSON schema;
unchanged core definitions retain version 1. Validate the full statistical tuple
against code-owned contracts, including geography, population and deflator.

Initial observation unit is `percent`. Proposed later unit tokens are `gbp`
(house price), `gbp_per_month` (rent), `gbp_per_year` (illustrative energy bill),
`pence_per_litre` (fuel), `pence_per_kwh` and `pence_per_day` (energy detail).
Movement units are separately `percentage_points`, `basis_points`, or the relevant
level unit. Permit only combinations reviewed for a registered series. Describing
future tokens here does not register any future feed or activate its parser.

### Observation identity and reference periods

Retain `period`, `value`, `status`; add `reference` to every v2 history/latest
point. `value` remains finite decimal text or null; null requires `missing`, and a
number requires `observed`. Keep source row/sheet/column locators privately.
Use these bounded reference shapes, without a generic date-expression language:

- `day`: `{ kind: "day", date: "YYYY-MM-DD" }`; `period` equals that date.
- `month`: `{ kind: "month", month: "YYYY-MM" }`; `period` equals that month.
- `rolling_months`: `{ kind: "rolling_months", start_month: "YYYY-MM",
  end_month: "YYYY-MM" }`; `period` equals the end month. Validate exactly three
  inclusive consecutive months for the qualified labour measures. For MGSX, parse
  the source `label` as the authoritative window and derive the canonical end-month
  key from it. Preserve the original label and source `date` privately: `date` is
  the middle month, not the key or window end. For KAI9/A2FA, validate the separate
  ending-month convention against official notes; never share MGSX's mapping.
- Later `weekly_observation`: `{ kind: "weekly_observation", date: "YYYY-MM-DD" }`;
  `period` equals the official observation date. It does not assert a seven-day
  average. The qualified definition must explain the source's sampling/week basis;
  extend this reviewed variant if the actual source supplies an interval instead.
- Later `effective_interval`: `{ kind: "effective_interval", start_date:
  "YYYY-MM-DD", end_date: "YYYY-MM-DD" }`; both dates inclusive and `period`
  equals start date. Ordered applicable cap periods cannot overlap.

Reject invalid dates, conflicting duplicate keys, reversed windows and references
inconsistent with their definition or key. Sort by canonical `period`; validate
full equality of `latest` with its selected history point, including reference and
status. For M2, latest is the last observed history point and no future reference
is accepted. Preserve historical missing values and break charts across missing
expected periods. A rolling chart may locate a point at its end month, but its
tooltip, exact-value table and comparison must show the full window.

Before M4 emission, implement the effective-period rule: future announced intervals
can be retained in history but latest selects only the interval containing today's
Europe/London date. With no applicable verified interval set latest null and show
current coverage unavailable; do not use a future or expired cap. An accepted
effective-period snapshot may retain verified history with no currently applicable
point, distinct from a never-collected metric's empty unavailable snapshot. Keep
announcement/release dates separate. Rollover
must produce a newly selected generation; browsers must not switch figures using
their own clock independently of publication. This is an interface constraint,
not an energy scheduler implemented in #26.

### Comparisons and related measures

`comparison` continues to describe the source statistic. `movement.method` selects
a small, code-owned presentation rule over that metric's validated history:

- CPI, CPIH and GDP: `previous_reference_period`, consecutive month required,
  percentage-point difference. GDP remains a monthly growth rate.
- Nominal/real regular pay and unemployment: `previous_published_window`,
  percentage-point difference. Show both full windows and state that they overlap;
  never call it a non-overlapping quarter change. Use the previous reference window
  in the selected source vintage, not the preceding local collection receipt.
  A missing expected window makes the comparison unavailable.
- Bank Rate: `last_evidenced_rate_change`, percentage points and evidenced date.
  Carry #48's reviewed gap/insufficient-history behavior forward unchanged. Daily
  dates cannot establish MPC announcement times.
- Later fuel: `previous_comparable_observation`, pence/litre, both official dates;
  a missing week must not silently become an adjacent-week claim. Later cap: the
  same method over comparable effective periods. A consumption, tax or calculation
  basis change blocks an unqualified comparison unless official comparable evidence
  exists. Later yields: `previous_available_trading_observation`, basis points,
  dated; no invented weekend data and no unapproved maturity/definition choice.

Do not publish redundant precomputed deltas in #26. Presentation helpers derive
them from one validated generation with explicit unavailable reasons. Keep precise
decimal text for exact values; round only for display. The Python side uses
`Decimal`; frontend delta formatting must avoid binary floating-point artifacts.

Nominal and real pay, rent growth and pounds, house price and annual growth, and
petrol/diesel remain separate metric members with independent evidence and health.
Group them in the existing presentation registry; no parent observation, blended
fuel series, generic relationship graph or second generation fetch. For wages,
only present real growth as matching secondary context when its full window and
definition align with nominal pay. Otherwise retain its independently dated valid
figure in detail with an explicit mismatch/unavailable notice. Do not carry an old
real-pay value beside a new nominal window as if they match. Later house/rent
measures retain their own dates rather than forcing artificial alignment.

### Evidence, revisions and failure

Retain the current receipt/snapshot IDs, raw hash, parser version, evidence kind,
retrieval/check dates, source publication date/precision and next-release fields.
Only official-download snapshots enter official delivery. Validate source and
download URLs against each reviewed contract, including any evidenced redirect
hosts; do not expand host allowlists on a guess. Record missing source precision
as unknown/null, never midnight or a fabricated timestamp.

Quality context needs a reviewed plain-text `quality_note` and official
`quality_source_url` for the unemployment feed, captured with its source snapshot
and available beside the chart. No raw HTML. Later cap observations need an
explicit `basis` containing sourced electricity/gas typical annual kWh, payment
method, tariff scope, VAT treatment and calculation-basis identifier, with units.
Do not add empty basis objects to today's metrics or infer comparability from a
matching bill unit. Qualify exact fields with the energy source before emission.

Retain existing per-metric collection/validation states. Failed collection keeps
that metric's last verified snapshot marked degraded; a never-collected metric
stays unavailable. Normal time between releases is not collection failure. A bad
checksum or invalid generation retains the complete previous reader snapshot.
New releases and revisions preserve private vintages and receipts, including
same-date A → B → A; no reconstruction of unknown official historic vintages.

## Retained compatibility fallback if additive delivery is insufficient

Use **versioned dual delivery with a compatible reader first**. Preserving the v1
contract supports an already-open M1 browser and an immediate frontend rollback.

- Keep `data/current.json` and `data/generations/<id>/data.json` strictly JSON v1,
  projecting only the three existing metrics and unchanged definitions/semantics.
  Do not insert new measures into this channel merely because today's reader
  happens to ignore extra keys.
- Add `data/v2/current.json` and `data/v2/generations/<id>/data.json`. A v2 manifest
  retains `data_url: "generations/<id>/data.json"`, resolved under `data/v2/`.
  Fix the base path in code; never accept arbitrary manifest URLs/path traversal.
- Select snapshots and health once, then render both projections from that same
  captured private generation. Reuse logical generation ID/time across projections;
  calculate separate byte hashes. Each browser accepts exactly one whole projection.
  No card/chart may mix channels or fall back by metric.
- Serialize export/activation/pruning, including `--export-only`, with the existing
  private lockfile approach. Collection's current lock ends before delivery; it
  alone does not protect two overlapping delivery invocations. Avoid nested
  acquisition of the same lock when extending its scope.
- Finish and validate both immutable payloads before pointer changes. Replace v1's
  pointer first; replace v2's only after v1 activation succeeds. Two pointers are
  not one atomic transaction: a crash may leave v1 newer and v2 on its previous
  complete generation. That is acceptable; each remains internally consistent.
  Report partial activation and retry without overwriting immutable bytes. Keep a
  failing candidate from replacing either channel's last valid payload.

The compatibility combinations to demonstrate offline and in staging are:

1. M1 reader + existing v1 publisher: unchanged baseline.
2. Bridge reader + existing publisher: v2 manifest absent (404), so load and
   validate the complete v1 generation. No new metrics/cards appear.
3. M1 reader + dual publisher: read unchanged v1 channel; all three feeds work.
4. Bridge reader + dual publisher: validate v2; same core figures, references,
   statuses and source receipts as v1; staged optional metrics work when registered.
5. Rolled-back M1 frontend + dual publisher: v1 continues updating, independent of
   whether an older open bridge reader is using v2.
6. Bridge reader + corrupt/unsupported v2, wrong hash, missing v2 payload or network
   failure: reject/retain last accepted generation and warn; do not hide corruption
   by silently fetching v1. Only a missing v2 *manifest* during initial capability
   detection permits v1 fallback. After accepting v2 in a controller session, even
   its manifest's disappearance is a refresh failure. A cold invalid load stays
   unavailable with usable guides.

Implement the bridge reader first and exercise v2 with test-only data. Then add
dual export disabled by default; rehearse enablement against isolated official
state. Activation requires reviewed authorization separately from implementation.
Continue v1 delivery throughout M2; retirement requires an explicit later decision
covering old tabs, rollback releases and cache behavior, not a time-based guess.

Before activation, record frontend/publisher SHAs, both current manifests/hashes,
retained immutable generations, a SQLite backup and raw-evidence backup. Rehearse
frontend rollback to M1 while dual delivery continues. For a writer fault, stop
the writer, restore retained valid manifests and compatible writer code, verify
both channels, then resume. An old writer may refresh v1 only while v2 remains
frozen: bridge clients need a warning or frontend rollback to restore freshness.
Never delete v2 to force fallback or downgrade the private DB to roll back JSON.

Run pruning separately for each channel, preserving its active and explicitly
retained rollback generations. Retain generations referenced by either manifest
and those needed for the in-flight-fetch window; extending today's 14-day policy
must be explicit. Pruning cannot infer both active IDs from only v1's manifest.

## Private storage boundary

Prefer export-time enrichment of the unchanged three core definitions/reference
strings. Do not add dataclass defaults that silently change their stored JSON,
semantic hashes or receipt-migration reconstruction. Wire v2 does not require
SQLite v3. New source contracts may add distinct definition keys normally.

For M2, the existing text `period` column can identify each end-month rolling
window. Preserve the fully parsed start/end window in new snapshots' JSON; public
delivery must not guess it from a date alone. Old observation/snapshot serialization
must remain reproducible. If this requires changing the shared observation model,
use explicit version-aware serialization and test old-store open/replay/migration,
rather than rewriting old snapshots. Add a SQLite migration only if demonstrated
storage needs require it, with backup/rollback review. Keep source parser version,
statistical definition version, public wire version and DB version distinct.

## Shared-file boundary

The short checklist above owns the proposed file/PR split; no subissues have been
created. Preparation changes this document only.

#48 owns current Bank Rate changes in `App.tsx`, `verified.mjs`/presentation helpers
and frontend tests. Do not edit those files during this preparation. Start #26
implementation from accepted integrated M1 and preserve its last-change contract;
do not recreate that fix or reinterpret its gaps. Leave `refresh.mjs` and
`refreshMachine.mjs` intact unless an actual contract need emerges; preserve the
FRONTEND.md lifecycle, independent commentary and one generation per data state.
No generic plugin framework, schema compiler, provider hierarchy, relationship
graph or wholesale page extraction is justified by these measures.

## Source evidence received and checked during preparation

The owner has been asked to ask Grokbot, optionally in a separate read-only thread,
for official CPI/labour download evidence. The owner relayed that research,
retrieved about 14:29 BST on 21 October 2026. Sol independently read all eight JSON
and CSV endpoints below at 13:32:46 UTC (14:32:46 BST) that day. All returned HTTP
200, with final URLs identical to requested URLs on `www.ons.gov.uk`. No raw files
were committed or ingested; these checks are research, not replayable fixtures.

The inspected landing paths, relative to `https://www.ons.gov.uk`, are:

- CPI: `/economy/inflationandpriceindices/timeseries/d7g7/mm23`.
- Nominal regular pay: `/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms`.
- Real regular pay: `/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms`.
- Unemployment: `/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms`.

For each exact path above, the inspected JSON URL is
`https://www.ons.gov.uk` + path + `/data`; the inspected CSV URL is
`https://www.ons.gov.uk/generator?format=csv&uri=` + path. These are observed
endpoints, not an assumed URL generator for other series. JSON Content-Type was
`application/json;charset=utf-8`; CSV was `application/octet-stream;charset=utf-8`.

Prefer the JSON `months[]` interface for the new adapters, especially MGSX, because
it preserves window labels. Do not silently switch to CSV on JSON failure; any
CSV alternative needs a separately reviewed/tested period mapping. Existing M1
adapters remain CSV. Workbook selectors are unnecessary for these endpoints, but
methodology notes are still necessary to establish their statistical meaning.

Observed contracts and implications:

- D7G7/MM23 is annual all-items CPI with `%` unit. The last monthly key was
  `2026 SEP`; annual/quarterly arrays also exist and must not enter monthly history.
- KAI9/LMS is nominal annual three-month regular-pay growth, seasonally adjusted,
  with arrears excluded. Its unit is `%` and only `months[]` was populated.
- A2FA/LMS is real annual three-month regular-pay growth, seasonally adjusted;
  its unit metadata is blank. Accept this only as a series-specific reviewed
  exception backed by its percentage-growth title and official methodology. A3WW
  is total pay and must not be substituted. A2FC is a level, not this growth rate.
- MGSX/LMS is the seasonally adjusted unemployment percentage rate for ages 16+.
  Its observed point `{ date: "2026 JUL", label: "2026 JUN-AUG" }` establishes
  June–August, canonically keyed `2026-08`. The CSV drops that full label. Annual
  and quarterly arrays coexist with rolling windows; consume only `months[]`.
- The structured seasonal-adjustment field is null/absent; validated series titles
  and methodology establish adjustment. Do not interpret null as unadjusted.
- JSON `description.releaseDate` for CPI was `2026-10-20T23:00:00.000Z`, while
  CSV `Release date` was `21-10-2026`. Convert metadata to the Europe/London
  calendar date; slicing UTC would produce the wrong date. Labour had the same
  pattern one day earlier. Preserve raw metadata privately, but do not represent
  its midnight-local encoding as an evidenced announcement time. Public source
  publication precision remains date. Parse human-readable `nextRelease`
  separately and preserve unknown precision; do not infer a scheduled time.
- Monthly values were decimal strings. No non-numeric missing tokens occurred in
  the inspected monthly arrays. That does not establish the missing-value grammar.
  Unknown tokens must quarantine a candidate rather than become zero or be
  silently dropped. Preserve missing expected periods in the derived view.
- Per-point `updateDate` is source metadata. Its interpretation as a revision time
  remains unverified; preserve it privately without using it to establish vintage
  ordering or inventing an official release chronology.

The [October earnings bulletin](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/averageweeklyearningsingreatbritain/october2026)
confirms Great Britain coverage and CPIH deflation for headline real pay; its
methodology distinguishes the supplementary CPI-based X09 dataset from EARN01.
This supports the proposed deflator; complete the direct A2FA-to-headline mapping
in recorded qualification evidence before implementing the adapter. A dated
[LFS quality update](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/labourforcesurveyqualityupdate/october2026)
also supplies the required current caution about short-term changes and precision.
The [MGSX landing page](https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms)
states OGL v3.0 with exceptions in its footer; retain source attribution and check
for dataset-specific exceptions when recording fixtures. Licensing is therefore
supported by the official site, rather than inferred from the response body.

Still to close during qualification: exact archived bytes/receipts and hashes;
cross-year rolling-label variants; the pay ending-month rule; missing/withdrawn
value conventions; source history/revision limits; the complete statistical
population/geography mapping; and per-dataset reuse exceptions. The research
narrows these questions but does not complete #26 or authorize implementation.

## Implementation proof required after the entry gate

Before #26 is accepted, implement and run meaningful tests for the selected
compatibility approach, full definition rejection, unknown optional metrics, decimal
and unit mismatches, impossible/mislabelled rolling windows, overlapping effective
intervals, MGSX label/date disagreement, BST release-date conversion, gaps, independent
related-series failure and retained revisions. Include existing-store/receipt
replay, fixture-to-official rejection, public-field privacy, manifest/checksum
mismatch and frontend/writer rollback. Test failures between pointer replacements
and independent channel pruning only if dual delivery is selected. Feed-specific
tests remain with their vertical slices, including effective intervals/rollover.

Use the documented dependency-light Python suite, frontend suite and clean build;
at M2 acceptance record the integrated SHA and production-style combined review,
the selected data contract/channel(s), direct URLs/assets, themes/mobile, refresh failures and
rollback results under the canonical gate. Live-source smoke checks, when needed,
read into private temporary state separately from fixture replay. No paid AI is
needed. No compatibility or activation test has been executed by this preparation.
