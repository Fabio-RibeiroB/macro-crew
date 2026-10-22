# M3 rollout qualification — 22 October 2026

**Status:** qualified for the documented reader-first rollout; not deployed.
Production remains `deploy-2026-10-22.1`. Candidate source is `8d7e3df` plus
this documentation-only commit on PR #60.

## Compatibility and collection evidence

- A temporary official collection using a copy of the production database
  discovered and collected all 11 feeds (11/11). Its immutable generation was
  `256095e291a94b78a5f16ed2fa02663b`. No production files, services, timers or
  databases were changed.
- Candidate reader `8d7e3df` accepts the actual production nine-feed payload.
  The currently deployed reader at `98226c2` rejects the candidate eleven-feed
  payload with `Error('Unknown metric')`.
- The frozen M1 compatibility test accepts the additive payload under its
  three-core contract. That establishes M1 behavior only; it does not establish
  compatibility for the current strict production reader or other older readers.

## Build and staging evidence

- Combined checks for the candidate: 159 frontend tests and 178 core tests
  passed; the CI checks were current at qualification time.
- A clean external release was built at
  `/tmp/finstats-m3-8d7e3df/release` and staged locally at `127.0.0.1:8179`.
- At 1366×768, all seven homepage headings and primary values fit; the lowest
  value ends at y=620 CSS pixels. Comparisons remain visible outside closed
  details and the page has no horizontal overflow. Remaining browser checks are
  tracked in the parent combined acceptance; they are not claimed here.

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
