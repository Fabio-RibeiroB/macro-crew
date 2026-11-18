# Deployment releases

Use an annotated Git tag named `deploy-YYYY-MM-DD.N` for each successful
production code deployment, starting with `deploy-2026-10-21.1`. Increment `N`
for another deployment that day. These are deployment identifiers, not claims
that the FinStats 2.0 roadmap is complete. A deployment tag identifies the exact
source commit; the private deployment receipt identifies the built artifact and
previous release. Do not move or reuse published tags.

After deployment verification, publish a short GitHub release for that tag with
the visible changes, validation, known limitations and rollback reference. Do not
attach source archives containing local state, credentials or reports. GitHub's
normal archive of tracked source contains only the repository's tracked files.
The npm package version does not need changing for these static-site deployments.

Follow [the cutover procedure](dashboard-cutover.md). Before updating production,
record the source commit, served-release target and publisher timer state. Preserve
the intentionally modified legacy report files and the untracked legacy lockfile.
Use SQLite's backup API for a consistent private database backup, and retain the
raw evidence and public generations. Never package credentials or private config.

Build from the reviewed commit outside the served directory with a clean
environment and reviewed public inputs. Run frontend/core tests, static-output
checks, JSON checksum validation and direct-route checks. Copy the current legacy
archive reports and add the approved public-data symlink only after the static
build checks. Switch the served symlink atomically, retain the previous release,
and verify public routes, assets, figures, charts, archive and restricted paths.

Keep a mode-0600 JSON receipt outside all web roots containing the deployed
commit/tag, release directory, previous symlink target, checks performed and
deployment time. Store backup locations there; never store secret values. A
frontend rollback restores the previous release symlink. If backend source was
also advanced, restore compatible source separately while preserving generated
reports, the database and source evidence; never reset the dirty production
checkout or downgrade a statistical database without a compatibility review.

Official statistics update independently every 30 minutes through the publisher.
Routine data refreshes do not require application tags or frontend rebuilds.

## Release script

Production deployments run `deploy/release.sh` as the `finstats` user. It checks
the 4 GB account quota (aborts above 3600 MB), backs up the live release (without
published data), builds `origin/main` outside the served directory, runs the tests,
switches `dist` atomically, fast-forwards the checkout and writes a mode-0600
`receipt.json` into the backup directory. The release name is
`deploy-YYYY-MM-DD.N` with the next free `N`.

After a successful switch it prunes, keeping only the live release, the previous
release and the newest backup. It deletes only directories named exactly
`~/releases/deploy-YYYY-MM-DD.N` and `~/backups/macro-crew/YYYYMMDDTHHMMSSZ`, never
the live target, never through symlinks, and never `~/published-data` or
`~/.local/state`. To list candidates without removing anything:

```
deploy/release.sh --prune-only --dry-run
```

Drop `--dry-run` to prune without deploying. `scripts/prune-merged.sh` is a separate
local developer tool for merged branches and clean agent worktrees (dry run by
default; `--apply` deletes).
