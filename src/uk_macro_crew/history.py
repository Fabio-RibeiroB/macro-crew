import json
import os
import logging
from datetime import datetime
from typing import Any, Dict, List
from uk_macro_crew.official_history import fetch_economic_indicator_history


logger = logging.getLogger(__name__)


def get_history_filename() -> str:
    return "history_report.json"


def _iso_now() -> str:
    return datetime.now().isoformat() + "Z"


def _build_empty_history(now_iso: str) -> Dict[str, Any]:
    return {
        "metadata": {
            "created_at": now_iso,
            "last_updated": now_iso,
            "version": "1.0",
        },
        "history": {
            "economic_indicators": {
                "interest_rate": [],
                "cpih": [],
                "gdp": [],
            },
            "report_summaries": {
                "monetary_policy_report": [],
                "financial_stability_report": [],
            },
        },
    }


def _ensure_history_shape(history_payload: Dict[str, Any], now_iso: str) -> Dict[str, Any]:
    if not isinstance(history_payload, dict):
        return _build_empty_history(now_iso)

    if "metadata" not in history_payload or not isinstance(history_payload["metadata"], dict):
        history_payload["metadata"] = {}

    metadata = history_payload["metadata"]
    metadata.setdefault("created_at", now_iso)
    metadata.setdefault("version", "1.0")

    if "history" not in history_payload or not isinstance(history_payload["history"], dict):
        history_payload["history"] = {}

    history = history_payload["history"]

    if "economic_indicators" not in history or not isinstance(history["economic_indicators"], dict):
        history["economic_indicators"] = {}
    if "report_summaries" not in history or not isinstance(history["report_summaries"], dict):
        history["report_summaries"] = {}

    for key in ("interest_rate", "cpih", "gdp"):
        if key not in history["economic_indicators"] or not isinstance(history["economic_indicators"][key], list):
            history["economic_indicators"][key] = []

    for key in ("monetary_policy_report", "financial_stability_report"):
        if key not in history["report_summaries"] or not isinstance(history["report_summaries"][key], list):
            history["report_summaries"][key] = []

    return history_payload


def _load_history(history_filename: str, now_iso: str) -> Dict[str, Any]:
    if not os.path.exists(history_filename):
        return _build_empty_history(now_iso)

    with open(history_filename, "r", encoding="utf-8") as f:
        payload = json.load(f)

    return _ensure_history_shape(payload, now_iso)


def _upsert_by_date(entries: List[Dict[str, Any]], date_key: str, candidate: Dict[str, Any]) -> None:
    target_date = candidate.get(date_key)
    if not target_date or target_date == "not available":
        return

    for idx, entry in enumerate(entries):
        if entry.get(date_key) == target_date:
            entries[idx] = candidate
            break
    else:
        entries.append(candidate)

    entries.sort(key=lambda item: item.get(date_key, ""))


def _append_snapshot_economic_history(
    economic_history: Dict[str, List[Dict[str, Any]]],
    snapshot_payload: Dict[str, Any],
    now_iso: str,
) -> None:
    indicators = snapshot_payload.get("current_economic_indicators", {})

    for indicator_name in ("interest_rate", "cpih", "gdp"):
        indicator = indicators.get(indicator_name, {})
        candidate = {
            "value": indicator.get("value", "not available"),
            "publication_date": indicator.get("publication_date", "not available"),
            "next_publication_date": indicator.get("next_publication_date", "not available"),
            "source": indicator.get("source", "not available"),
            "collected_at": now_iso,
        }
        _upsert_by_date(economic_history[indicator_name], "publication_date", candidate)


def build_history_from_snapshot(
    snapshot_payload: Dict[str, Any],
    history_filename: str,
    economic_history_fetcher=fetch_economic_indicator_history,
) -> Dict[str, Any]:
    now_iso = _iso_now()
    history_payload = _load_history(history_filename, now_iso)

    economic_history = history_payload["history"]["economic_indicators"]
    report_history = history_payload["history"]["report_summaries"]

    reports = snapshot_payload.get("current_report_summaries", {})

    try:
        official_economic_history = economic_history_fetcher()
        for indicator_name in ("interest_rate", "cpih", "gdp"):
            economic_history[indicator_name] = official_economic_history.get(indicator_name, [])
    except Exception as exc:
        logger.warning(
            "Falling back to snapshot-based economic history because official refresh failed: %s",
            exc,
        )
        _append_snapshot_economic_history(economic_history, snapshot_payload, now_iso)

    for report_name in ("monetary_policy_report", "financial_stability_report"):
        report = reports.get(report_name, {})
        candidate = {
            "summary": report.get("summary", "not available"),
            "report_date": report.get("report_date", "not available"),
            "next_publication_date": report.get("next_publication_date", "not available"),
            "source": report.get("source", "not available"),
            "collected_at": now_iso,
        }
        _upsert_by_date(report_history[report_name], "report_date", candidate)

    history_payload["metadata"]["last_updated"] = now_iso
    return history_payload
