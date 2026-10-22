# Private release evidence contract (issue #39)

`finstats.release_detector` is an opt-in deterministic core. Nothing in the
collector, delivery command or website calls it. The #40 worker's input path is
`discover_published_release_evidence(store, seen_identities=...)`: it reads only
the existing private `events.json` beside the accepted metric store, validates
it through the current event projection contract, and makes no network requests.
It accepts only current, qualified official providers and published events. For
ONS releases it maps the event's linked official `metric_id` values through
`public_definition()` to local metric keys, then requires an accepted
`official_download` snapshot for each candidate metric with the exact event
publication date. Metric keys are never caller-supplied, so one event family
cannot borrow another family's accepted values. It returns `candidates`,
`rejected`, and `unsupported`; the #40 worker supplies its private seen-identity
ledger and persists deduplication itself.

The event title is the only official text currently available in that contract.
Direct `build_evidence(...)` use may supply text from an exact qualified official
path; it performs no discovery. Text is capped at 64 KiB, reduced to visible
text, and whitespace-normalized. Evidence is private and must not be copied into
public metric generations.

`build_evidence(store, release=..., metric_keys=..., official_text=...,
text_source_url=...)` returns a versioned object with:

* `release`: stable `source`, `id`, ISO `published_date`, and optional official
  `source_url`;
* `evidence_kind`: `official_download` or `recorded_fixture`;
* `metrics`: the reviewed definition, current accepted snapshot/receipt/source
  provenance, publication date, comparison scope, up to 24 current and previous
  comparable observations (including full rolling-window labels), previous
  source provenance, up to 500 revision deltas plus a fingerprint/count for the
  complete revision set, and `information_state`;
* `official_text`: normalized text and its official URL, when supplied;
* `rules_version`, `schema_version`, and `semantic_fingerprint`.

Consumers must reject fixture evidence for official work and deduplicate on
`release_evidence_identity(bundle)`. That identity includes the stable release
identity/date and semantic fingerprint. It excludes check times, database row
IDs, raw download hashes, export generation IDs, parser check times and source
URL formatting. Full observation fingerprints cover the accepted series without
exposing unbounded history in the bundle. Observation comparisons remain scoped
by the metric definition and its declared
comparison/reference window. Corrected values appear in `revisions`; corrected
official wording changes the semantic fingerprint. `low_information_unchanged_release`
represents a qualifying new release with no new or revised observation. It does
not imply a cause or narrative.

`qualifies(release, metric_keys)` recognizes ONS monthly statistical releases
only when the existing event contract marks them `published`, and explicit BoE
policy-decision identities only when marked `published`. Scheduled dates remain
ineligible. It does not qualify daily Bank Rate or yield observations. Release
identities must represent actual policy decisions; observation dates are not
policy publication identities. Qualification does not initiate AI work and is
not used by publication.

The existing BoE event provider contains MPC meeting dates, not published policy
decision identities. The adapter reports this as unsupported and never promotes
a meeting date to a decision release. Other published event types remain
ineligible in this issue.

## Pending fuel and yield review

`MATERIAL_THRESHOLD_PROPOSALS` is version 1 and `enabled: false`. The proposals
are concrete test examples only; production qualification does not consult them.

| Series | Unit | Proposed lookback | Proposed boundary |
| --- | --- | --- | --- |
| Weekly petrol/diesel | pence per litre | Previous four distinct weekly reference observations | Absolute change 1.99: no; 2.00: yes; 2.01: yes |
| BoE 5/10/20 year par yields | Percentage points | Previous five distinct BoE trading-day observations | Absolute change 0.249: no; 0.250: yes; 0.251: yes |

These remain disabled pending oversight review of the metric set, lookback,
threshold boundaries, missing-history behavior, revision handling and release
identity rules. A future decision should use a new rules version; it must not
silently turn these examples on.
