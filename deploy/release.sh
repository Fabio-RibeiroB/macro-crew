#!/usr/bin/env bash
# FinStats production release. Runs as the finstats user (HOME=/home/finstats).
#
#   deploy/release.sh                       full deploy of origin/main
#   deploy/release.sh --prune-only          only prune old releases and backups
#   deploy/release.sh --prune-only --dry-run  list what would be removed, remove nothing
#
# Order: disk guard, backup, build from `git archive origin/main` outside the
# served directory, switch the dist symlink atomically, fast-forward the checkout,
# then prune. Never prints or stores secret values.
#
# Test overrides (production defaults in brackets):
#   FINSTATS_HOME        account home [$HOME]
#   FINSTATS_SITE        checkout containing the dist symlink [$FINSTATS_HOME/public_html/macro-crew]
#   FINSTATS_MAX_USED_MB abort a deploy above this usage [3600; hard quota is 4096]
#   FINSTATS_TODAY       date used in the release name [today]
set -euo pipefail

FINSTATS_HOME="${FINSTATS_HOME:-$HOME}"
SITE="${FINSTATS_SITE:-$FINSTATS_HOME/public_html/macro-crew}"
RELEASES="$FINSTATS_HOME/releases"
BACKUPS="$FINSTATS_HOME/backups/macro-crew"
PUBLISHED="$FINSTATS_HOME/published-data"
BUILD_TMP="$FINSTATS_HOME/build-tmp"
MAX_USED_MB="${FINSTATS_MAX_USED_MB:-3600}"

RELEASE_RE='^deploy-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'
BACKUP_RE='^[0-9]{8}T[0-9]{6}Z$'

REMOVED=()

log() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

used_mb() {
  local out
  out=$(du -sm -- "$FINSTATS_HOME" 2>/dev/null | cut -f1 || true)
  if [[ "$out" =~ ^[0-9]+$ ]]; then printf '%s\n' "$out"; else printf 'unknown\n'; fi
}

check_disk_guard() {
  local used
  used=$(used_mb)
  if [[ "$used" == unknown ]]; then
    warn "could not measure account usage; continuing without the free-space guard"
    return 0
  fi
  if (( used > MAX_USED_MB )); then
    die "account uses ${used} MB, above the ${MAX_USED_MB} MB guard (hard quota 4096 MB). Run '$0 --prune-only' first."
  fi
  log "disk guard ok: ${used} MB used (limit ${MAX_USED_MB} MB)"
}

# One more than today's highest N, never a gap left by pruning, so names only go up.
# The live and previous releases are never pruned, so the highest N always survives.
next_release_name() {
  local today n=0 entry num
  today=${FINSTATS_TODAY:-$(date +%F)}
  for entry in "$RELEASES/deploy-$today".*; do
    num=${entry##*/deploy-"$today".}
    [[ "$num" =~ ^[0-9]+$ ]] && (( 10#$num > n )) && n=$((10#$num))
  done
  printf 'deploy-%s.%s\n' "$today" "$((n + 1))"
}

# Names of real (non-symlink) directories in $1 that match regex $2, oldest first.
list_matching() {
  local dir="$1" re="$2" entry name
  [[ -d "$dir" ]] || return 0
  for entry in "$dir"/*; do
    name=${entry##*/}
    [[ "$name" =~ $re ]] || continue
    [[ -d "$entry" && ! -L "$entry" ]] || continue
    printf '%s\n' "$name"
  done | sort -V
}

# Remove one expected directory. Never follows symlinks and never leaves $parent.
remove_dir() {
  local parent="$1" name="$2" live="$3" dry="$4" path
  path="$parent/$name"
  [[ -d "$path" && ! -L "$path" ]] || return 0
  [[ "$(readlink -f -- "$path")" != "$live" ]] || { log "kept (live): $path"; return 0; }
  if [[ "$dry" == 1 ]]; then
    log "would remove: $path"
  else
    rm -rf --one-file-system -- "$path"
    log "removed: $path"
  fi
  REMOVED+=("$path")
}

# prune_all LIVE PREVIOUS DRY [KEEP_BACKUP]
#   LIVE      resolved path of the live release (never removed)
#   PREVIOUS  name or path of the release to keep as rollback (may be empty)
#   DRY       1 = list only
#   KEEP_BACKUP  backup name to keep in addition to the newest one (may be empty)
# Only ~/releases/deploy-YYYY-MM-DD.N and ~/backups/macro-crew/YYYYMMDDTHHMMSSZ
# directories are ever candidates; anything else is left alone.
prune_all() {
  local live="$1" previous="${2:-}" dry="${3:-0}" keep_backup="${4:-}"
  local name newest_backup="" prev_name=""
  [[ -n "$live" ]] || die "prune: live target is unknown; refusing to prune"
  [[ "$FINSTATS_HOME" == /* && "$RELEASES" == /* && "$BACKUPS" == /* ]] || die "prune: paths must be absolute"
  prev_name=${previous##*/}

  if [[ -d "$RELEASES" ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      if [[ "$name" == "$prev_name" ]]; then log "kept (previous): $RELEASES/$name"; continue; fi
      remove_dir "$RELEASES" "$name" "$live" "$dry"
    done < <(list_matching "$RELEASES" "$RELEASE_RE")
  fi

  if [[ -d "$BACKUPS" ]]; then
    newest_backup=$(list_matching "$BACKUPS" "$BACKUP_RE" | tail -n 1)
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      if [[ "$name" == "$newest_backup" || "$name" == "$keep_backup" ]]; then
        log "kept (newest backup): $BACKUPS/$name"; continue
      fi
      remove_dir "$BACKUPS" "$name" "$live" "$dry"
    done < <(list_matching "$BACKUPS" "$BACKUP_RE")
  fi
}

# Newest release directory other than LIVE (used by --prune-only as the rollback).
newest_other_release() {
  local live="$1" name found=""
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    [[ "$(readlink -f -- "$RELEASES/$name")" == "$live" ]] && continue
    found="$name"
  done < <(list_matching "$RELEASES" "$RELEASE_RE")
  printf '%s\n' "$found"
}

summary() {
  local live="$1" dry="$2" label="removed"
  [[ "$dry" == 1 ]] && label="would remove"
  log "---"
  log "LIVE: $live"
  if (( ${#REMOVED[@]} == 0 )); then
    log "$label: nothing"
  else
    local p
    for p in "${REMOVED[@]}"; do log "$label: $p"; done
  fi
  log "disk use: $(used_mb) MB"
}

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "$s"
}

write_receipt() {
  local file="$1" commit="$2" precommit="$3" rel="$4" prev="$5" backup="$6" ts="$7"
  ( umask 077
    {
      printf '{\n'
      printf '  "deployed_commit": "%s",\n' "$(json_escape "$commit")"
      printf '  "previous_commit": "%s",\n' "$(json_escape "$precommit")"
      printf '  "release_dir": "%s",\n' "$(json_escape "$rel")"
      printf '  "previous_dist_target": "%s",\n' "$(json_escape "$prev")"
      printf '  "backup_dir": "%s",\n' "$(json_escape "$backup")"
      printf '  "timestamp": "%s"\n' "$(json_escape "$ts")"
      printf '}\n'
    } > "$file" )
  chmod 600 "$file"
}

# Run a command, keeping its output in a log. Show the tail on success and
# the longer tail on failure; return the command's own status (no pipe masking).
run_logged() {
  local tail_n="$1"; shift
  local logfile rc=0
  logfile=$(mktemp)
  "$@" >"$logfile" 2>&1 || rc=$?
  if (( rc != 0 )); then tail -n 40 "$logfile"; else tail -n "$tail_n" "$logfile"; fi
  rm -f -- "$logfile"
  return "$rc"
}

SRC=""
REL=""
SWITCHED=0
cleanup() {
  local rc=$?
  cd "$FINSTATS_HOME" 2>/dev/null || true
  if [[ -n "$SRC" && "$SRC" == "$BUILD_TMP"/src-* && -d "$SRC" && ! -L "$SRC" ]]; then rm -rf -- "$SRC"; fi
  if (( rc != 0 && SWITCHED == 0 )) && [[ -n "$REL" && "$REL" == "$RELEASES"/deploy-* && -d "$REL" && ! -L "$REL" ]]; then
    warn "deploy failed before the switch; removing partial release $REL"
    rm -rf --one-file-system -- "$REL"
  fi
  return "$rc"
}

deploy() {
  local ts backup live_target short_sha commit rel_name
  trap cleanup EXIT
  check_disk_guard

  ts=$(date -u +%Y%m%dT%H%M%SZ)
  backup="$BACKUPS/$ts"
  mkdir -p -m 700 "$BACKUPS" "$backup"
  cd "$SITE"
  git rev-parse HEAD > "$backup/precommit.txt"
  crontab -l > "$backup/crontab.txt" 2>/dev/null || echo "# no crontab" > "$backup/crontab.txt"
  live_target=$(readlink -f -- dist)
  printf '%s\n' "$live_target" > "$backup/dist-target.txt"

  if [[ -d "$live_target" ]]; then
    # Excludes must precede the path. Published data is never archived.
    local rc=0
    tar -C "$live_target/.." --exclude=data --exclude='*/data' -chf "$backup/release.tar" "$(basename "$live_target")" || rc=$?
    if (( rc == 1 )); then warn "tar reported changed files (status 1); continuing"
    elif (( rc != 0 )); then die "backup tar failed with status $rc"; fi
  else
    warn "live dist target is not a directory; skipping release archive"
  fi
  cp research_report.json history_report.json "$backup/"
  cp "$PUBLISHED/current.json" "$backup/current.json"

  git fetch -q
  short_sha=$(git rev-parse --short origin/main)
  commit=$(git rev-parse origin/main)
  SRC="$BUILD_TMP/src-$short_sha"
  rm -rf -- "$SRC"; mkdir -p "$SRC"
  git archive origin/main | tar -x -C "$SRC"

  (
    cd "$SRC"
    npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1 || { echo "npm ci failed" >&2; exit 1; }
    run_logged 8 npm test || { echo "tests failed; aborting before build" >&2; exit 1; }
  ) || die "install or tests failed; nothing was built or switched"

  rel_name=$(next_release_name)
  REL="$RELEASES/$rel_name"
  mkdir -p "$RELEASES"
  [[ ! -e "$REL" ]] || die "release $REL already exists"
  ( cd "$SRC" && run_logged 4 npm run build -- --outDir "$REL" ) || die "build failed"
  [[ -f "$REL/index.html" ]] || die "build output has no index.html"

  ln -s "$PUBLISHED" "$REL/data"
  cp "$SITE/research_report.json" "$SITE/history_report.json" "$REL/"
  if [[ -f "$SITE/dist/ai_status.json" ]]; then cp "$SITE/dist/ai_status.json" "$REL/"; fi
  if [[ ! -f "$REL/.htaccess" ]]; then cp "$live_target/.htaccess" "$REL/"; fi
  cd "$FINSTATS_HOME"; rm -rf -- "$SRC"; SRC=""

  cd "$SITE"
  ln -sfn "$REL" dist.new && mv -T dist.new dist
  SWITCHED=1
  if git merge-base --is-ancestor HEAD origin/main; then
    git checkout -q --detach origin/main
  else
    warn "checkout HEAD is not an ancestor of origin/main; left unchanged"
  fi

  write_receipt "$backup/receipt.json" "$commit" "$(cat "$backup/precommit.txt")" "$REL" "$live_target" "$backup" "$ts"

  prune_all "$(readlink -f -- "$SITE/dist")" "$live_target" 0 "$ts"
  summary "$(readlink -f -- "$SITE/dist")" 0
}

prune_only() {
  local dry="$1" live previous
  live=$(readlink -f -- "$SITE/dist" 2>/dev/null || true)
  [[ -n "$live" && -e "$live" ]] || die "cannot resolve the live dist target under $SITE"
  previous=$(newest_other_release "$live")
  prune_all "$live" "$previous" "$dry"
  summary "$live" "$dry"
}

main() {
  local mode=deploy dry=0 arg
  for arg in "$@"; do
    case "$arg" in
      --prune-only) mode=prune ;;
      --dry-run) dry=1 ;;
      -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}"; return 0 ;;
      *) printf 'unknown option: %s\n' "$arg" >&2; return 2 ;;
    esac
  done
  if [[ "$mode" == deploy && "$dry" == 1 ]]; then
    printf -- '--dry-run is only supported with --prune-only\n' >&2
    return 2
  fi
  if [[ "$mode" == prune ]]; then prune_only "$dry"; else deploy; fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
