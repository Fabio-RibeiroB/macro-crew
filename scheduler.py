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
    """Extract all next_publication_date values keyed by indicator name."""
    dates = {}
    for section in ("current_economic_indicators", "current_report_summaries"):
        if section not in report:
            continue
        for key, value in report[section].items():
            if isinstance(value, dict) and "next_publication_date" in value:
                dates[key] = value["next_publication_date"]
    return dates


def cmd_list(args):
    """Show all next publication dates from the report."""
    report = load_report()
    dates = get_publication_dates(report)
    today = date.today().isoformat()

    print(f"\nNext publication dates (today is {today}):\n")
    print(f"  {'Indicator':<35} {'Date':<12} Note")
    print(f"  {'-'*35} {'-'*12} {'-'*10}")

    for indicator, pub_date in sorted(dates.items(), key=lambda x: x[1]):
        if pub_date < today:
            note = "OVERDUE"
        elif pub_date == today:
            note = "TODAY"
        else:
            note = ""
        print(f"  {indicator:<35} {pub_date:<12} {note}")
    print()


def cmd_status(args):
    """Show the next scheduled run — the earliest future publication date."""
    report = load_report()
    dates = get_publication_dates(report)
    today = date.today().isoformat()

    due_today = [k for k, v in dates.items() if v == today]
    future = {k: v for k, v in dates.items() if v > today}
    overdue = {k: v for k, v in dates.items() if v < today}

    print(f"\nScheduler status (today is {today}, cron runs daily at 17:00):\n")

    if overdue:
        print("  OVERDUE:")
        for k, v in sorted(overdue.items(), key=lambda x: x[1]):
            print(f"    {k:<35} {v}")

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
    due_today = [k for k, v in dates.items() if v == today]

    if not due_today:
        logging.info(f"No publications due today ({today}). Nothing to do.")
        return

    logging.info(f"Publications due today ({today}): {', '.join(due_today)}")
    logging.info(f"Starting crew run: {' '.join(CREW_CMD)}")

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
