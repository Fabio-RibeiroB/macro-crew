# Verified dashboard cutover

The React dashboard now reads `data/current.json`, then one immutable generation.
It verifies SHA-256 in the browser and validates schema, metric identity, frequency,
adjustment, units, dates, decimals, ordering and agreement between card and history.
No AI numerical fallback is used. Missing/unavailable data remains absent; transient
refresh failures retain the last loaded figures with an explicit warning.

The friendlier page groups the three core series by cost of living, borrowing and
saving, and growth/jobs. Reference periods are distinct from official release and
collection dates. The reader derives stale-check and overdue-date labels at view
time rather than relying on a permanently fresh-looking export timestamp. The
charts share their card's source snapshot, use linear/step lines and preserve gaps.
The false CPIH target comparison and unsupported five-year ranking badges are gone.

Household and MPC/Budget guides are general, source-linked explanations. They do
not claim to summarise a new policy announcement or provide personal financial
advice. Earlier AI report summaries are retained in a clearly labelled archive,
loaded independently from the legacy report file. Older numerical AI context is
not attached to newly verified figures. A new evidence-linked AI release engine
and specific Budget/OBR measure coverage remain unfinished.

## Public data delivery

`python -m finstats.delivery --state-dir PRIVATE --output-dir PUBLIC` collects each
metric, creates a consistent private generation, and then delivers a public one.
Only whitelisted statistical fields are copied. SQLite, raw payloads, local paths
and detailed errors never enter the public directory. Fixture data cannot be
promoted to official figures. Accepted observation history is sent to the browser
so its 1Y/5Y/10Y/All controls can select the available periods; the default view
remains five years. Revision vintages and raw evidence remain private. Public files are 0644 and generated
directories 0755 even under the service's private umask.

The public generation is written before its manifest is atomically activated.
Source/payload errors preserve the previous public manifest. A partially failed
collection can still publish other valid metrics and the failed metric's last
verified observation with degraded status, while exiting nonzero for monitoring.
`--export-only` is available for inspecting an already collected generation.

The production layout uses `/home/finstats/published-data`, outside both document
roots. Each frontend release contains a `data` symlink to this directory; Apache's
HTTPS directory's Options None setting is changed to SymLinksIfOwnerMatch,
with common finstats ownership checked before cutover. This is scoped to this
site's HTTPS directory; CGI and directory listing remain disabled. No database/API server or new paid service is required.

The HTML entry point must revalidate on each visit so a cached page does not pin
an older frontend release. Hashed JS/CSS assets retain their normal cache behaviour.
The public manifest is fetched with `cache: no-store`; payloads have immutable URLs
and checksums. Add the following to the published directory's `.htaccess` where
Apache permits it (or apply the equivalent server configuration):

```apache
<IfModule mod_headers.c>
  <FilesMatch "^current\.json$">
    Header set Cache-Control "no-store"
  </FilesMatch>
</IfModule>
```

## Deployment

Back up the built site, legacy report copies, source commit, private DB/raw archive
and current timer state. Build with `npm ci && npm test && npm run build --
--outDir /home/finstats/releases/RELEASE`, not over the live dist directory. Ensure
the release has current legacy report files and a finstats-owned `data` symlink to
the public JSON directory. Run offline Python tests and public delivery first.

Install `deploy/systemd/finstats-publish.service` and `.timer`, precreating both
writable directories with finstats ownership. Verify the units with systemd-analyze,
start the service and inspect the public generation. Only after its success,
disable the shadow timer and enable the publish timer. The daily legacy AI job
continues to supply archived report commentary; it does not supply the new numbers.
Thirty-minute polling provides recovery from temporary missing/delayed releases;
durable release expectations, bounded backoff and external alerts are still pending.

Activate the tested release by atomically switching a same-filesystem symlink or
renaming complete directories. The original dist directory is preserved for
rollback. Verify HTTPS: homepage/title, assets, data manifest/checksum, reference
periods, statistics, source details, chart ranges, mobile layout, theme and archive.
Test a failed refresh and confirm previous loaded figures survive. Do not switch
if any initial official metric is unavailable or the service cannot deliver data.

Rollback: stop the new publisher timer and wait for any running collection or
publication to become idle. Restore the previous `current.json` pointer while
preserving every immutable generation. Restore the previous frontend and its
compatible publisher source before resuming the prior timer. Preserve the database,
raw source archive and deployment backups; do not downgrade the database or delete
raw evidence. Keep previously published immutable generations so an already open
browser can complete its fetch. The delivery command prunes inactive disposable
export generations older than 14 days. It excludes active generations, symlinks and
unexpected files, and never prunes the raw archive or SQLite history. Both
directories still need disk monitoring.

## Reproducible checks

`npm test` uses Node's built-in test runner; no new test/runtime package is added.
It covers wrong units/series/periods, mixed generations, stale checks, gaps,
missing data, unsafe links, fixture contamination and checksum errors. CI now runs
these tests and a Vite build as well as the Python core suite. Python delivery
tests exercise privacy, permissions under umask 0077, partial failure, activation
failure and path/hash guards. Desktop/mobile browser checks use the T3 preview.

## Additive v1 compatibility and rollback rehearsal

The reviewed additive-v1 contract keeps the existing envelope, manifest,
generation checksum and three core metric objects unchanged. Optional registered
metrics are members of the same `metrics` object and generation. The shared
synthetic wire fixtures under `tests/fixtures/verified/` exercise the M1 core-only
payload and the candidate additive payload; their labels and values are test data,
not an official export. The candidate reader validates both fixtures. The frozen
M1 reader test validates the additive fixture using its three-core contract and
consumes only `bank_rate`, `cpih` and `gdp`; that test proves M1 compatibility only.
It does not prove compatibility for every later strict reader. In particular, the
currently deployed reader at `98226c2` rejects the candidate eleven-feed payload
with `Unknown metric`, while candidate `b079cd6` accepts the actual production
nine-feed payload. See the [M3 rollout qualification](m3-acceptance.md) for the
official collection and staging evidence.

Offline rollback rehearsal uses the same one-generation pointer flow. Before
activation, retain the prior `current.json` and immutable generation. A failed
generation write or manifest replacement must leave that pointer readable. For
the current production reader, deploy the candidate reader while the existing
nine-feed publisher remains active; only after that reader is serving may the
eleven-feed publisher be activated. Older strict readers do not accept unregistered
metrics. On rollback, stop the new publisher and wait until idle, restore the prior
pointer without removing generations, restore the previous frontend and compatible
publisher source, then resume its timer. No second pointer, per-metric fallback,
database downgrade or raw-source deletion is involved. Tests cover partial-source
retention, fixture rejection, public-field projection, source and public checksums,
failed manifest replacement, and existing-store replay. These tests prove the
compatibility and rollback mechanics only; the M3 record separately qualifies the
new source collection and the exact reader/writer sequence.
