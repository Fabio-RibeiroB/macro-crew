#!/usr/bin/env bash
# Local developer tool: delete local branches already merged into origin/main.
#
#   scripts/prune-merged.sh          dry run: list "would delete" / "kept (reason)"
#   scripts/prune-merged.sh --apply  delete (git branch -d only, never -D)
#
# Kept: main, the current branch, branches with an open PR (or when gh is
# unavailable so that cannot be checked), unmerged branches, and branches checked
# out in a worktree unless that worktree is under .claude/worktrees/ and clean,
# in which case the worktree is removed first. Run from inside the repository.
set -euo pipefail

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

git fetch --prune origin
git worktree prune
git rev-parse --verify -q refs/remotes/origin/main >/dev/null || { echo "origin/main not found" >&2; exit 1; }

current=$(git symbolic-ref -q --short HEAD || true)
have_gh=0
if command -v gh >/dev/null 2>&1; then have_gh=1; fi

# Map branch -> worktree path from the porcelain listing.
declare -A wt_of=()
wt_path=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) wt_path=${line#worktree } ;;
    "branch refs/heads/"*) wt_of["${line#branch refs/heads/}"]="$wt_path" ;;
    *) ;;
  esac
done < <(git worktree list --porcelain)

while IFS= read -r b; do
  [[ -n "$b" ]] || continue
  if [[ "$b" == main ]]; then continue; fi
  if [[ "$b" == "$current" ]]; then echo "kept ($b: current branch)"; continue; fi
  if ! git merge-base --is-ancestor "refs/heads/$b" refs/remotes/origin/main; then
    echo "kept ($b: not merged into origin/main)"; continue
  fi
  if (( have_gh == 0 )); then echo "kept ($b: gh unavailable, open PR status uncertain)"; continue; fi
  if ! open=$(gh pr list --state open --head "$b" --json number --jq length 2>/dev/null) || [[ ! "$open" =~ ^[0-9]+$ ]]; then
    echo "kept ($b: could not check open PRs)"; continue
  fi
  if (( open > 0 )); then echo "kept ($b: open PR)"; continue; fi

  wt="${wt_of[$b]:-}"
  if [[ -n "$wt" ]]; then
    if [[ "$wt" != *"/.claude/worktrees/"* ]]; then echo "kept ($b: checked out in worktree $wt)"; continue; fi
    if [[ -n "$(git -C "$wt" status --porcelain 2>/dev/null || echo unknown)" ]]; then
      echo "kept ($b: worktree $wt is not clean)"; continue
    fi
    if (( APPLY == 1 )); then
      if git worktree remove "$wt"; then echo "removed worktree $wt"; else echo "kept ($b: could not remove worktree $wt)"; continue; fi
    else
      echo "would remove worktree $wt"
    fi
  fi

  if (( APPLY == 1 )); then
    if git branch -d "$b" >/dev/null 2>&1; then echo "deleted $b"; else echo "kept ($b: git branch -d refused)"; fi
  else
    echo "would delete $b"
  fi
done < <(git for-each-ref --format='%(refname:short)' refs/heads)

if (( APPLY == 0 )); then echo "dry run: nothing changed. Re-run with --apply to delete."; fi
