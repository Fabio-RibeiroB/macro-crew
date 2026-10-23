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
JSON with exactly `claims` and `citations`; it cannot supply free-form summary
prose. Each claim has exactly `metric_key`, `unit`, `period`,
`reference_window`, `value`, `previous_value`, and `provenance`. The worker checks
the complete tuple against the same metric's evidence. `reference_window` is
preserved as provided by evidence: a string for named comparisons or the exact
object `{ "kind": "rolling_months", "start_month": "YYYY-MM",
"end_month": "YYYY-MM" }` for ONS rolling windows. The rendered sentence names
both rolling-window endpoints. Provenance is one of
`current_observation`, `previous_observation`, or `revision`; revision claims
must match the exact current/previous pair for that period. The worker then
renders all numeric sentences deterministically from those checked tuples.
Thus a value found in pay evidence cannot be attributed to unemployment, a GBP
value cannot be labelled percent, and a revision cannot be presented as a new
observation. Citations must be URLs in the supplied evidence. Fixture evidence
is rejected. Before admission, the worker recovers and validates any staged
immutable version for the candidate.

The public manifest replacement is the commit point: failures before it
preserve the prior manifest and all previous summary periods. If the manifest
replacement is visible but its write reports an error, the worker verifies the
exact intended bytes, reports `manifest_durability_uncertain`, and reconciles
the identity without another inference call; the warning does not assert
directory-entry durability and remains visible in status on harmless retries.
If the manifest commits but the private seen
ledger fails, the next invocation reconciles that published identity before discovery, without another inference call. Discovery
deduplicates against identities in the current public manifest, not only the
private paid-work ledger. If an operator rolls the manifest back, a retained
validated immutable version can be reactivated without admission or inference.
If the private ledger says an identity was processed but its immutable version
is missing or corrupt, the worker fails closed with an operator-review status.
Disabling inference blocks new inference but permits these no-call recovery
operations. Statistical metrics and events are published by their existing
paths regardless of this worker's outcome.

The #41 consumer contract is intentionally small and static:
`summary-manifest.json` contains `schema_version: 1`, `updated_at`, and a
`summaries` object keyed by `<source>:<release-id>`. Each entry has
`published_date`, distinct `reference_periods`, `generated_at`,
`evidence_identity`, and a relative `version` path. The immutable version JSON
contains `schema_version`, official `release` identity/date, `generated_at`,
`evidence_identity`, and `summary` (`summary`, validated `claims`, and official
`citations`). Every claim contains its own metric key, unit, period, reference
window, value, previous value when revised, and provenance. The `summary` text
is generated from these claims by the worker, not supplied by the model.
`summary-status.json` is
separate and contains `schema_version`, `status` (`disabled`, `current`, or
`stale`), `updated_at`, and an optional coarse `reason`. A consumer can load
this independently of verified metrics, retain older entries, and compare the
period on each claim with that metric's reference period before display.

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
