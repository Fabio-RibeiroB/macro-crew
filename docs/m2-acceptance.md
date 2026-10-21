# M2 local acceptance — 21 October 2026

Integrated implementation: `a6be8644c5c22d5631d7d6a154cb2ff794d16498`
(CPI #55, wages #56, unemployment #57), plus the homepage spacing correction
in the PR containing this record. Local acceptance passed; that correction must
pass CI and review before release. Production deployment is not authorised by
this record. Production remains `deploy-2026-10-21.2`.

## Combined checks

- Frontend: 155 passed. Dependency-light Python: 166 passed on Python 3.13.12.
  The frontend runner emitted a nonfatal HMR-port-in-use warning.
- Static release built from a clean Git archive outside served paths. The final
  spacing candidate passed the build and static boundary checks. No numerical,
  reader, collector or refresh code changed after the combined suites.
- A fresh official collection and public delivery into isolated temporary state
  returned no failed metrics. Public generation:
  `89b8ade5048e4aefae7a6668ce0c4b22`; its SHA-256 matched the manifest.
  This was an actual official download, separate from recorded-fixture replay.

| Series | Latest value | Reference |
| --- | --- | --- |
| CPI D7G7 | 3.5% | September 2026 |
| CPIH L55O | 3.6% | September 2026 |
| Bank Rate IUDBEDR | 3.75% | 20 October 2026 observation |
| Nominal regular pay KAI9 | 3.7% | June–August 2026 |
| CPIH-adjusted regular pay A2FA | 0.6% | June–August 2026 |
| Unemployment MGSX | 4.7% | June–August 2026 |
| GDP ECYX | 0.1% | August 2026 |

Values are a point-in-time acceptance receipt, not a maintained data source.
All seven members had verified validation and successful collection status.

## Release and browser evidence

Local release preview: `http://127.0.0.1:8177/`, serving the built artifact with
the isolated official public export. It is loopback-only and temporary, not a
production URL. Reproduction: build a clean archive into an external directory,
collect/deliver into separate private/public temporary directories using the
README command, attach only the public output as the release's `data` link, and
run `vite preview --host 127.0.0.1 --port 8177 --strictPort --outDir RELEASE`.

- Homepage card order: CPI, Bank Rate, Wages, Unemployment, GDP. CPIH stays
  supporting data on Prices; real pay uses the official A2FA measure.
- The initial integrated build placed the final two headline values below the
  desktop fold. The accompanying correction reduces compact-card spacing without
  shrinking text or hiding context. At 1366×768 the final primary values end at
  approximately 721 CSS pixels; all five also fit at 1440×900.
- At 390×844 figures begin in the first viewport. At 320 CSS pixels the homepage
  and Jobs & Pay reflow without horizontal overflow. Light and dark themes checked.
- Prices renders distinct CPI/CPIH figures and two charts. Jobs & Pay renders
  three charts, full rolling windows, the quality note, distinct section labels,
  and working direct `#wages` / `#unemployment` targets.
- A simulated browser fetch rejection retained all five loaded headline values
  and displayed “The last successfully loaded figures remain below.”
  The override was confined to the preview tab and restored afterward.
- Built assets, public manifest and generation loaded successfully. Existing
  tests cover keyboard navigation, missing/malformed inputs, per-metric retention,
  independent commentary, fixture rejection and failed activation.

## Compatibility and rollout

The actual deployed reader from source `8f5083d1f05eeb995d01263816c1a66ca144caa8`
accepted the fresh seven-feed candidate generation. The candidate reader also
accepted the current production three-feed payload. The version remains additive
v1; unemployment retains `comparison: "level"`. Existing-store replay, unchanged
core definitions, failed activation preservation and rollback mechanics passed
in the combined suite. This does not claim a production rollback was performed.

After explicit deployment authorisation, retain the existing release, manifest,
immutable generations and private SQLite backup. Validate the candidate against
existing production data before activating its collector. The old reader can
consume the new generation if the frontend is rolled back; no database downgrade
or simultaneous reader/writer cutover is required. Follow
[dashboard-cutover.md](dashboard-cutover.md) for the operational backup, atomic
activation, timer and rollback steps. No production files, services, timers or
paid AI were changed during acceptance.
