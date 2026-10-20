# Official-data foundation: shadow development

This work preserves FinStats's purpose: the UK economy, explained. Reliable figures are the foundation for accessible AI explanations, useful charts and summaries of major publications. The current React dashboard and CrewAI workflow remain usable while the replacement is tested separately. No production cron, public JSON, or frontend has changed.

## Source contracts

`src/finstats/sources.py` has no third-party dependencies or AI imports. It defines Bank Rate (IUDBEDR daily level), annual CPIH (MM23/L55O, monthly periods), and seasonally adjusted monthly real GDP growth (MGDP/ECYX). Published rates are parsed directly as decimal strings, not recalculated from indices. Reference periods, release dates and next-release expectations are distinct. Bank Rate's feed does not establish an announcement timestamp.

Recordings in `tests/fixtures/official` retain exact response bytes, URLs, receipt times and hashes. ECYX was compared with the [August 2026 GDP bulletin](https://www.ons.gov.uk/economy/grossdomesticproductgdp/bulletins/gdpmonthlyestimateuk/august2026), released 15 October 2026: June and July monthly growth 0.4%, August 0.1%. Its official GVA title and blank unit field are explicit reviewed exceptions, not general permission to infer units.

Validation rejects wrong series/dataset/title/units, malformed CSV, conflicting duplicates, future dates and unusable latest observations. Historical missing observations remain null; unusual but valid economic movements remain unchanged. The collector will use parser failures as quarantine decisions. No AI fallback is permitted for numerical data. Structured official alternative formats require separately tested adapters; they are not implemented here.

## Live-site audit, 20 October 2026

Read-only HTTP requests reached the actual homepage and both public JSON files. The public snapshot was generated 19 October at 17:00 UTC but reported CPIH 3.1% with publication date 14 September and GDP 0.4% with publication date 14 September. The official feeds retrieved during this audit contained annual CPIH 3.3% for August (released 16 September) and GDP 0.1% for August (released 15 October). Thus a recent generation timestamp does not establish current or correctly dated figures. The raw live output was inspected; this is not a certification of the full production deployment.

T3 browser inspection failed because the host lacks its required browser libraries (`libatk-1.0.so.0`, `libatk-bridge-2.0.so.0`, `libXdamage.so.1`, `libgbm.so.1`, `libxkbcommon.so.0`, `libatspi.so.0`). HTTP checks verify delivery and data only; mobile layout, accessibility, Apache configuration and actual cron/service ownership still need operational verification.

## Next increments and product priorities

1. Preserve exact source evidence, per-release observations and validation failures in SQLite; prove replay, revisions and per-source isolation.
2. Publish consistent shadow generations outside `public/` and `dist/`; demonstrate crash recovery and automatic retries before production cutover. The existing collector retains sole ownership of production output.
3. Integrate the React dashboard with verified figures, provenance, reference periods and collection health; remove the CPIH target comparison. Keep AI/report features, clearly identifying legacy commentary until migrated.
4. Build a separate explanation worker taking immutable verified observations and official release text. Require what happened, same-definition comparisons, supported drivers, household relevance and uncertainty. Distinguish facts, forecasts and interpretation. Test fabricated numbers, unsupported causes, inflation-versus-price-level mistakes, incomplete responses and outdated evidence; rule checks cannot alone prove all prose is accurate.
5. Expand by public topic after assessing source contracts: CPI alongside CPIH, pay and labour-market conditions, rents and energy have high explanatory value. Housing affordability and household effects need carefully defined comparisons. Budget measures, MPC votes, MPR, FSR and OBR forecasts need separate document identities, dates and evidence rather than being treated as ordinary time-series rows. A source-feasibility review is required before each addition; these candidates are not implemented commitments.

No merging or deployment is automatic. Each implementation increment uses a reviewable branch/PR. Data and export directories, not just Git branches, must be isolated during testing. Optional AI and richer topic navigation follow the foundation and remain central to the product.

## Validation

The adapter tests ran on CPython 3.12.11: 17 passed, with no network access or
API credentials. The non-executable preinstalled uv was bypassed using a separate
uv installation in `/tmp`; no system executable was modified. To reproduce with
a supported Python and pytest:

```sh
PYTHONPATH=src python -m pytest tests/test_finstats_sources.py
```

The existing heavy AI dependencies are unchanged. The wheel includes both the
legacy and new packages; the new module can also run from source with `PYTHONPATH`.

## Evidence and vintages

`Store` writes exact raw bytes by SHA-256 before committing a source snapshot and
its observations in one SQLite transaction. Every ingest attempt is retained,
including rejected responses. Identical replay records another attempt without
duplicating observations; a new release or correction preserves a separate vintage.
A newer complete history cannot silently lose existing reference periods.

`latest(key, known_at=...)` selects by source vintage, with local first-seen order
for same-date corrections. Backfilling an older release does not replace the latest
release or imply it was locally known before ingestion. Intraday source ordering
is **not established** by these feeds: first-seen order is provisional. There is no
complete historic archive, withdrawal workflow or as-shown publication log yet.
A changed definition requires an explicit migration rather than an in-place rewrite.

Use `Store.backup(path)` for a SQLite-consistent backup, then back up the `raw/`
directory separately. A restored DB alone supports numerical queries but needs its
raw archive to verify the evidence; the restoration test covers DB query integrity.
Data belongs on local disk outside the web document root. No legacy snapshots are
imported as official observations. Operational scheduling, retention and automatic
fallback formats remain later increments.

Validation: 26 source/storage tests passed on Python 3.12, including synthetic
same-date revisions, unchanged new releases, historic backfill, truncated history,
transaction rollback and SQLite backup/restore. Synthetic changes are confined to
tests. No collection run invokes AI.

## Run the shadow collector

From the repository root, with Python 3.10–3.13 (no AI or runtime package install
is required for this path):

```sh
# Read official feeds; explicitly choose a private directory outside the website.
PYTHONPATH=src python -m finstats --data-dir /tmp/finstats-shadow

# Offline rehearsal; recorded values are labelled as fixtures, never fresh checks.
PYTHONPATH=src python -m finstats --data-dir /tmp/finstats-replay \
  --fixtures-dir tests/fixtures/official
```

The CLI requires a directory and refuses this repository's `public/`, `dist/` and
project root. It writes only `statistics.sqlite3`, `raw/`, a lock and `shadow/`
under that directory. Choose a different private path on the actual host; the CLI
cannot discover every possible production web root. Files default to private
permissions. This is **not** a production web export or a deployment command.

`shadow/current.json` points to a unique `generations/<id>/data.json` with its
SHA-256 hash. That document contains all current figures and history from one DB
read transaction, definitions, source URLs, receipt hashes, release dates and
per-metric collection status. Fetch a manifest once and follow its generation path;
do not mix generation files. Fixtures have no live `last_successful_check_at`.
Read `shadow/health.json` independently for collection health. Errors are retained
privately; public-shaped exports contain statuses, not exception text or DB paths.

An exclusive lock rejects overlapping collection into the same directory. A
source failure does not stop other sources. The process returns nonzero on partial
collection or failed export, while preserving the last activated complete export.
Rerunning retries failed sources and can export data committed before a crash.
The CLI makes one bounded request per feed per invocation; persistent expectations,
backoff/Retry-After, operational alerts and a supported systemd schedule remain
unfinished. Do not replace the production cron with this shadow command yet.

`health.json` is attempted before generation writing, so numerical export failure
can still leave a health update. Disk failure can also prevent that health write;
external monitoring remains necessary. The generation manifest is replaced only
after its payload is complete. No activation audit log, pruning, alternate-format
fallback or complete archived-vintage importer is implemented. Source date plus
local first-seen order is still provisional for same-day changes.

Validation on Python 3.12: 59 selected tests passed (33 new source/storage/export
checks plus 26 existing schema/history/scheduler/utils tests). Fault tests include
partial collection, first-run absence, generation write failure, activation failure,
concurrent collection and unchanged legacy filenames. The live smoke collection
completed all three sources into `/tmp/finstats-shadow-live-audit`, including 13,094
Bank Rate observations, 452 CPIH monthly observations and 355 GDP monthly readings.
These are point-in-time counts, not configured coverage guarantees. The complete
CrewAI/model integration suite and live browser layout were not run.

Compatibility checks: all 33 new tests also passed on Python 3.10.18. The project
wheel built successfully; inspection confirmed it contains both `finstats` and
`uk_macro_crew`. Repeating the live shadow collection recorded six attempts and
only three source snapshots, demonstrating idempotent ingestion against unchanged
live data. All these runs used isolated `/tmp` paths. No scheduler was installed.
