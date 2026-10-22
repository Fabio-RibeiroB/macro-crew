# Official events data contract

The event publisher is additive to the verified-metrics contract. `current.json`
continues to reference the metric generation only. A separate
`events-manifest.json` activates one immutable event payload after its write
completes; readers must fetch that payload and verify its SHA-256 before use.

The manifest has `schema_version: 1`, `mode: "official"`, `data_url`, and
`sha256`. `data_url` currently has the form
`event-generations/<sha256>.json`. The payload has `schema_version: 1`,
`mode: "official"`, `checked_at`, `providers`, and a chronological, ID-deduplicated
`events` array. Provider records expose `qualification` (`qualified` or
`unqualified`) and operational `status` (`ok`, `stale`, `unavailable`, or
`unqualified`; currently all six providers are qualified),
last successful retrieval time, exact official fetch URL, official calendar URL,
content hash, and events. A failed refresh keeps the last event list and reports
stale plus the last failure time; a provider without a verified schedule reports
unavailable. A qualified source with no dated upcoming event has an empty list
and unknown_dates true. An unqualified provider includes its captured retrieval
evidence but does not assert whether a future date exists.

ONS release search uses a one-year date window, ascending release-date sort and
up to 1,000 results. The response total must equal the returned row count; a
larger result set or missing count fails the refresh and retains the prior feed
instead of silently omitting the remainder. Release links match reviewed title
families only: `GDP monthly estimate` to monthly GDP; `Consumer price inflation`
to CPI and CPIH; `UK Labour Market` to nominal and real regular pay plus
unemployment; earnings-only bulletins to nominal and real regular pay; private
rent releases to rent growth and level; and UK house-price releases to average
price and annual change. Producer-price inflation, quarterly GDP and standalone
unemployment/vacancy releases are not linked.

All six configured providers currently have bounded, reviewed date adapters:
BoE confirmed MPC dates; OBR EFO publication-card “Next release”; HM Treasury's
explicit Budget-date correspondence; DESNZ dated page-update notices; and
Ofgem price-cap article rows under “Energy price cap level dates” that state the
deadline (“announced by”), note that Ofgem may publish earlier, and identify the
effective period. Ofgem events label this as a date-only deadline, not an exact
announcement day. Only
dates found in those source structures are emitted. A recognized source with no
dated upcoming event reports an empty list and `unknown_dates: true`; an
unrecognized or changed source structure fails closed and retains the prior
schedule as stale.

For DESNZ, the date is the publication date attached to the page's release
history row, not its “week commencing” data date. Rows dated today or earlier
are not upcoming. A later dated row is marked `published` because the official
page identifies it as published.

The HMT and Ofgem adapters intentionally use the captured official 2026 Budget
announcement and Ofgem's October–December 2026 price-cap article. These bounded
pages provide actual announced dates; they are not extrapolated into later
Budget or cap cycles. The event feed does not claim that the listed pages are
complete calendars for every future fiscal or energy announcement.

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
to public output. Fixture evidence is rejected by the public projector. Exact
official response bytes and retrieval receipts are retained as fixtures for all
six adapters. `events_source_receipts.json` records each URL, hash, byte count,
retrieval time and qualification basis; the ONS receipt also records the
returned/total result count. Synthetic no-date and changed-markup cases are
separate tests and are never source evidence. A malformed private event state
or event export failure is reported separately and cannot block metric
publication; the last activated event manifest is left in place.
