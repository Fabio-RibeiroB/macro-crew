#!/usr/bin/env python3
"""UK Macro Crew Scheduler

Manages scheduled CrewAI runs based on next publication dates
in research_report.json.

Usage:
    ./scheduler.py list       Show all next publication dates
    ./scheduler.py status     Show the next scheduled run
    ./scheduler.py run        Check if today is a publication date; run crew if so
"""

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from uk_macro_crew.official_schedule import fetch_official_release_schedule

PROJECT_DIR = Path("/home/finstats/public_html/macro-crew")
REPORT_FILE = PROJECT_DIR / "research_report.json"
HISTORY_FILE = PROJECT_DIR / "history_report.json"
DIST_DIR = PROJECT_DIR / "dist"
PUBLIC_DIR = PROJECT_DIR / "public"
LOG_FILE = Path("/home/finstats/logs/scheduler.log")
AI_STATUS_NAME = "ai_status.json"
AI_STATUS_SCHEMA_VERSION = 1

# Full path to uv — cron has minimal PATH
UV_BIN = Path("/home/finstats/.local/bin/uv")
CREW_CMD = [str(UV_BIN), "run", "run_crew"]
CREW_TIMEOUT = 1800  # 30 minutes — LLM calls can be slow
# One retry, only when the model's output was rejected by schema validation
# (e.g. a source outside the approved domains). Never retry other failures such
# as credit, spend-cap or authentication errors. The AI admission gate must also
# allow two daily attempts (FINSTATS_AI_DAILY_ATTEMPTS=2) for the retry to run.
MAX_CREW_ATTEMPTS = 2
RETRYABLE_MARKER = "schema validation failed"
WEEKLY_REBUILD_WEEKDAY = 6  # Sunday
MAX_SNAPSHOT_AGE_DAYS = 7


def should_retry_crew(result, attempt):
    """Retry only a schema-validation rejection, and only within the attempt cap."""
    if result.returncode == 0 or attempt >= MAX_CREW_ATTEMPTS:
        return False
    return RETRYABLE_MARKER in (result.stderr or "")


# Conservative markers for the public failure kind. Order matters: OpenAI reports
# exhausted credit as an HTTP 429, so credit is checked before rate limits. Only the
# resulting kind is ever published, never the matched text.
FAILURE_MARKERS = (
    ("validation", (re.compile(r"schema validation failed"),)),
    ("credit", (
        re.compile(r"insufficient_quota"),
        re.compile(r"exceeded your current quota"),
        re.compile(r"\bbilling\b"),
        re.compile(r"payment required"),
        re.compile(r"(?:insufficient|out of|exceeded your) credits?\b"),
        re.compile(r"(?:status(?:[ _]code)?|error code|http)\W{0,3}402\b"),
    )),
    ("auth", (
        re.compile(r"invalid_api_key"),
        re.compile(r"incorrect api key"),
        re.compile(r"authenticationerror"),
        re.compile(r"(?:status(?:[ _]code)?|error code|http)\W{0,3}401\b"),
    )),
    ("rate_limit", (
        re.compile(r"ratelimiterror"),
        re.compile(r"rate_limit_exceeded"),
        re.compile(r"rate limit"),
        re.compile(r"(?:status(?:[ _]code)?|error code|http)\W{0,3}429\b"),
    )),
    ("timeout", (
        re.compile(r"timed out"),
        re.compile(r"timeouterror"),
        re.compile(r"\btimeout\b"),
    )),
)


def classify_failure(result=None, timed_out=False):
    """Map a failed crew process to a public failure kind (never raw text)."""
    if timed_out:
        return "timeout"
    text = " ".join(
        str(getattr(result, attr, "") or "") for attr in ("stderr", "stdout")
    ).lower()
    for kind, patterns in FAILURE_MARKERS:
        if any(pattern.search(text) for pattern in patterns):
            return kind
    return "other"


def _utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _previous_last_success(dest_dirs):
    """Keep the last successful time across failures, from any readable status file."""
    for dest_dir in dest_dirs:
        try:
            previous = json.loads((dest_dir / AI_STATUS_NAME).read_text())
            value = previous.get("last_success_at")
            if isinstance(value, str):
                return value
        except Exception:
            continue
    return None


def write_ai_status(outcome, failure_kind=None, now=None, dest_dirs=None):
    """Write the small public ai_status.json atomically into each destination.

    Contains only the schema version, times, outcome and a coarse failure kind.
    """
    dest_dirs = tuple(dest_dirs) if dest_dirs is not None else (DIST_DIR, PUBLIC_DIR)
    now = now or _utc_now()
    status = {
        "schema_version": AI_STATUS_SCHEMA_VERSION,
        "last_attempt_at": now,
        "outcome": outcome,
        "failure_kind": failure_kind if outcome == "failed" else None,
        "last_success_at": now if outcome == "ok" else _previous_last_success(dest_dirs),
    }
    payload = json.dumps(status, indent=2) + "\n"
    for dest_dir in dest_dirs:
        target = dest_dir / AI_STATUS_NAME
        tmp_name = None
        try:
            fd, tmp_name = tempfile.mkstemp(dir=dest_dir, prefix=".ai_status.", suffix=".tmp")
            with os.fdopen(fd, "w") as handle:
                handle.write(payload)
            os.chmod(tmp_name, 0o644)
            os.replace(tmp_name, target)
            tmp_name = None
            logging.info(f"Wrote AI status ({outcome}) to {target}")
        except Exception as e:
            logging.error(f"Failed to write AI status to {target}: {e}")
        finally:
            if tmp_name:
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
    return status


def setup_logging():
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(LOG_FILE),
            logging.StreamHandler(sys.stdout),
        ],
    )


def load_report():
    with open(REPORT_FILE) as f:
        return json.load(f)


def get_publication_dates(report):
    """Extract next_publication_date and current data date keyed by indicator name."""
    dates = {}
    section_date_fields = {
        "current_economic_indicators": "publication_date",
        "current_report_summaries": "report_date",
    }
    for section, date_field in section_date_fields.items():
        if section not in report:
            continue
        for key, value in report[section].items():
            if not isinstance(value, dict):
                continue
            if "next_publication_date" not in value:
                continue
            dates[key] = {
                "next_publication_date": value.get("next_publication_date", "not available"),
                "current_date": value.get(date_field, ""),
                "schedule_source": "snapshot",
            }
    return dates


def enrich_with_official_dates(report_dates):
    enriched = {key: value.copy() for key, value in report_dates.items()}
    try:
        official_dates = fetch_official_release_schedule()
    except Exception as exc:
        logging.warning("Failed to refresh official release schedule, falling back to snapshot dates: %s", exc)
        return enriched

    for key, value in official_dates.items():
        current = enriched.get(
            key,
            {
                "current_date": "",
                "next_publication_date": "not available",
                "schedule_source": "snapshot",
            },
        )
        current["next_publication_date"] = value.get("next_publication_date", current["next_publication_date"])
        current["schedule_source"] = "official"
        current["schedule_url"] = value.get("source", "not available")
        enriched[key] = current

    return enriched


def should_force_weekly_refresh(today):
    return today.weekday() == WEEKLY_REBUILD_WEEKDAY


def is_snapshot_stale(report, today):
    metadata = report.get("metadata", {})
    last_updated = metadata.get("last_updated") or metadata.get("generated_at")
    if not last_updated:
        return True
    try:
        snapshot_date = date.fromisoformat(last_updated[:10])
    except ValueError:
        return True
    return (today - snapshot_date).days >= MAX_SNAPSHOT_AGE_DAYS


def is_due_or_overdue(indicator_info, today):
    """Return True if indicator needs collection today or is overdue."""
    next_pub = indicator_info.get("next_publication_date", "not available")
    current = indicator_info.get("current_date", "")
    if next_pub == "not available" or not next_pub:
        return False
    # ISO date strings compare correctly as plain strings
    return today >= next_pub and current < next_pub


def cmd_list(args):
    """Show all next publication dates from the report."""
    report = load_report()
    today_obj = date.today()
    today = today_obj.isoformat()
    dates = enrich_with_official_dates(get_publication_dates(report))

    print(f"\nNext publication dates (today is {today}):\n")
    print(f"  {'Indicator':<35} {'Next Pub Date':<14} {'Source':<10} Note")
    print(f"  {'-'*35} {'-'*14} {'-'*10} {'-'*15}")

    def sort_key(item):
        next_pub = item[1]["next_publication_date"]
        return next_pub if next_pub != "not available" else "9999-99-99"

    for indicator, info in sorted(dates.items(), key=sort_key):
        next_pub = info["next_publication_date"]
        if next_pub == "not available":
            note = "SKIPPED"
        elif is_due_or_overdue(info, today) and next_pub < today:
            note = "OVERDUE - will trigger"
        elif next_pub == today:
            note = "TODAY - will trigger"
        else:
            note = ""
        schedule_source = info.get("schedule_source", "snapshot")
        print(f"  {indicator:<35} {next_pub:<14} {schedule_source:<10} {note}")
    if should_force_weekly_refresh(today_obj):
        print("\n  Weekly rebuild is due today.")
    print()


def cmd_status(args):
    """Show the next scheduled run — the earliest future publication date."""
    report = load_report()
    today_obj = date.today()
    today = today_obj.isoformat()
    dates = enrich_with_official_dates(get_publication_dates(report))
    metadata = report.get("metadata", {})
    last_updated_raw = metadata.get("last_updated") or metadata.get("generated_at")
    last_updated_display = "not available"
    last_updated_date = None
    if last_updated_raw:
        try:
            parsed = datetime.fromisoformat(last_updated_raw.replace("Z", "+00:00"))
            last_updated_display = parsed.strftime("%Y-%m-%d %H:%M:%S")
            last_updated_date = parsed.date()
        except ValueError:
            last_updated_display = last_updated_raw

    flat = {k: v["next_publication_date"] for k, v in dates.items()
            if v["next_publication_date"] != "not available"}
    unavailable = [k for k, v in dates.items()
                   if v["next_publication_date"] == "not available"]
    due_today = [k for k, v in flat.items() if v == today]
    future = {k: v for k, v in flat.items() if v > today}
    overdue = {k: v for k, v in flat.items() if v < today}

    print(f"\nScheduler status (today is {today}, cron runs daily at 17:00):\n")
    print(f"  Last successful update: {last_updated_display}")

    if should_force_weekly_refresh(today_obj):
        print("  Weekly rebuild: due today")
    elif is_snapshot_stale(report, today_obj):
        print("  Snapshot freshness fallback: stale snapshot will trigger refresh")

    if overdue:
        print("  OVERDUE (will trigger on next cron run):")
        for k, v in sorted(overdue.items(), key=lambda x: x[1]):
            current = dates[k]["current_date"]
            print(f"    {k:<35} due {v}  (last collected: {current})")
        most_recent_overdue = max(overdue.values())
        if last_updated_date is None or last_updated_date < date.fromisoformat(most_recent_overdue):
            print("  WARNING: Report appears stale - crew may be failing. Check logs at /home/finstats/logs/scheduler.log")

    if due_today:
        print("  DUE TODAY (will run at 17:00):")
        for k in due_today:
            print(f"    {k}")

    if future:
        next_date = min(future.values())
        next_indicators = [k for k, v in future.items() if v == next_date]
        print(f"\n  Next run: {next_date} at 17:00")
        print(f"  Indicators due: {', '.join(next_indicators)}")

        remaining = {k: v for k, v in future.items() if v != next_date}
        if remaining:
            print("\n  Further dates:")
            for k, v in sorted(remaining.items(), key=lambda x: x[1]):
                print(f"    {k:<35} {v}")
    elif not due_today:
        print("  No future publication dates found in the report.")

    if unavailable:
        print("\n  No date available (skipped):")
        for k in unavailable:
            print(f"    {k}")

    print()


def cmd_run(args):
    """Cron entry point: run the crew if today is a publication date."""
    setup_logging()
    today_obj = date.today()
    today = today_obj.isoformat()

    try:
        report = load_report()
    except Exception as e:
        logging.error(f"Failed to load report: {e}")
        sys.exit(1)

    dates = enrich_with_official_dates(get_publication_dates(report))
    triggered = [k for k, v in dates.items() if is_due_or_overdue(v, today)]
    weekly_rebuild = should_force_weekly_refresh(today_obj)
    stale_snapshot = is_snapshot_stale(report, today_obj)

    if not triggered and not weekly_rebuild and not stale_snapshot:
        logging.info(f"No publications due or overdue ({today}). Nothing to do.")
        return

    due_today = [k for k in triggered if dates[k]["next_publication_date"] == today]
    overdue = [k for k in triggered if dates[k]["next_publication_date"] < today]

    if due_today:
        logging.info(f"Publications due today ({today}): {', '.join(due_today)}")
    if overdue:
        for name in overdue:
            next_pub = dates[name]["next_publication_date"]
            logging.warning(
                f"OVERDUE: {name} — was due {next_pub}, not yet collected (today {today})"
            )
    if weekly_rebuild:
        logging.info("Weekly rebuild due today; forcing refresh even without a release trigger.")
    if stale_snapshot:
        logging.warning("Snapshot is stale; forcing refresh to avoid serving outdated data.")

    if triggered:
        logging.info(f"Starting crew run for: {', '.join(triggered)}")
    else:
        logging.info("Starting crew run for forced refresh.")
    logging.info(f"Command: {' '.join(CREW_CMD)}")

    start = time.time()

    result = None
    for attempt in range(1, MAX_CREW_ATTEMPTS + 1):
        try:
            result = subprocess.run(
                CREW_CMD,
                cwd=PROJECT_DIR,
                capture_output=True,
                text=True,
                timeout=CREW_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            logging.error(f"FAILURE: Crew run timed out after {CREW_TIMEOUT}s")
            write_ai_status("failed", classify_failure(timed_out=True))
            sys.exit(1)
        except FileNotFoundError:
            logging.error(
                f"FAILURE: Command not found: {CREW_CMD[0]}. "
                "Is uv installed? Check UV_BIN in scheduler.py."
            )
            write_ai_status("failed", "other")
            sys.exit(1)
        except Exception as e:
            logging.error(f"FAILURE: Error running crew: {e}")
            write_ai_status("failed", "other")
            sys.exit(1)
        if not should_retry_crew(result, attempt):
            break
        logging.warning(
            "Crew output failed schema validation; retrying once "
            f"(attempt {attempt + 1} of {MAX_CREW_ATTEMPTS})."
        )

    elapsed = int(time.time() - start)

    if result.returncode != 0:
        logging.error(f"FAILURE: Crew run exited with code {result.returncode} after {elapsed}s")
        if result.stderr:
            logging.error(f"stderr (last 1000 chars): {result.stderr[-1000:]}")
        if result.stdout:
            logging.error(f"stdout (last 500 chars): {result.stdout[-500:]}")
        write_ai_status("failed", classify_failure(result))
        sys.exit(1)

    logging.info(f"SUCCESS: Crew run completed in {elapsed}s")

    # Log a snippet of stdout for audit trail
    if result.stdout:
        logging.info(f"Crew output (last 300 chars): {result.stdout[-300:]}")

    # Copy updated artifacts to dist/ and public/
    for dest_dir in (DIST_DIR, PUBLIC_DIR):
        for source_file in (REPORT_FILE, HISTORY_FILE):
            target = dest_dir / source_file.name
            try:
                shutil.copy2(source_file, target)
                logging.info(f"Copied report to {target}")
            except Exception as e:
                logging.error(f"Failed to copy report to {target}: {e}")

    write_ai_status("ok")
    logging.info("Done.")


def main():
    parser = argparse.ArgumentParser(
        description="UK Macro Crew Scheduler",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("list", help="Show all next publication dates")
    sub.add_parser("status", help="Show the next scheduled run")
    sub.add_parser("run", help="Run crew if today is a publication date (cron entry point)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "list": cmd_list,
        "status": cmd_status,
        "run": cmd_run,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
