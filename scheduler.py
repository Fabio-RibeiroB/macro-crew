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
import shutil
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

PROJECT_DIR = Path("/home/finstats/public_html/macro-crew")
REPORT_FILE = PROJECT_DIR / "research_report.json"
DIST_DIR = PROJECT_DIR / "dist"
PUBLIC_DIR = PROJECT_DIR / "public"
LOG_FILE = Path("/home/finstats/logs/scheduler.log")

# Full path to uv — cron has minimal PATH
UV_BIN = Path("/home/finstats/.local/bin/uv")
CREW_CMD = [str(UV_BIN), "run", "run_crew"]
CREW_TIMEOUT = 1800  # 30 minutes — LLM calls can be slow


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
            }
    return dates


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
    dates = get_publication_dates(report)
    today = date.today().isoformat()

    print(f"\nNext publication dates (today is {today}):\n")
    print(f"  {'Indicator':<35} {'Next Pub Date':<14} Note")
    print(f"  {'-'*35} {'-'*14} {'-'*15}")

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
        print(f"  {indicator:<35} {next_pub:<14} {note}")
    print()


def cmd_status(args):
    """Show the next scheduled run — the earliest future publication date."""
    report = load_report()
    dates = get_publication_dates(report)
    today = date.today().isoformat()

    flat = {k: v["next_publication_date"] for k, v in dates.items()
            if v["next_publication_date"] != "not available"}
    unavailable = [k for k, v in dates.items()
                   if v["next_publication_date"] == "not available"]
    due_today = [k for k, v in flat.items() if v == today]
    future = {k: v for k, v in flat.items() if v > today}
    overdue = {k: v for k, v in flat.items() if v < today}

    print(f"\nScheduler status (today is {today}, cron runs daily at 17:00):\n")

    if overdue:
        print("  OVERDUE (will trigger on next cron run):")
        for k, v in sorted(overdue.items(), key=lambda x: x[1]):
            current = dates[k]["current_date"]
            print(f"    {k:<35} due {v}  (last collected: {current})")

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
    today = date.today().isoformat()

    try:
        report = load_report()
    except Exception as e:
        logging.error(f"Failed to load report: {e}")
        sys.exit(1)

    dates = get_publication_dates(report)
    triggered = [k for k, v in dates.items() if is_due_or_overdue(v, today)]

    if not triggered:
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

    logging.info(f"Starting crew run for: {', '.join(triggered)}")
    logging.info(f"Command: {' '.join(CREW_CMD)}")

    start = time.time()

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
        sys.exit(1)
    except FileNotFoundError:
        logging.error(
            f"FAILURE: Command not found: {CREW_CMD[0]}. "
            "Is uv installed? Check UV_BIN in scheduler.py."
        )
        sys.exit(1)
    except Exception as e:
        logging.error(f"FAILURE: Error running crew: {e}")
        sys.exit(1)

    elapsed = int(time.time() - start)

    if result.returncode != 0:
        logging.error(f"FAILURE: Crew run exited with code {result.returncode} after {elapsed}s")
        if result.stderr:
            logging.error(f"stderr (last 1000 chars): {result.stderr[-1000:]}")
        if result.stdout:
            logging.error(f"stdout (last 500 chars): {result.stdout[-500:]}")
        sys.exit(1)

    logging.info(f"SUCCESS: Crew run completed in {elapsed}s")

    # Log a snippet of stdout for audit trail
    if result.stdout:
        logging.info(f"Crew output (last 300 chars): {result.stdout[-300:]}")

    # Copy updated report to dist/ and public/
    for dest_dir in (DIST_DIR, PUBLIC_DIR):
        target = dest_dir / "research_report.json"
        try:
            shutil.copy2(REPORT_FILE, target)
            logging.info(f"Copied report to {target}")
        except Exception as e:
            logging.error(f"Failed to copy report to {target}: {e}")

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
