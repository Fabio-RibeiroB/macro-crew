import re
from datetime import date
from urllib.parse import urlparse


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PERCENT_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?%$")

ALLOWED_PLACEHOLDER = "not available"

INDICATOR_SOURCE_DOMAINS = {
    "interest_rate": ("bankofengland.co.uk",),
    "cpih": ("ons.gov.uk",),
    "gdp": ("ons.gov.uk",),
}

REPORT_SOURCE_DOMAINS = {
    "monetary_policy_report": ("bankofengland.co.uk",),
    "financial_stability_report": ("bankofengland.co.uk",),
}


class SchemaValidationError(ValueError):
    pass


def _is_valid_date(value: str) -> bool:
    if value == ALLOWED_PLACEHOLDER:
        return True
    if not DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _is_valid_percent(value: str) -> bool:
    return value == ALLOWED_PLACEHOLDER or bool(PERCENT_RE.match(value))


def _is_valid_url(value: str) -> bool:
    if value == ALLOWED_PLACEHOLDER:
        return True
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _host_matches_allowed(host: str, allowed_domains: tuple[str, ...]) -> bool:
    return any(host == domain or host.endswith(f".{domain}") for domain in allowed_domains)


def _is_allowed_source_domain(value: str, allowed_domains: tuple[str, ...]) -> bool:
    if value == ALLOWED_PLACEHOLDER:
        return True
    parsed = urlparse(value)
    host = (parsed.netloc or "").lower()
    if not host:
        return False
    return _host_matches_allowed(host, allowed_domains)


def _assert_temporal_order(current_date: str, next_date: str, field_label: str) -> None:
    if current_date == ALLOWED_PLACEHOLDER or next_date == ALLOWED_PLACEHOLDER:
        return
    if date.fromisoformat(next_date) < date.fromisoformat(current_date):
        raise SchemaValidationError(
            f"{field_label}.next_publication_date must be on or after {field_label} date"
        )


def validate_latest_snapshot(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise SchemaValidationError("Top-level payload must be an object")

    required_top_keys = ["current_economic_indicators", "current_report_summaries"]
    for key in required_top_keys:
        if key not in payload:
            raise SchemaValidationError(f"Missing required top-level key: {key}")

    indicators = payload["current_economic_indicators"]
    if not isinstance(indicators, dict):
        raise SchemaValidationError("current_economic_indicators must be an object")

    indicator_spec = {
        "interest_rate": ("publication_date",),
        "cpih": ("publication_date",),
        "gdp": ("publication_date",),
    }

    for indicator, date_keys in indicator_spec.items():
        if indicator not in indicators or not isinstance(indicators[indicator], dict):
            raise SchemaValidationError(f"Missing indicator object: {indicator}")

        obj = indicators[indicator]
        for key in ["value", *date_keys, "next_publication_date", "source"]:
            if key not in obj or not isinstance(obj[key], str):
                raise SchemaValidationError(f"{indicator}.{key} must be a string")

        if not _is_valid_percent(obj["value"]):
            raise SchemaValidationError(f"{indicator}.value must be a percentage string or 'not available'")

        if not _is_valid_date(obj["publication_date"]):
            raise SchemaValidationError(f"{indicator}.publication_date must be YYYY-MM-DD or 'not available'")

        if not _is_valid_date(obj["next_publication_date"]):
            raise SchemaValidationError(f"{indicator}.next_publication_date must be YYYY-MM-DD or 'not available'")

        if not _is_valid_url(obj["source"]):
            raise SchemaValidationError(f"{indicator}.source must be a valid URL or 'not available'")

        if not _is_allowed_source_domain(obj["source"], INDICATOR_SOURCE_DOMAINS[indicator]):
            raise SchemaValidationError(
                f"{indicator}.source must be from approved domains: {INDICATOR_SOURCE_DOMAINS[indicator]}"
            )

        _assert_temporal_order(
            obj["publication_date"],
            obj["next_publication_date"],
            f"{indicator}.publication_date",
        )

    reports = payload["current_report_summaries"]
    if not isinstance(reports, dict):
        raise SchemaValidationError("current_report_summaries must be an object")

    report_spec = {
        "monetary_policy_report": "report_date",
        "financial_stability_report": "report_date",
    }

    for report_name, date_field in report_spec.items():
        if report_name not in reports or not isinstance(reports[report_name], dict):
            raise SchemaValidationError(f"Missing report object: {report_name}")

        obj = reports[report_name]
        for key in ["summary", date_field, "next_publication_date", "source"]:
            if key not in obj or not isinstance(obj[key], str):
                raise SchemaValidationError(f"{report_name}.{key} must be a string")

        if not obj["summary"].strip() and obj["summary"] != ALLOWED_PLACEHOLDER:
            raise SchemaValidationError(f"{report_name}.summary cannot be empty")

        if not _is_valid_date(obj[date_field]):
            raise SchemaValidationError(f"{report_name}.{date_field} must be YYYY-MM-DD or 'not available'")

        if not _is_valid_date(obj["next_publication_date"]):
            raise SchemaValidationError(
                f"{report_name}.next_publication_date must be YYYY-MM-DD or 'not available'"
            )

        if not _is_valid_url(obj["source"]):
            raise SchemaValidationError(f"{report_name}.source must be a valid URL or 'not available'")

        if not _is_allowed_source_domain(obj["source"], REPORT_SOURCE_DOMAINS[report_name]):
            raise SchemaValidationError(
                f"{report_name}.source must be from approved domains: {REPORT_SOURCE_DOMAINS[report_name]}"
            )

        _assert_temporal_order(
            obj[date_field],
            obj["next_publication_date"],
            f"{report_name}.{date_field}",
        )
