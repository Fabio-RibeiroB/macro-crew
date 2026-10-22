# Official events data contract

The event publisher is additive to the verified-metrics contract. `current.json`
continues to reference the metric generation only. A separate
`events-manifest.json` activates one immutable event payload after its write
completes; readers must fetch that payload and verify its SHA-256 before use.

The manifest has `schema_version: 1`, `mode: "official"`, `data_url`, and
`sha256`. `data_url` currently has the form
`event-generations/<sha256>.json`. The payload has `schema_version: 1`,
`mode: "official"`, `checked_at`, `providers`, and a chronological, ID-deduplicated
`events` array. Provider records expose `status` (`ok`, `stale`, or `unavailable`),
last successful `retrieved_at`, official `source_url`, content `sha256`, `events`,
and `unknown_dates`. A failed refresh keeps the last event list and reports
`stale` plus `last_failure_at`; a provider without a verified schedule reports
`unavailable`. A successful source with no dated upcoming event has an empty list
and `unknown_dates: true`.

Each event contains a stable `id`, `title`, London calendar `date`, `time` (an
offset-bearing ISO timestamp or `null`), `time_precision` (`minute` or `date`),
`status` (`scheduled`, `rescheduled`, `cancelled`, or `published`), provider key
`source`, `source_url`, and `linked_indicators`. The consumer should treat a null
time as date-only, never as midnight; keep cancelled/rescheduled status visible;
and exclude past or already-published events from an upcoming list. Date-only
MPC dates remain date-only. The source retrieval timestamp is separate from the
event date.

Collection receipts and revision hashes, exact response bytes, and parser state
remain under private state (`events.json` and `events-raw/`). They are not copied
to public output. Fixture evidence is rejected by the public projector. Current
provider qualification is deliberately bounded: ONS release search, the BoE
confirmed MPC date page, OBR publications, HM Treasury announcement search,
DESNZ weekly fuel release page, and the Ofgem price-cap page. Only dates present
in those responses are emitted; these sources are not claimed to be complete
for every release or future fiscal/energy announcement.
