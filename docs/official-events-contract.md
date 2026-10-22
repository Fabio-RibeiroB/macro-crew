# Official events data contract

The event publisher is additive to the verified-metrics contract. `current.json`
continues to reference the metric generation only. A separate
`events-manifest.json` activates one immutable event payload after its write
completes; readers must fetch that payload and verify its SHA-256 before use.

The manifest has `schema_version: 1`, `mode: "official"`, `data_url`, and
`sha256`. `data_url` currently has the form
`event-generations/<sha256>.json`. The payload has `schema_version: 1`,
`mode: "official"`, `checked_at`, `providers`, and a chronological, ID-deduplicated
`events` array. Provider records expose `status` (`ok`, `stale`, `unavailable`,
or `unqualified`),
last successful retrieval time, exact official fetch URL, official calendar URL,
content hash, and events. A failed refresh keeps the last event list and reports
stale plus the last failure time; a provider without a verified schedule reports
unavailable. A qualified source with no dated upcoming event has an empty list
and unknown_dates true. An unqualified provider includes its captured retrieval
evidence but does not assert whether a future date exists.

The ONS release adapter links only matching release families: GDP to monthly
GDP; consumer-price inflation to CPI and CPIH; labour-market releases to nominal
and real regular pay plus unemployment; private-rent releases to rent growth and
level; and house-price releases to average price and annual change.

OBR publications, HM Treasury announcement search and the Ofgem price-cap page
have **unqualified** status. Their exact official response bodies and receipts
are retained as captured fixtures, but no reviewed date parser is implemented.
Their empty event arrays do not assert that dates are unknown or that those
sources are complete. Do not treat an unqualified provider as a successful
calendar check.

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
qualified sources are ONS release search, the BoE confirmed MPC date page, and
the DESNZ weekly fuel release page. OBR, HM Treasury, and Ofgem pages are
captured but remain unqualified until bounded, reviewed event-date extraction
exists. Only dates present in qualified source responses are emitted; the
calendar is not claimed complete for every release or future fiscal/energy
announcement. A malformed private event state or event export failure is
reported separately and cannot block metric publication; the last activated
event manifest is left in place.
