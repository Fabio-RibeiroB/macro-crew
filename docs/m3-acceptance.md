# M3 rollout qualification — 22 October 2026

**Status:** qualified for the documented reader-first rollout; not deployed.
Production remains `deploy-2026-10-22.1`. Qualified runtime source is `b079cd6a1e34b83195cedd50db7f5b391275537a`,
including the HPI edition-month completeness check. Use the final merged PR #60
commit containing that runtime revision and its documentation corrections; do not
deploy the earlier `8d7e3df` qualification snapshot.

## Compatibility and collection evidence

- A fresh temporary official collection at `b079cd6`, using a new copy of the
  production database, collected all 11 feeds with no failures. All members were
  verified with successful status, and the public manifest SHA-256 matched.
  Its immutable generation was `58e1e1ee222349ba82dc2c76ec034569`; the final
  HPI edition-month guard accepted August 2026 at £273,037 and 0.9%.
  State/output live under `/tmp/finstats-m3-b079cd6/`, outside served paths. No production files, services, timers or
  databases were changed.
- Candidate reader `b079cd6` accepts the actual production nine-feed payload.
  The currently deployed reader at `98226c2` rejects the candidate eleven-feed
  payload with `Error('Unknown metric')`.
- The frozen M1 compatibility test accepts the additive payload under its
  three-core contract. That establishes M1 behavior only; it does not establish
  compatibility for the current strict production reader or other older readers.

## Build and staging evidence

- Combined checks for the candidate: 159 frontend tests and 180 core tests
  passed on `b079cd6`; all four CI checks passed on that runtime revision.
- Frontend build/browser evidence was collected at `8d7e3df`, using the clean
  external release `/tmp/finstats-m3-8d7e3df/release` staged at `127.0.0.1:8179`.
  A Git comparison from that revision to `b079cd6` shows no changes to `src/app`,
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
