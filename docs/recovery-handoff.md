# Recovery handoff — 23 October 2026

This is a dated operational handoff, not a second roadmap. GitHub issues track
live work; README identifies the canonical specification. AGENTS.md records the
owner's lasting delivery preferences. Recheck production and access on resumption.

## Owner's immediate direction

Restore the original automatic CrewAI release-summary experience, then reproduce
and fix chart year/range controls, and verify both journeys live. Do not expand
the replacement engine or add architectural features while these regressions
remain unresolved. The owner authorized recovery and deployment in this thread;
do not confuse unavailable host privileges with absent authorization. New paid
services or increased spending are not authorized by this handoff.

## Last verified state

* Main: `37c8446`, including PRs #72–#75. The replacement worker has no real
  inference provider or installed schedule. It currently renders validated claim
  tuples into sentences; richer narrative explanations remain unfinished.
* Live site: `deploy-2026-10-22.6`, 14 official metrics. The official publisher's
  30-minute systemd timer was active. Later merged UI/data work is not deployed.
* Public `research_report.json` was generated on 19 October at 17:00 UTC.
  CrewAI scheduler invocations were found for 19 and 20 October; their presence
  does not establish successful runs. The exact failure cause is unconfirmed.
* Existing AI summaries are presented as earlier commentary on the Economy page.
  Migration changed that experience before the replacement was operational.
* `sudo -n` required a password; the agent could not access the finstats home,
  private scheduler logs or crontab. T3 browser startup also failed on missing host
  libraries. Neither deployment nor final browser verification is complete.
* Chart range controls were reported broken by the owner. No reproduction or
  cause was established; do not assume missing history explains the behavior.
* #42's five example cases are documented in `release-summary-worker.md` with
  human review pending. Passing agent checks are not human approval.

A read-only diagnostic was prepared at `/tmp/finstats-recovery-diagnose.py` for
execution as finstats. It reports sanitized schedule/runtime/failure categories
without inference or production changes. Temporary files may disappear: inspect
or recreate it before use. The owner has not yet supplied its diagnostic output.

Do not start a replacement implementation from this note. Inspect the existing
runtime, preserve reports/private state and rollback, establish the failure, then
make the smallest repair and prove the restored user journey.
