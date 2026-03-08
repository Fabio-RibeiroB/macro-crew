import re
from typing import Any, Dict


ALLOWED_PLACEHOLDER = "not available"
RAW_PERCENT_RE = re.compile(r"^\d+(?:\.\d+)?%$")
PARTIAL_DATE_RE = re.compile(r"^\d{4}-\d{2}-X{2}$")


def _normalize_string(value: str) -> str:
    normalized = value.strip()
    if normalized.lower() == ALLOWED_PLACEHOLDER:
        return ALLOWED_PLACEHOLDER
    return normalized


def _normalize_value_sign(value: str, require_signed_percent: bool) -> str:
    if value == ALLOWED_PLACEHOLDER:
        return value
    if require_signed_percent and RAW_PERCENT_RE.match(value):
        return f"+{value}"
    return value


def normalize_latest_snapshot(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return payload

    for top_key in ("current_economic_indicators", "current_report_summaries"):
        section = payload.get(top_key)
        if not isinstance(section, dict):
            continue
        for _, entry in section.items():
            if not isinstance(entry, dict):
                continue
            for key, value in list(entry.items()):
                if isinstance(value, str):
                    entry[key] = _normalize_string(value)
                    if key.endswith("_date") and PARTIAL_DATE_RE.match(entry[key]):
                        entry[key] = ALLOWED_PLACEHOLDER

    indicators = payload.get("current_economic_indicators", {})
    if isinstance(indicators, dict):
        for key in ("cpih", "gdp"):
            indicator = indicators.get(key)
            if not isinstance(indicator, dict):
                continue
            value = indicator.get("value")
            if isinstance(value, str):
                indicator["value"] = _normalize_value_sign(value, require_signed_percent=True)

    return payload
