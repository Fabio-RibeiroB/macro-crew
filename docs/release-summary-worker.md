# Private release summary worker (#40)

`finstats.summary_worker.process_summaries` is an opt-in private consumer of
`discover_published_release_evidence`. It reads the retained event identities
and accepted metric evidence locally; it performs no discovery requests and
does not run from the collector, static site, or event/metric publisher. It
handles at most one candidate per invocation (the configurable candidate cap
is 1–8) with a 60-second inference deadline. #39 reads the current private event
projection and latest accepted metric snapshots. A release dropped from that
projection, or superseded before a worker invocation, is not guaranteed to be
recovered; this worker does not provide historical backfill. An unchanged
evidence identity is skipped. A changed evidence fingerprint (including a
correction or changed release text) gets a separate immutable version under the
original release identity.

The inference callback receives only the evidence bundle. This module provides
no provider, browser, network, shell, or filesystem tool. Its response must be
JSON with exactly `summary`, `period`, and `citations`; unsupported numeric
claims, periods, and URLs are rejected. Fixture evidence is rejected upstream
by #39. Before admission, the worker recovers and validates any staged immutable
version for the candidate. The public manifest replacement is the commit point:
failures before it preserve the prior manifest and all previous summary periods.
If the manifest commits but the private seen ledger fails, the next invocation
reconciles that published identity before discovery, without another inference
call. Statistical metrics and events are published by their existing paths
regardless of this worker's outcome.

The #41 consumer contract is intentionally small and static:
`summary-manifest.json` contains `schema_version: 1`, `updated_at`, and a
`summaries` object keyed by `<source>:<release-id>`. Each entry has
`published_date`, `period`, `generated_at`, `evidence_identity`, and a relative
`version` path. The immutable version JSON contains `schema_version`, official
`release` identity/date, `generated_at`, `evidence_identity`, and `summary`
(`summary`, `period`, and official `citations`). `summary-status.json` is
separate and contains `schema_version`, `status` (`disabled`, `current`, or
`stale`), `updated_at`, and an optional coarse `reason`. A consumer can load
this independently of verified metrics, retain older entries, and compare the
explanation's `period` with the metric reference period before display.

## Qualification and activation

Only the #39 qualified published ONS monthly release identities currently
produce candidates. BoE MPC meeting dates remain explicitly unsupported because
the event source does not establish a published policy decision identity. Fuel
and gilt-yield movement qualification remains disabled; a meeting date or daily
observation is never promoted into an announcement. Expanding these families
requires an approved change to the #39 qualification contract and its rules
version.

No inference implementation or service activation is included. The worker
requires both an injected callback and `enabled=True`, and the existing private
`FINSTATS_AI_ENABLED=true` admission control; absent either it reports disabled
without calling inference. A later owner-authorised activation must separately
review the provider, restricted project/key and hard spend cap, timeout/token
limits, private service state, and deployment. Tests use only deterministic
mock callbacks and make no provider calls.
