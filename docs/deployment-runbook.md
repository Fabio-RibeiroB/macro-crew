# FinStats deployment and rollback

> Historical installation record: the baseline and shadow-only procedures below
> describe 20 October 2026. Production now uses the verified publisher and static
> topic pages. Use [the current cutover guide](dashboard-cutover.md) for deployment
> and [release tracking](releases.md) for tags, receipts and rollback. Do not
> reinstall the shadow timer alongside the production publisher.

## Verified host baseline — 20 October 2026

The production checkout is `/home/finstats/public_html/macro-crew`, owned by
`finstats`, on `main`. Apache's HTTPS virtual host serves its `dist/` directory.
The HTTP virtual host serves `/home/finstats/public_html`. Do not put databases,
raw responses, backups or secrets under either document root. The daily 17:00
`finstats` crontab invokes the existing AI scheduler. This was inspected directly,
not inferred from old project documentation.

After approval, architecture/source/storage/shadow PRs #6–#9 were merged and the
server checkout fast-forwarded from `08d8712` to `bda9890`. Local modifications to
`research_report.json`, `history_report.json` and their `public/` copies were
preserved. No frontend rebuild was necessary: these PRs change no frontend source.
No production JSON was replaced with shadow output. PR #5 remains separate.

Before updating, code, reports and `dist/` were archived privately under
`/home/finstats/backups/macro-crew/20261020T223658Z/`, with the exact pre-deploy Git
commit and crontab recorded. Dependencies, Git objects and logs were excluded from
the tar archive; the existing Python environment and node_modules were retained.
Report files and the built index were checked byte-for-byte against the archive.
The homepage and both public JSON endpoints returned HTTP 200 after the update.

The actual host environment uses Python 3.13.12, CrewAI/crewai-tools 1.7.2,
LanceDB 0.5.7 and pytest 9.0.2. All 80 tests passed there with fake API keys and
mocked external calls. CrewAI emitted a stream-flush warning at interpreter exit;
the test process exited successfully. The lightweight CI dependency limitation
still applies to fresh installations; an existing working environment is not a
reproducible lockfile. Do not blindly rebuild it during a deployment.

## Shadow collection service

`deploy/systemd/finstats-shadow.service` runs the deterministic collector as
`finstats`, using its existing Python interpreter. Its output is private under
`/home/finstats/.local/state/finstats-shadow`. It imports no AI client and needs
no AI credentials. The service has a five-minute limit, private temporary files,
restricted writes, a private umask and journal logging. The timer catches up after
reboots and runs four times daily. This six-hour pilot cadence limits storage and
request overhead; it is not the final release-aware publication schedule.

Installation by an authorised administrator:

```sh
sudo install -d -m 700 -o finstats -g finstats /home/finstats/.local/state/finstats-shadow
sudo install -m 644 deploy/systemd/finstats-shadow.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/finstats-shadow.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/finstats-shadow.service /etc/systemd/system/finstats-shadow.timer
sudo systemctl daemon-reload
sudo systemctl start finstats-shadow.service
sudo systemctl enable --now finstats-shadow.timer
```

Review service files before installation and adapt paths if moving hosts. Neither
unit changes the legacy crontab, exposes shadow data to Apache or deploys frontend
code. No automatic Git pull/build is installed. A failed run is visible in
`systemctl status finstats-shadow.service` and
`journalctl -u finstats-shadow.service`; no email/remote alert transport is yet
configured. Confirm `systemctl list-timers finstats-shadow.timer` after installation.

The actual installed service completed with `Result=success` and exit status 0;
the timer was enabled and its next execution confirmed. The new shadow DB was
backed up using SQLite's backup API alongside the raw archive, reopened from the
backup and compared by semantic hashes; raw file hashes were also verified. The
private deployment receipt is stored with the pre-deploy backup as `deployment.json`.

Inspect the active shadow manifest and its hash as `finstats`; verify all three
metrics and their source/reference dates. A first live run produced Bank Rate
3.75% observed 19 October, annual CPIH 3.3% for August (released 16 September), and
monthly GDP growth 0.1% for August (released 15 October). These describe the
recorded deployment check, not permanently current readings.

Each exported generation was about 0.97 MB on this host. Four per day adds roughly
4 MB/day before source/archive/DB growth. Retention/pruning and external failure
alerts remain unfinished. Inspect disk usage during the pilot; disable the timer
rather than allowing unbounded storage if the pilot is extended without a policy.
Do not delete raw evidence or the active generation to free space casually.

## Safe update procedure

1. Record the current commit, crontab and service/timer state. Back up reports,
   built site and the complete shadow data (SQLite-consistent backup plus raw
   archive). Check local modifications. Stop the shadow timer/service for changes
   to its code/schema; coordinate the legacy job separately if updating its files.
2. Fetch and inspect the approved target. Use `git pull --ff-only`; stop on local
   conflicts rather than resetting generated reports or guessing merge results.
3. Run offline tests with dummy keys. Avoid the live research crew as a deployment
   test. A dependency sync is a separate change when the installed environment is
   already working.
4. For frontend changes, build into a separate release directory, copy the latest
   reports under the appropriate contract, verify it, then switch the served
   directory atomically. Retain the previous built release. Never rebuild directly
   over the live `dist/` directory during a cutover.
5. Run shadow collection, inspect its manifest/hash and source dates, and check the
   public homepage/JSON endpoints. Confirm production reports changed only if the
   deployment explicitly intended to replace them. Re-enable scheduling and record
   the outcome.

## Rollback

Stop/disable the shadow timer and stop any running collector first:

```sh
sudo systemctl disable --now finstats-shadow.timer
sudo systemctl stop finstats-shadow.service
```

The legacy site is independent and keeps serving. If a code rollback is necessary,
use the commit in the backup manifest and preserve local report changes. Restore
code through a reviewed checkout/revert, not a blind hard reset. Do not run old
collector code against a schema it cannot read: schema v2 requires matching code
or restoration of the pre-upgrade DB and raw archive together.

If restoring a built site/report, first inspect the tar member names. Restore to
a separate private directory as `finstats`, validate the artifact, then replace the
intended live files/directories. Do not overwrite a newer verified dataset merely
to restore application code. The saved crontab is a reference: restore it only if
scheduling was actually changed.

## Still required before the dashboard cutover

Observe official release cycles, add durable release expectations/backoff and
external failure detection, decide retention, and test restore/rollback on a copy.
Add the validated React reader and provenance/freshness presentation in a focused
PR. Separate the legacy report commentary from verified statistics and prevent
outdated explanations being attached to revised figures. None of those checks is
replaced by successfully deploying the shadow service.
