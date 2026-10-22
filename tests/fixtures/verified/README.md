# Synthetic verified-data wire fixtures

These are clearly labelled **synthetic wire fixtures**, not source recordings and
never official production figures. They exercise the additive v1 reader contract:
the unchanged three core metric members plus reviewed optional metric members.

- `m1-core-only.json` + `m1-core-only.manifest.json`: the current M1 payload
  shape with only `bank_rate`, `cpih` and `gdp`. The manifest SHA-256 covers the
  exact payload bytes. Absent optional members are valid.
- `v1-with-optional.json` + `v1-with-optional.manifest.json`: the same core
  members plus registered optional members `cpi` (D7G7/MM23),
  `regular_pay_nominal_growth` (KAI9/LMS), `regular_pay_real_growth` (A2FA/LMS)
  and `unemployment` (MGSX/LMS). Values mirror the recorded official excerpts in
  `tests/fixtures/official/`, but are synthetic test data. Labour members carry
  explicit `window_months: 3` definitions, rolling `reference` windows on every
  point and `geography` (`Great Britain` for pay, `United Kingdom` for CPI and
  unemployment); real pay declares `deflator: "CPIH"`. Unemployment observations
  use the full MGSX rolling-window label, independently of the source date.
- `producer-cpi-v1.json` + `producer-cpi-v1.manifest.json`: earlier CPI-only
  candidate producer output, retained as the #27 integration artifact.
- `producer-pay-v1.json` + `producer-pay-v1.manifest.json`: prior producer
  output, not hand-written test data. It is produced by the real
  collect → publish → deliver pipeline over the recorded official fixtures in
  `tests/fixtures/official/` with a fixed clock (2026-10-21T12:00Z) and a fixed
  generation id. It contains the unchanged core measures, CPI, pay and UK PIPR rent measures,
  plus both UK HPI average price measures with `mode: "official"`; the Python
  suite regenerates it byte for byte and the frontend suite loads it through the
  real reader. Values mirror recorded excerpts and reduced, clearly labelled
  PIPR and UK HPI test fixtures. This synthetic producer artifact is never deployed live.

`producer-pay-v1.json` retains source release date, collection time, UK geography,
reference month, separate GBP and percent units, and the UK HPI source receipt
identity. Its CSV excerpt contains only UK national rows from 2016 onward; the
receipt keeps the full official file URL, original byte count and full-source SHA-256.

- `producer-fuel-v1.json` + `producer-fuel-v1.manifest.json`: the current
  collect → publish → deliver integration artifact with petrol and diesel as
  separate weekly `pence_per_litre` members and the approved BoE daily 5/10/20
  nominal par yields. It uses the retained DESNZ and Bank CSV fixtures, with a
  fixed clock and generation id. The source evidence remains labelled recorded
  fixture data and this wire artifact is never deployed or accepted as a live
  production source.

Tests may mutate copies of these fixtures in memory; checked-in bytes are never
modified by a test run. A recorded fixture can never become public official data.

`m1-reader.mjs` freezes the M1 manifest/dataset reader from accepted commit
`189437f` for compatibility tests. It is test-only and is not used by the app.
- `producer-pay-v1.json` now includes the actual UK HPI Average price CSV-derived
  `house_price_level` and `house_price_growth` members alongside rent. UK HPI's
  checked-in source excerpt is labelled in `tests/fixtures/official/receipts.json`;
  its source release date is retained separately from retrieval time and the
  August 2026 reference month. The full original CSV hash and size are in that
  receipt; only the UK national rows from 2016 onward are included in the test
  fixture. No fixture value is a live production figure.
