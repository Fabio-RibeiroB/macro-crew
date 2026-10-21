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
- `producer-pay-v1.json` + `producer-pay-v1.manifest.json`: actual current
  producer output, not hand-written test data. It is produced by the real
  collect → publish → deliver pipeline over the recorded official fixtures in
  `tests/fixtures/official/` with a fixed clock (2026-10-21T12:00Z) and a fixed
  generation id. It contains the unchanged core measures, CPI, and both pay
  measures plus both UK PIPR rent measures with `mode: "official"`; the Python
  suite regenerates it byte for byte and the frontend suite loads it through the
  real reader. Values mirror recorded excerpts and a reduced test-only PIPR
  workbook projection. This synthetic producer artifact is never deployed live.

Tests may mutate copies of these fixtures in memory; checked-in bytes are never
modified by a test run. A recorded fixture can never become public official data.

`m1-reader.mjs` freezes the M1 manifest/dataset reader from accepted commit
`189437f` for compatibility tests. It is test-only and is not used by the app.
