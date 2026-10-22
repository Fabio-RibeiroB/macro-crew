# M3 rollout qualification — 22 October 2026

**Status:** qualified for the documented reader-first rollout; not deployed.
Production remains `deploy-2026-10-22.1`. Runtime `b079cd6` added the HPI
edition-month completeness check. The current qualified runtime is
`31b15822c699f600738a2d9ddf6d76ad9ae79b69`; the final PR #60 head contains this
runtime and the following documentation correction. This remains rollout
qualification, not deployment.

## Compatibility and collection evidence

- A fresh official collect-and-deliver at runtime `31b1582`, against a new
  isolated copy of the temporary production database, collected all 11 feeds
  with no failures. All 11 public members were verified and `ok`; generation
  `78727b47ea5848559b6c30a973b038e9` was delivered successfully. The preserved
  database copy was not modified. No production files, services, timers or
  databases were changed.
- The accepted HPI attempts retain the exact CSV and GOV.UK release page in the
  private content-addressed `raw/<sha256>.bin` archive. Each
  `receipts/<attempt_id>.json` sidecar binds the metric key, CSV URL/hash, release
  page URL/hash/retrieval timestamp, parsed publication date and selected CSV
  link to the accepted SQLite receipt. The page and CSV hashes matched their
  archived bytes; parsed date `2026-10-21` and selected URL matched the supplied
  receipt. The public delivery contains none of the page evidence fields.
  Release page: `https://www.gov.uk/government/statistical-data-sets/uk-house-price-index-data-downloads-august-2026--2`
  (SHA-256 `9d826f197ee6072e360a40b3f9ec6938f548c8b3506d6ceaa794aa24612de9b4`,
  retrieved `2026-10-22T10:02:14.116197Z`). CSV:
  `https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-08.csv?utm_medium=GOV.UK&utm_source=datadownload&utm_campaign=average_price&utm_term=9.30_21_10_26`
  (SHA-256 `dde90f4ca1aeca2749a6fe61f00c4f3daef58c1bec232b6da1130a16d6686c90`).
- Candidate reader `8d7e3df` accepts the actual production nine-feed payload.
  The currently deployed reader at `98226c2` rejects the candidate eleven-feed
  payload with `Error('Unknown metric')`.
- The frozen M1 compatibility test accepts the additive payload under its
  three-core contract. That establishes M1 behavior only; it does not establish
  compatibility for the current strict production reader or other older readers.

## Build and staging evidence

- Checks for runtime `31b1582`: 126 focused source/storage/publication/delivery
  tests and the full dependency-light core suite (185 tests) passed. The
  frontend suite (159 tests), build and browser evidence remain from `8d7e3df`;
  frontend release inputs are unchanged. CI will run all four required checks
  for the final PR head; no final-head CI result is claimed here.
- Frontend build/browser evidence was collected at `8d7e3df`, using the clean
  external release `/tmp/finstats-m3-8d7e3df/release` staged at `127.0.0.1:8179`.
  A Git comparison from that revision to `31b1582` shows no changes to `src/app`,
  `src/styles`, `public`, build scripts/configuration or npm manifests/lockfile.
  That unchanged frontend artifact is reused; it is not claimed to be rebuilt
  from the later collector revision. The collector is qualified separately below.
- At 1366×768, all seven homepage headings and primary values fit; the lowest
  value ends at y=620 CSS pixels. Comparisons remain visible outside closed
  details and the page has no horizontal overflow. All seven also fit at
  1440×900. Housing renders four separate-unit charts and both direct anchors.
  At 390px and 320px it reflows without horizontal overflow; light/dark themes
  work. A simulated refresh failure retained all seven values with a visible
  warning. These checks use the unchanged frontend artifact described above.

## Required deployment and rollback order

Deploy the candidate reader first while the existing nine-feed publisher
continues. Activate the eleven-feed publisher only after the candidate reader is
serving. Do not send the eleven-feed payload to reader `98226c2`.

For rollback, stop the new publisher timer and wait until it is idle; restore the
prior `current.json` pointer while preserving all immutable generations; restore
the previous frontend and compatible publisher source; then resume the prior
timer. Preserve the source backup, dirty generated reports, database and raw
source archive. No database downgrade or raw-source deletion is part of rollback.
See [the cutover guide](dashboard-cutover.md) for the complete procedure.
