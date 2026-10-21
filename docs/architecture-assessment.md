# FinStats: official-data architecture and migration proposal

Status: proposed design; no production cutover or statistical reclassification is authorised by this document alone.

Assessment date: 20 October 2026. Scope: repository at `f27919c`, including Python collection, scheduling, JSON artefacts, React presentation, tests and deployment documentation. Source checks below are point-in-time feasibility checks, not an availability guarantee. FinStats would republish official statistics with attribution; it would not itself become an official statistics producer.

## 1. Recommendation

Keep React, Vite, static JSON delivery and the existing Linux web server. Add a small Python statistics pipeline using SQLite and an immutable local response archive. Collect Bank Rate, annual CPIH and monthly real GDP growth independently from named official structured series. Validate and commit each series independently, then export one consistent dashboard generation. Run optional explanations after statistics publication in a separate process.

The minimum viable first stage is this three-series pipeline in shadow mode, followed by an explicit dashboard switch after reconciliation. It needs no LLM, search subscription, persistent Python web server, Redis, task broker, containers or additional agents. SQLite is the internal record; JSON is a derived public interface. Continue serving the working dashboard while building this alongside it.

Success means correct definitions, traceable figures, preserved vintages, repeatable imports, safe recovery and clear freshness. It does not mean making every value look newly updated or introducing more AI orchestration.

## 2. Audit: what exists and what to do with it

| Component | Finding and consequence | Decision |
| --- | --- | --- |
| `crew.py`, `config/tasks.yaml`, `main.py` | Two sequential agents search and assemble numbers, dates and narrative. Publication runs through the post-crew hook. Model output can be plausible and schema-valid without matching an official series. | Replace for statistics; isolate any useful explanation prompt later. Keep legacy entry points through migration. |
| `schema.py`, `normalization.py` | Percentage strings, ISO dates, source domain checks and ordering provide useful syntactic protection. They cannot establish series identity, frequency, reference period or economic meaning. All three indicators and two summaries are required together. | Retain validation-before-write principle and legacy schema for legacy consumers; introduce a separate typed statistical contract. |
| `official_history.py` | Already obtains official CSVs, so structured acquisition is feasible without a rewrite. However, it labels ONS reference months as `publication_date`, reduces daily Bank Rate to the last row encountered per month, discovers GDP by HTML regex, and derives GDP growth from four-decimal indices. | Reuse HTTP/CSV knowledge and fixtures, replace semantics and adapter interfaces. Use the directly published growth series for the headline. |
| `history.py` | On successful official refresh, replaces each indicator's entire history with a five-year window. Otherwise appends AI snapshot values. Upsert by publication date overwrites same-date records. An empty successful response can erase a series; one failed source forces aggregate fallback. | Replace numerical storage with immutable source snapshots and observations per vintage. Never promote legacy AI values into verified history. |
| `utils.py` | Validates before writes and uses temporary files plus `os.replace`. Snapshot and history are separate replacements, so the pair is not atomic. Fixed temp names collide under concurrent execution. Naive local `datetime.now()` is suffixed with `Z`. | Retain atomic single-file write idea; use locked export generations and actual timezone-aware UTC. |
| `official_schedule.py`, `scheduler.py` | Official schedule enrichment, overdue checks, weekly refresh and stale fallback already exist. However, schedule retrieval is all-or-nothing, paths are hardcoded, scheduling invokes the entire crew, and direct copies to web directories are not atomic. Loading a missing report prevents bootstrap. A calendar that advances before collection can conceal the missed release. | Retain the operational intent and useful regression cases. Replace due-state calculation, paths, process invocation and publication. |
| `App.tsx` | Reusable layout, loading states, theme, links and independent history loading. Interfaces are unchecked casts of downloaded JSON. Cards use AI snapshot while charts use separately refreshed official history. Previous values assume the penultimate history point matches the card's series/period. | Retain presentation structure; add versioned runtime data validation and source all numerical views from one export generation. |
| CPIH presentation | Current task asks for annual CPIH and history uses L55O; README still says monthly CPIH, schedule uses L59C, and CLAUDE.md contradicts implementation in several places. UI and explanation prompt apply the Bank's 2% CPI target to CPIH. | Standardise the primary metric as annual CPIH. Remove CPIH target badges/line and target claims. Preserve monthly CPIH only as a separately defined future metric. |
| Chart context | `getContextBadge` claims “Highest/Lowest in 5 years” without checking five years of coverage. Charts use smoothed curves; Bank Rate month sampling can hide intra-month changes. | Gate comparisons on validated coverage; use step presentation for policy rates and actual monthly points for growth/inflation. |
| Report summaries | MPR is conflated with MPC decisions/minutes in task instructions and the checked-in snapshot. Those are different publication types. | Preserve existing reports as legacy commentary; later separate publication identities and calendars. |
| Tests | Useful mocked schema, history, schedule, normalisation and crew configuration coverage. Some tests encode wrong semantics: month-as-publication-date, monthly rate compression, and GDP growth across non-adjacent observations. Crew integration tests mostly test construction. | Keep regression coverage for legacy behaviour while adding new source fixtures and failure/revision tests. Test economic contracts, not number of agents. |
| Packaging/deployment | Python core requires CrewAI and Exa, pytest is a runtime dependency, pandas appears unused in current source. No committed uv lock or CI workflow found. PM2 starts Vite in development mode; docs also describe Apache serving `dist`. | Keep static production hosting, remove need for Vite/PM2 in production, separate optional AI dependencies, move pytest to dev, commit a lock in a later focused PR. Confirm actual host config before changing it. |
| Checked-in JSON and documentation | Root/public reports are snapshots, not proof of current source accuracy. README and CLAUDE.md refer to old data contracts and missing tools/tests. | Archive originals unchanged; label legacy data unverified. Update operational docs as each stage lands. Do not infer historical publication vintages from these files. |

### Assessment verification limits

Read the implementation and tests; made read-only HTTP requests to official endpoints. Did not run the AI crew, change production cron, or certify the checked-in numerical values. The local `uv` executable is not executable; a temporary executable copy exited with signal 11. The system Python is 3.8 and has no pytest, below the project's supported range. Therefore the existing Python suite was not run. No installed frontend dependencies were present; no frontend build was run. These are environment limitations, not evidence of test failures. Documentation-only changes do not require introducing replacement tests.

## 3. Statistical contracts for the first three metrics

| Stable metric ID | Definition | Unit and frequency | Exact official series | Reference period and presentation |
| --- | --- | --- | --- | --- |
| `uk.bank_rate.daily` | Official Bank Rate, the policy interest rate level; not a monthly average or percentage change. | Percent per annum; source daily observations; no seasonal adjustment. | Bank of England IADB `IUDBEDR`. | Source observation date. Card: latest available official observation and its date. Chart: retain daily values, render steps. Do not call the observation date an MPC announcement or effective-date event without independent official metadata. |
| `uk.cpih.annual_rate` | UK all-items Consumer Prices Index including owner occupiers' housing costs, 12-month percentage change. Includes Council Tax; not CPI, a price level, or a monthly percentage change. | Percent; monthly observations; not seasonally adjusted. | ONS `MM23/L55O`, title `CPIH ANNUAL RATE 00: ALL ITEMS 2015=100`. | Reference month `YYYY-MM`, separate from release date. Card and chart both annual CPIH. |
| `uk.gdp.monthly_growth` | UK monthly output-based real GDP estimate, period-on-period growth, chained volume measure, seasonally adjusted. Preserve ONS's formal GVA series title in provenance. Not quarterly or rolling three-month growth, nominal GDP, or annualised growth. | Percent; monthly observations; seasonally adjusted. | ONS `MGDP/ECYX`, title `Gross Value Added - Monthly (period on period growth) :CVM SA`. | Reference month `YYYY-MM`; show “Monthly real GDP growth”, one decimal place as published. |

Use the published rate directly, preserving the source decimal precision. A difference between rates is in **percentage points**, not percent growth. Do not reconstruct headline CPIH from rounded indices or headline GDP from the four-decimal index feed. ONS explains that monthly GDP is output-based and its monthly dataset contains GVA; cross-check ECYX against a pinned monthly GDP bulletin/table before enabling this mapping. Retain that reconciliation as a reviewed fixture, including the same reference month and release. [ONS monthly GDP bulletin](https://www.ons.gov.uk/economy/grossdomesticproductgdp/bulletins/gdpmonthlyestimateuk/november2025)

The Bank's inflation target is defined using CPI. A CPIH chart must not label 2% as its target. Add CPI separately later if a target comparison is wanted. [Bank of England explanation](https://www.bankofengland.co.uk/monetary-policy/inflation.)

A new unit, adjustment, geography or comparison basis creates a new definition version; it must not silently change an existing metric. Rebasing metadata is distinct from growth-rate unit. Missing values are null with an explicit reason, never zero or the string “not available” in the new numerical contract.

## 4. Official source feasibility and fallbacks

### Bank Rate

Use the documented IADB CSV download with fixed series and explicit date bounds:

```text
https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2026&Dateto=now&SeriesCodes=IUDBEDR&CSVF=CN&UsingCodes=Y
```

A live request returned HTTP 200, `application/csv`, and `DATE,SERIES,VALUE` rows with `IUDBEDR`. This confirms the existing parser's columnar format. Retain all source observations and validate the series column on every row. Do not assume input ordering or compress changes to one value per month. Non-business-day absence is not a failed release. The latest source observation is not necessarily today's live policy announcement: show its observation date and warn when an expected decision is not yet reflected.

The Bank documents tabular and columnar CSV and XML formats, as well as missing-value symbols; this is a download interface, not a modern versioned release API with a stated service guarantee. [Bank database help](https://www.bankofengland.co.uk/boeapps/database/help.asp)

Fallback order: retry the same official feed; then a separately tested official XML/tabular export for the same series and date range, preserving that format's provenance. A dated official Bank Rate history download is another possible adapter only after definition reconciliation. Do not automatically extract a current value from an HTML headline or a search result. If structured sources are unavailable, retain the last verified value and expose the collection failure. Track MPC decisions and effective dates as separate events later; unchanged decisions cannot be identified from rate changes alone. No complete historical publication-vintage archive for IUDBEDR was established in this audit; forward capture is required.

### CPIH and GDP: prefer small time-series CSV downloads

```text
https://www.ons.gov.uk/generator?format=csv&uri=%2Feconomy%2Finflationandpriceindices%2Ftimeseries%2Fl55o%2Fmm23
https://www.ons.gov.uk/generator?format=csv&uri=%2Feconomy%2Fgrossdomesticproductgdp%2Ftimeseries%2Fecyx%2Fmgdp
```

Live requests returned HTTP 200, about 11 KB and 6 KB respectively. Both include title, CDID, dataset ID, release date, next release and monthly rows. CPIH also includes annual and quarterly rows: explicitly select monthly periods. These are official structured downloads and are a simpler first dependency than filtering a large multidimensional dataset. [CPIH series](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23), [GDP series](https://www.ons.gov.uk/economy/grossdomesticproductgdp/timeseries/ecyx/mgdp)

Observed limitations:

- ONS CSV responses used `application/octet-stream`, not `text/csv`. Validate the metadata/row structure and reject HTML challenge pages rather than requiring one MIME type.
- ECYX's CSV `Unit` is blank. A reviewed adapter contract establishes percent from official series/release context; blank is an explicit known exception. A conflicting nonblank unit must fail validation. Do not infer arbitrary missing units across datasets.
- “Release date” is a date, not a timestamp. Do not invent midnight UTC or precision the response does not provide. Calendar time may enrich it only when the release identity matches.
- “Next release” can be unavailable or change, and is not evidence of a completed release. Metadata dates have themselves been corrected on ONS series pages.
- Evergreen latest URLs change in place. Fetching them today cannot reconstruct what was known historically.

ONS's documented content API is another structured route:

```text
https://api.beta.ons.gov.uk/v1/data?uri=/economy/inflationandpriceindices/timeseries/l55o/mm23
https://api.beta.ons.gov.uk/v1/data?uri=/economy/grossdomesticproductgdp/timeseries/ecyx/mgdp
```

The CPIH endpoint returned JSON in a live request; a subsequent request without the audit User-Agent returned 403. This demonstrates a transport/access failure to handle, not proof of its cause or a universal access rule. Use a descriptive User-Agent, conservative request rates, finite timeouts and backoff. Preserve the actual failure. ONS documents replacement of older v0 routes with v1 content/search routes: do not build around retired endpoints. [ONS migration documentation](https://developer.ons.gov.uk/retirement/v0api/)

Fallback order: same CSV retry, then the tested v1 content JSON for the exact same series and matching vintage. If JSON has advanced while CSV has not, treat it as a new candidate release and reconcile rather than splice them. Next, support a pinned official release-table CSV/XLSX with a dedicated parser and reviewed mapping. Spreadsheet parsing adds a dependency and maintenance cost, so defer until required. HTML is suitable for bounded download-link/calendar discovery, not statistical value extraction. PDFs, news, search snippets and AI are never automatic numerical fallbacks.

### Source vintages and historical backfill

ONS series pages expose “previous versions” downloads, including CPIH and ECYX. CPIH's previous-versions page explicitly describes data as it existed on previous dates. Verify coverage and exact dated download links during adapter implementation; do not assume every historic first estimate or intraday correction is available. [CPIH previous versions](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23/previous), [GDP previous versions](https://www.ons.gov.uk/economy/grossdomesticproductgdp/timeseries/ecyx/mgdp/previous)

ONS also has dataset/edition/version APIs. A live request to `/v1/datasets/gdp-to-four-decimal-places/editions/time-series/versions` returned version metadata, and the website resolved to a concrete version. These version numbers belong to that dataset/edition, not to all ONS releases or all time series. Follow metadata/download links with pagination and store the exact version; do not choose the first regex match or assume a number is a publication date. [ONS catalogue](https://developer.ons.gov.uk/dataset/), [version terminology](https://developer.ons.gov.uk/)

The four-decimal GDP dataset is useful for later detailed analysis and checking, but is not needed for this MVP. GDP revision triangles help validate revisions but are not a substitute for a full source-vintage archive. Capture complete available source histories at each new release, not just the last 12 months: national accounts revisions may reach far back. [ONS revisions explanation](https://www.ons.gov.uk/economy/grossdomesticproductgdp/articles/whygdpfiguresarerevised/2024-02-09)

CPIH is generally not routinely revised, but policy allows revisions/corrections in specified circumstances. Store its vintages too, including metadata-only corrections. [ONS consumer price revisions policy](https://www.ons.gov.uk/economy/inflationandpriceindices/articles/revisionsandcorrectionoferrorspoliciesforconsumerpriceinflationstatistics/december2025)

No source inspected here establishes a completeness guarantee or an operational SLA. The MVP guarantees evidence for what FinStats collected and published; it cannot guarantee recovery of a release it never captured and whose official archive is incomplete.

## 5. Target architecture and module boundaries

```text
systemd timer / CLI (one collector process, exclusive lock)
    -> per-source HTTP fetch -> immutable raw bytes + receipt
    -> pure adapter parse -> typed candidate series snapshot
    -> validation -> SQLite transaction per series
    -> export all accepted series from one DB read transaction
    -> immutable generation directory -> atomic manifest replacement
    -> existing static web server -> React

committed publication -> separate optional explanation job
    -> labelled narrative tied to generation + exact observations
```

Suggested additive package `src/finstats/`: `definitions`, `sources/boe`, `sources/ons`, `validation`, `storage`, `publication`, `cli`. Avoid importing `uk_macro_crew.main` or `crew` from it; those imports initialise AI dependencies and environment handling. Source adapters fetch/parse; validators decide acceptability; storage enforces identity; publication selects views. Each layer accepts a clock, transport or storage dependency where needed for reproducible tests. A single adapter implementation can serve both ONS series using separate immutable definitions.

Trade-offs:

- SQLite plus raw files is one extra durable component compared with JSON-only, but gives transactions, unique constraints and inexpensive revision queries. PostgreSQL is unnecessary for one writer on one mini PC. Use local disk, foreign keys, WAL and a busy timeout; do not place the active database on a network share.
- Full snapshots per release duplicate unchanged observations. For these tiny series, the simpler as-of queries and provenance justify the storage. Deduplicate identical raw bodies by SHA-256. Optimising to observation deltas is premature.
- Static exports avoid a public API server and keep serving during collector failure. They require explicit generation management and retention. Add a read API only if later interactive research workloads need it.
- Separate AI removes commentary from the critical path. It introduces independent narrative status and possible lag, which should be visible rather than hidden.

## 6. Proposed schema and contracts

These are logical tables for a later reviewed migration, not changes to the current JSON schema. Store decimals as canonical decimal text, parse with Python `Decimal`, reject NaN/infinities, and round only in presentation. JSON decimals are strings with explicit decimal typing in the schema; the frontend converts only for chart coordinates. SQLite REAL is not the numerical system of record.

| Entity | Fields and constraints |
| --- | --- |
| `metric_definition` | `(metric_id, definition_version)` primary key; label, full definition, publisher, source dataset/series, geography, frequency, unit, comparison basis, seasonal adjustment, price basis, display precision, expected metadata and canonical source URL. Immutable definition JSON with hash. |
| `collection_run` | `run_id`, start/end UTC, code/parser version, configuration hash, overall result. Results include partial success; zero HTTP fetches can be a valid no-op. |
| `fetch_attempt` | `attempt_id`, run/metric, requested/final URL, retrieved UTC, HTTP status, ETag/Last-Modified if present, content type, bytes, SHA-256, raw archive path, error code. Every attempt is retained, including failure or unchanged payload. Errors must exclude credentials and full response bodies from public logs. |
| `validation_result` | Attempt/snapshot, rule ID and version, severity, result, concise details. Quarantined raw responses remain replayable. |
| `source_snapshot` | `snapshot_id`, metric definition FK, attempt FK, source release key/version if present, source publication date, optional timestamp plus precision, first verified/ingested UTC, semantic hash, parser version, status. Unknown source publication date is null. Distinct source versions or same-day corrected content produce distinct snapshots. |
| `observation` | `(snapshot_id, reference_period)` primary key, canonical decimal value or null, observation status, source status/footnote, source row locator. Monthly periods are `YYYY-MM`; daily periods `YYYY-MM-DD`, validated against metric frequency. All observations in a snapshot share its exact definition and source evidence. |
| `release_expectation` | Metric, expected release identity, expected time/date and precision, calendar URL, discovered UTC, schedule revision, grace deadline, fulfilled snapshot or pending/delayed/cancelled/unknown. Preserve previous expectations rather than overwriting them when calendars advance. |
| `metric_health` | Metric, last attempt, last successful check, latest accepted snapshot, pending expectation, retry-after, failure count and reason. Separate operational state from economic reference period and source release age. |
| `publication` / `publication_member` | Immutable generation ID, created UTC, exporter/schema version, manifest hash, exact accepted snapshot selected for each metric, health-state snapshot, history range. Retain which generation was actually activated and when in an append-only activation log, including rollback. |
| `explanation` (later) | Input generation and observation IDs/hashes, source release URLs, model/prompt version, generated UTC, status, text and cited evidence. Separate from numerical validity. |

Identity rules:

1. Uniqueness must include metric definition, period and source snapshot. Never key a numerical fact solely by release date.
2. The semantic snapshot hash includes ordered observations, relevant source metadata and release identity, excluding collection timestamps and HTTP headers. Same release + same semantic content is an idempotent no-op; a fresh fetch attempt is still recorded. A new release with unchanged values gets its own snapshot. Formatting-only raw changes do not fabricate economic revisions.
3. Save raw bytes by hash with a temporary write, flush/fsync and atomic replace before referencing them in a committed transaction. Record durable provenance in SQLite. Unreferenced blobs after a crash are harmless and can be reconciled. Commit snapshot, observations, validations and per-metric success together. Failed candidates never move the accepted pointer.
4. The initial SQLite migration should enforce foreign keys, enum/check constraints, uniqueness and compatible period/value/null states. Mark derived observations explicitly and record formula/version and input observation IDs if introduced later; MVP headlines are source-published.

Example new public metric member (illustrative contract; placeholders are not live statistics):

```json
{
  "metric_id": "uk.cpih.annual_rate",
  "definition_version": 1,
  "value": "3.3",
  "unit": "percent",
  "reference_period": "2026-08",
  "source_published_date": "2026-09-16",
  "source_published_at": null,
  "publication_time_precision": "date",
  "source_series": "MM23/L55O",
  "source_url": "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23",
  "source_snapshot_id": "snapshot-example",
  "retrieved_at": "2026-10-20T10:00:00Z",
  "last_successful_check_at": "2026-10-20T10:00:00Z",
  "validation_status": "verified",
  "release_status": "awaiting_next_release",
  "collection_status": "ok",
  "revision_delta_percentage_points": null
}
```

The surrounding document includes `schema_version`, `generation_id`, `published_at`, definitions and a provenance map with exact download URLs, hashes and parser versions. “Verified” means the official structured payload passed the documented rules, not an assurance that the source estimate will never change. No fabricated release timestamp is required for Bank Rate: source publication date/time may be unknown while the source observation date and collection receipt are known.

## 7. Revision and vintage behaviour

Keep two time axes: **economic time** (reference period) and **source vintage** (release/version/correction). Keep collection and actual public activation time separately. The release date applying to a complete history snapshot is not the initial publication date of every historical observation in it.

Provide unambiguous selectors:

- **Latest verified:** latest accepted source vintage for the metric, then latest valid reference period in that snapshot. Collection order alone must not let an archived backfill or an old cache response supersede a newer release.
- **As released:** observations in an explicit source snapshot. A date-only cutoff includes whole dates with that limitation disclosed; exact intraday reconstruction requires a timestamp or explicit version ordering.
- **As known to FinStats:** only snapshots actually ingested/verified by the cutoff. Historical source files backfilled today must not be represented as known to this installation years ago.
- **As shown by FinStats:** follow the actual publication activation log at the cutoff; this can differ from ingestion time. Retain old generations for reproducibility.
- **First available vintage:** earliest captured/archived evidence for a period. Label it “first captured” unless historical completeness establishes that it is the actual first estimate.

Example with synthetic GDP values: release A reports January growth `0.1`; release B reports January `0.2` and first reports February `0.0`. Store January twice under A and B. Latest January is `0.2`; revision from A is `+0.1 percentage points`; A's January remains `0.1`. An unchanged January in release C still belongs to C. Never subtract February growth from January growth and call that a revision.

Compute revision deltas for the same definition and reference period between explicit snapshots. The card's new month is a new observation, not a revision of the prior month. History defaults to latest-vintage values across reference periods from one snapshot and labels that choice. Later add a vintage selector and revision table; the storage supports them from day one.

Date-only same-day corrections use source version ordering where supplied; otherwise use local first-seen sequence and label ordering uncertain. A changed payload under the same release date is preserved, flagged for correction review and never silently overwritten. If a source removes an existing period, quarantine the unexpected loss rather than merge old observations into a fictitious source snapshot. An explicitly confirmed withdrawal can be accepted as a withdrawal with a reason; do not resurrect the withdrawn figure as current.

Do not invent past vintages from today's history or migrate AI history as official evidence. Import old artefacts only into a separate legacy archive. Future official backfills require retained dated source files and exact identities; represent coverage gaps in exported metadata.

## 8. Validation, publication and recovery

### Deterministic validation

Hard checks: response is bounded in size, parseable and not HTML; expected title/CDID/dataset/series and dimensions match the definition; correct frequency; valid calendar periods; unique periods; finite decimal values or recognised missing markers; nonempty series; latest usable observation exists; known required metadata present; no unannounced unit/adjustment change; no impossible future observation relative to the injected clock. ONS `..`/missing rows are not zero. Unexpected empty/shortened histories, duplicate conflicting rows, stale release regressions or unsupported metadata changes quarantine the candidate.

A same-value response can be successful and current. An extreme genuine recession or negative inflation must not be discarded by arbitrary tight bounds. Use broad impossibility rules only where justified by definition; use large movements/revisions and unusual missingness as warnings requiring reconciliation, not automatic smoothing or interpolation. If growth is ever derived, require consecutive calendar months, same definition/vintage, nonzero denominator and explicit Decimal rounding. The current code's adjacent-row computation is unsafe when months are missing.

Full-history comparisons distinguish additions, same-period changes, metadata-only changes and missing/withdrawn periods. Validation reports and archived receipts let operators replay with a corrected parser. Reprocessing is a new processing record linked to the same evidence; retain the original decision.

### Publication and crash safety

After each collection cycle, select all metrics from one SQLite read transaction. Valid updates for one metric may publish alongside the last verified snapshot for a failing metric, with individual health statuses. No cross-metric “all succeeded” condition; no requirement for commentary. A first-run missing metric renders unavailable rather than a fabricated value.

Write a unique generation directory containing current figures, history, definitions and provenance. Validate its schema and internal IDs, fsync files, then atomically replace a small `current.json` manifest referencing that generation. React fetches the manifest once, then immutable generation URLs and checks matching generation/schema IDs. A failed export leaves the old manifest active; a failed activation is observable and retryable. File replacement must stay on the same filesystem. A single collector/export lock avoids concurrent activation races. Rollback repoints to a retained generation and appends an activation event.

Public artifacts contain no database path, credentials or private logs. Serve immutable generation URLs with long cache lifetimes and the manifest/health endpoint with revalidation or no-cache. Store data outside Vite's build output; a frontend build must not overwrite current economic data. Retain a documented generation window and never prune the active generation; preserve raw source evidence and DB history under a separate retention policy.

During migration keep the current production JSON writer as sole owner of its files. Shadow output uses separate paths. At cutover disable the legacy statistics writer first. A compatibility exporter may retain the legacy object shape for other consumers, but must not put an observation month into `publication_date` merely to satisfy it. Existing React history semantics need a focused adapter change. Preserve report functionality using a separately labelled legacy commentary file; the new statistics service must not run the crew to populate required report fields.

### Automated operation

Prefer a systemd oneshot service plus persistent timer every 30 minutes, using `Europe/London` for release expectations and timezone-aware UTC for storage. An equivalent cron plus `flock` is acceptable if systemd is unavailable. Use configurable absolute data/export paths; a dedicated non-root service user; read access for the web server; no LLM keys needed by the collector.

The timer is a wake-up, not a claim that every source is due. Check each small feed at least daily for unannounced corrections. Around a known release poll on the timer until fulfilled; outside release windows skip unnecessary fetches. Refresh calendar metadata independently. Keep a durable pending expectation until the actual expected release is validated, cancelled or explicitly rescheduled with evidence. An advancing “next release” field must not mark today's missed release complete. Schedule failure never blocks data collection, and unknown schedules use daily reconciliation.

Use a 30-second HTTP timeout, at most three attempts per source in a run, bounded exponential backoff with jitter, respect `Retry-After`, and cap overall runtime below timer overlap. The clock/backoff policy is injectable in tests. Persistent retry state continues on the next wake-up; after extended failure reduce request frequency and expose degraded status. A 304 records a successful check without inventing a release or changing the figure's release date. Verify last-known evidence before relying on cached responses.

Initial freshness policy: show “awaiting release” through a configurable two-hour grace after a known release timestamp, then “delayed”; for date-only expectations use the end of the expected London date as the deadline. Separately mark collection degraded after two failed attempts and last successful check older than 24 hours. These are operator defaults, not official statistical rules; tune after observing source latency. A months-old unchanged Bank Rate can still be the correct current rate. Economic reference age, source release age, calendar delay and collector health must remain separate fields.

Structured logs include run/attempt/metric/generation IDs, elapsed time, source URL, status, row counts, validation failures and revision counts. A public `health.json` is atomically refreshed independently of numerical publication so that export failure can be exposed while old numbers keep serving. Log health-write failure too. A local status command and systemd/journal are enough initially; add an optional alert channel only when configured. An external host/uptime check is needed to detect a powered-off mini PC, since it cannot report its own outage.

Back up using SQLite's backup API or a coordinated snapshot, plus raw archive and active export generations. Do not copy only the DB file while WAL is active. Check disk space, rotate logs and test restoring into a temporary directory and reproducing the active generation. Measure CPU/RAM/disk and runtime during shadow operation; do not promise a hardware budget before measuring. Three small feeds and a static site should need modest resources; AI costs remain optional and capped.

## 9. React behaviour and optional AI

Retain current cards, reports, calendar and charts. For verified figures show definition/measurement, unit, reference month or observation date, official source series/link, release date with honest precision, last successful check, and next expected release when known. Keep an accessible provenance detail panel with download link/hash and vintage. Show last verified values through source failures with a visible delayed/degraded badge. Keep chart errors independent from figure availability; preserve existing loaded data on transient refresh errors.

Use the same metric definition and snapshot for card, previous observation and chart. A previous value is the previous reference period in that vintage; if a month is missing, label the gap and do not imply a consecutive-month comparison. Do not connect across missing periods by default. Restrict five-year comparisons to a demonstrated complete window. Display generic positive/negative movement without implying all price falls or rate cuts are good or bad. Runtime-check public JSON and reject mixed schema/generation data visibly.

MVP has no new AI dependency. Retain existing report display with legacy labelling until it can be migrated. Later a separate worker takes committed statistics and the exact official release text to produce optional cited explanations. It cannot edit definitions, observations, schedules, health or the publication manifest. Store model, prompt, evidence IDs, cost and status. Budget/timeout errors, invalid output or disabled AI result in “Explanation unavailable” while verified figures publish normally. A narrative tied to an older generation must be marked as such or hidden; never silently attach it to revised figures. Simple change descriptions can be generated from templates without AI. Do not infer household outcomes or causal claims solely from three headline numbers.

## 10. Staged implementation and focused PR sequence

Each PR must leave existing working entry points usable until their explicit replacement. No deployment or deletion of legacy history as part of a schema PR. Implementation follows the design review; the first deliverable is this proposal.

| PR | Scope | Reviewable acceptance gate |
| --- | --- | --- |
| 0 — assessment/design | This audit, source evidence, contracts, migration and trade-offs. | Agree annual CPIH, ECYX mapping/reconciliation, forward vintage guarantees and shadow rollout. No runtime changes. |
| 1 — definitions and source adapters | Add isolated `finstats` definitions and pure parsers for IUDBEDR, L55O, ECYX, bounded transport and reviewed official fixtures. No production writer. | Fixtures assert exact identity/unit/frequency and release/reference separation; malformed/HTML/empty/duplicate/missing cases; same-release bulletin reconciliation; import works without AI packages or keys. |
| 2 — evidence and vintages | Versioned SQLite migration, raw archive, collection receipts, per-series transactions, explicit vintage queries and CLI ingest/replay. | Identical replay is idempotent; corrected same-day release retained; old backfill does not supersede latest; Decimal correctness; rollback on failure; mixed per-source success; real restore exercise. |
| 3 — shadow publication | Export generation manifest/history/provenance, separate health artifact, lock and fault recovery. Manually run shadow collection beside legacy. | Inject crashes before/after DB commit and manifest activation; last complete generation serves; no mixed files; revisions visible; existing files unchanged. |
| 4 — MVP dashboard cutover | Add validated v2 reader, correct CPIH target/definitions, period/release/provenance/freshness UI and consistent history. Preserve reports as labelled legacy commentary. | Side-by-side reconciliation of all three metrics against pinned official releases; at least one release cycle for each and a synthetic revision exercise; source outage demo; frontend build and focused component/browser checks. Explicitly disable legacy numeric writes; document rollback. |
| 5 — unattended operation | Configurable systemd service/timer, persisted expectations/retries, lockfile/package split, operator runbook and bounded dependency reproducibility. | Missed timer/reboot recovery; delayed/unknown/rescheduled release; DST/date-only handling; 304/429/403/timeouts; permissions; disk/export failure; restore and rollback on mini PC. |
| 6 — optional enhancements | Separate evidence-linked AI explanations; official report identities/calendars; selected historic vintage backfill and UI selector. Separate PRs as needed. | AI disabled/failing cannot affect collection/export; stale narrative cannot imply a newer vintage; backfill coverage is honest. |

PRs 1–4 are the minimum viable first stage delivered in small increments: **three verified metrics, full latest histories, forward-captured vintages, provenance, safe publication and an observable manual CLI**. Use an ordinary scheduled CLI invocation during shadow operation if desired; PR 5 adds the complete supported unattended service before claiming automated production readiness. A manual-only MVP is not the final platform. Do not add a public database API or expand the indicator catalogue before the three-series methodology is demonstrated.

Acceptance evidence to retain with implementation PRs:

- Pinned official payload and retrieval receipt for every adapter, plus a manually reviewed same-release comparison to the source page/table.
- Offline tests for source identity, reference/release separation, daily versus monthly semantics, missing markers, no cross-gap growth, revision queries and historical backfill ordering.
- A synthetic two-release GDP revision test; corrected same-date CPIH; unchanged-rate BoE update; archived vintage versus local-known-at distinction.
- Fault tests for one failing source, AI failure/absence, corrupt candidate, replay, interrupted export, disk error and overlapping jobs; previously published values remain usable with honest health.
- Dashboard checks for definition labels, absence of CPIH target claim, stale data and first-run unavailability, gap handling and provenance.
- A shadow comparison report, resource measurements and backup/restore record. Normal unit CI uses fixtures and no network/AI credentials. Live smoke checks are explicitly opt-in and cannot mutate production data.

Cutover is reversible: preserve the original reports, release the frontend with a configurable v2 path, retain the prior built frontend, and record the active manifest. If the new path fails, restore the previous frontend/manifest; do not import legacy AI observations into the verified store. Returning to the legacy display must retain its unverified label. Avoid running old and new publishers against the same destination.

## 11. Outstanding decisions and bounded uncertainties

Recommended defaults are explicit above; they do not require a wholesale rewrite to start implementation. Before production cutover, verify the actual mini-PC server/service configuration and writable filesystem layout; complete ECYX's same-release bulletin mapping; decide how much official historical-vintage coverage to backfill; and set measured grace/retention thresholds. These uncertainties do not block building and testing isolated adapters.

This design deliberately guarantees forward evidence capture and publication reproducibility first. Recovering all historic UK economic data as originally released is a separate research/backfill project, constrained by what the official archives actually retain.
