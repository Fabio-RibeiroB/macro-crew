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

## Issue #42 example review (human decision pending)

The snippets below are **labelled mock evidence**, for review of behavior and
claim boundaries only. They are not official observations, model outputs,
golden prose, or production figures. The model returns checked claim tuples;
the worker renders numeric sentences deterministically. Review factual meaning,
source and reference-period alignment, and restraint. Do not require identical
wording. A completed agent check or passing test is not human approval.

| Case | Labelled mock evidence and acceptable boundary | Existing coverage / unsupported boundary | Owner review |
| --- | --- | --- | --- |
| Inflation slows; prices still rise | Mock: in one hypothetical official CPI release bundle, annual CPI inflation is 3.0% for 2026-06 and 2.5% for 2026-07, while the CPI index level rises between those reference months. Attribute each rate to its period and do not say prices fell. | `tests/test_summary_worker.py::test_claim_values_are_bound_to_metric_unit_period_and_reference_window` checks value/unit/period binding. There is no price-level claim in the worker contract; the distinction between inflation and the price level needs this explicit restraint review. | **PENDING — owner** |
| Unemployment, overlapping three-month windows | Mock: UK unemployment is 4.8% for rolling months 2026-06 to 2026-08, after 4.7% for 2026-05 to 2026-07. Name both full windows; do not call this a one-month change or treat the windows as independent. | `tests/test_finstats_release_detector.py::test_real_pay_and_unemployment_windows_validate_through_summary_claims` checks the full window survives into deterministic rendering. | **PENDING — owner** |
| Older revision, no new period | Mock: an existing 2026-07 observation changes from 2.3% to 2.4%; no newer reference period is supplied. Say “was revised”, retain that period and both values; do not describe it as a new July observation or a new month. | `tests/test_summary_worker.py::test_revision_claim_provenance_is_distinct_from_current_or_previous_observation` and `test_old_rolling_revision_without_retained_reference_window_is_rejected` cover revision provenance and missing window evidence. Historical periods without retained evidence are unsupported. | **PENDING — owner** |
| Ofgem cap announced, not yet active | Mock: an Ofgem announcement published 2026-10-20 names an effective period beginning 2027-01-01. It may be described as announced with that future period only when official event evidence establishes both dates; never say the cap is already in force or apply it to the current bill. | **Unsupported for summary generation:** the private summary candidate path currently qualifies published ONS monthly releases only. An Ofgem announcement is not a qualifying summary candidate; no Ofgem sentence is generated. `tests/test_finstats_release_detector.py::test_daily_rate_or_yield_observation_does_not_qualify_but_policy_identity_does` exercises release-identity qualification boundaries, not Ofgem summary support. | **PENDING — owner** |
| Unchanged, low-information release | Mock: a new published release has no changed values or revisions. State only that the checked figures were unchanged, if represented by supported evidence; do not invent a cause, trend, household effect, or forecast. | `tests/test_finstats_release_detector.py::test_new_monthly_release_with_unchanged_values_is_explicitly_low_information` labels this case; `tests/test_summary_worker.py::test_valid_summary_is_immutable_and_refetch_is_deduplicated` covers repeat-release no-call behavior. | **PENDING — owner** |

**Human review record:** pending owner review. Reviewer: __________  Date:
__________  Decision/comments: ____________________________________________

Coverage boundary: source catch-up is not guaranteed; a release dropped from
the current event projection or superseded before worker invocation can be
missed. MPC decision summaries, Budget summaries and OBR forecast summaries
are unsupported. These examples do not add forecast generation, household
advice, or service activation. About/Sources application copy is left to the
active #41/#74 UI review; this document records worker behavior only.

## Operator handoff

The worker is not deployed or scheduled. The production site remains at
`deploy-2026-10-22.6`; a deployment attempt is currently blocked because the
required host `sudo` access is unavailable. This documentation change does not
change that state. Do not treat fixture replay, mock callbacks, or tests as
production evidence or as owner authorization for inference.

When a separately authorized private worker is eventually operated, inspect
both its return value and `summary-status.json`; a nonzero/failed process or
`status: stale` is an explanation failure, not a statistics publication
failure. `status: disabled` with `owner_activation_required` means inference
is off. `current` can carry `manifest_durability_uncertain` or
`identity_reconciliation_pending`; investigate these before relying on the
summary pointer. `stale` reasons include `timeout`, `admission_or_lock`,
`invalid_summary`, `inference_failed`, `fixture_evidence` and
`operator_review_required`. Status is deliberately coarse and contains no raw
source text or traces. Official statistics/events continue through their
independent publisher path.

Before investigating, keep the previous public manifest and immutable version
files intact. The manifest replacement is the summary commit point: a failure
before replacement preserves its previous bytes. For an operator rollback,
restore the prior reviewed `summary-manifest.json` atomically from a trusted
copy; keep both generations and the private identity ledger. A later invocation
can reactivate a retained, validated version without inference, including while
inference is disabled. Never delete a version to force regeneration; a processed
identity with a missing/corrupt version requires operator review. A visible
manifest replacement with a durability warning is not proof of durable storage;
verify the pointer and storage before further action.

Inference remains off unless an owner separately authorizes the provider,
restricted project/key, enforced spend limit, timeout/token limits, private
runtime and deployment. The worker requires all three gates: an injected
inference callback, `enabled=True`, and private `FINSTATS_AI_ENABLED=true`.
Setting the environment flag false disables new paid inference but still allows
no-call recovery/reconciliation. Do not reset the admission ledger to retry a
failed call. No production activation is part of issue #42.
