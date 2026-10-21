# Repository cleanup report — 21 October 2026

This PR follows the security PR, with only housekeeping changes in its diff.
Production, repository settings and existing branches are unchanged. Deletion
candidates below are **proposed**, not deleted; the owner can review them first.

## Cleaned in this PR

* Removed unused generated UI scaffolding and old duplicate indicator, report,
  calendar and explanation components. Entry-point/import inspection confirms
  that the current app uses only `HistoricalTrendCard` from that directory.
  The active dashboard, sources, charts and archived summaries remain.
* Reduced frontend direct runtime dependencies to React, React DOM, Lucide,
  Recharts and Tailwind animation CSS. Removed unused Radix/MUI/forms/carousel/DnD
  and other scaffold dependencies, with a regenerated npm lockfile. Tailwind/Vite
  and chart utilities remain. Security updates are inherited from the prior PR.
* Removed direct pandas dependency (no source/test imports after the legacy CSV
  tool was removed) and moved pytest responsibility to the existing dev group.
  Exa remains required for the actual legacy research tool. Transitive dependencies
  may still install pandas; this is not a claim to fix the entire legacy tree.
* Removed obsolete PM2 config which ran a Vite dev server on all interfaces.
  Actual production uses Apache static releases, not PM2/Vite.
* Replaced stale README/frontend/developer instructions with the actual two-path
  architecture, current commands, accurate annual CPIH definition, deployment and
  limitations. Removed references to nonexistent JSON tools/tests and false
  assurances about current security or fully reproducible legacy installation.
* Ignore local `.env` variants, private keys, databases/WAL files, private state,
  backups/releases/logs and a `dist` **symlink** as well as directory. Preserve
  `.env.dist`. A future reviewed Python lock is no longer globally ignored.
* CI keeps pinned actions/read-only permissions and adds cancellation of superseded
  runs; npm install scripts are disabled in CI, matching validated development.

## Branch audit / proposed deletions

Fetched origin and checked each local/remote ref with `merge-base --is-ancestor`
and `rev-list origin/main..BRANCH`, using main `1cdfa23`. Each candidate has zero
unique commits. No active PR uses these as its head; no worktrees use them.
Recheck protections, refs, open PRs and ownership immediately before deletion.
Do not use `-D`, force push, or delete anything based solely on age/PR status.

| Proposed local + origin branch | Reason |
| --- | --- |
| `docs/finstats-official-data-architecture` | PR #6 merged, complete ancestor of main |
| `feat/official-series-adapters` | PR #7 merged, complete ancestor of main |
| `feat/official-data-vintages` | PR #8 merged, complete ancestor of main |
| `feat/official-data-shadow-publishing` | PR #9 merged, complete ancestor of main |
| `feat/verified-friendly-dashboard` | PR #11 merged, complete ancestor of main |
| `fix/frontend-cache-revalidation` | PR #12 merged, complete ancestor of main |

Retain `main`; the active security/cleanup/UI branches; and all uncertain refs:

* `cursor/reasoning-effort-per-model-0da1`: draft PR #5, three unique commits.
  Still relevant but needs review/rebase with the new spending controls; retain.
* `ops/finstats-shadow-service`: draft PR #10, two unique commits. Its shadow
  service is superseded by the publisher in #11. Recommend closing #10 after
  preserving its backup/restore instructions; do not delete this branch yet.
* `origin/claude/fix-past-data-calendar-JOTcm`: closed #3, one unique commit.
  Old calendar implementation removed, but closed does not mean merged. Retain
  pending owner confirmation that the work is no longer wanted.
* `origin/cursor/gpt-6-luna-default-0da1`: #4 merged but one commit is not an
  ancestor of main (merge history differs). Keep until patch equivalence and
  any follow-up differences are reviewed. No deletion based only on merged PR.

Closed PR #1 has no remaining origin branch. Merged #2/#4/#6–#9/#11/#12 need no
PR action. Current #5 remains useful; #10 is the closure recommendation. Existing
branches have not been rewritten or deleted. The production checkout stays on main.

## Remaining / owner decisions

* Approve the six branch deletions above, or retain them. Branch protections were
  absent on main; enable required core/frontend checks, PR review and force-push
  restrictions in GitHub. Require checks by their actual current names.
* Automatic delete-on-merge is currently off. Enable it after this review stack is
  resolved; avoid removing a base branch still used by an open stacked PR. No
  repository settings are changed without owner review.
* Private generated production JSON remains intentionally dirty. Tracked root and
  `public/` legacy reports are retained for archive compatibility; stop tracking
  them only with a tested archive-delivery migration, not a bulk cleanup.
* The legacy CrewAI tree has no reproducible current lock and known dependency
  findings. Do not regenerate an untested lock or delete working production data.
  Use the separate stdlib collector runtime; plan a controlled legacy upgrade.
* Keep `knowledge/` templates and old architecture/source documents where they
  explain the migration. Runtime logs/caches/builds stay ignored; no production
  files, credentials, reports, source archives or backups were deleted.

## Validation

Run `npm ci --ignore-scripts`, `npm test`, `npm run build`, `npm audit` and the
README's dependency-light Python suite. Review the deleted-file list against the
active import graph. Browser-check the app before approving the UI PR separately.
