# Private release evidence contract (issue #39)

`finstats.release_detector` is an opt-in deterministic core. Nothing in the
collector, event feed, delivery command or website calls it. Callers supply one
already-qualified official release identity, the accepted metric keys, and
optional text from one exact official page. It performs no network or filesystem
discovery. Text is capped at 64 KiB, limited to the reviewed official hosts,
reduced to visible text, and whitespace-normalized. It is private evidence and
must not be copied into public metric generations.

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
