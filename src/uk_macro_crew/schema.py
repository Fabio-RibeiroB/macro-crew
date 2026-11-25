import re
from collections.abc import Callable
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PERCENT_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?%$")

ALLOWED_PLACEHOLDER = "not available"

# Optional one-sentence AI headline on a report summary (shown on the overview).
MAX_HEADLINE_CHARS = 160

DEFAULT_URL_VERIFY_TIMEOUT = 10.0
DEFAULT_MAX_REDIRECTS = 5
URL_VERIFY_USER_AGENT = "FinStats source verifier/1.0"

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


def validate_latest_snapshot(payload: dict, today: date | None = None) -> None:
    """Validate an AI report snapshot. ``today`` (default: current date) bounds report dates."""
    today = today or date.today()
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

        # headline is optional; when present it must be a short string.
        if "headline" in obj:
            headline = obj["headline"]
            if not isinstance(headline, str):
                raise SchemaValidationError(f"{report_name}.headline must be a string")
            if len(headline) > MAX_HEADLINE_CHARS:
                raise SchemaValidationError(
                    f"{report_name}.headline must be at most {MAX_HEADLINE_CHARS} characters"
                )

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

        # A report cannot be dated after the run; the model sometimes copies the
        # next scheduled publication date into report_date.
        if obj[date_field] != ALLOWED_PLACEHOLDER and date.fromisoformat(obj[date_field]) > today:
            raise SchemaValidationError(f"{report_name}.{date_field} cannot be in the future")

        _assert_temporal_order(
            obj[date_field],
            obj["next_publication_date"],
            f"{report_name}.{date_field}",
        )

    # plain_english_context is optional — validate only if present
    context = payload.get("plain_english_context")
    if context is not None:
        if not isinstance(context, dict):
            raise SchemaValidationError("plain_english_context must be an object")
        for field in ("overall_summary", "interest_rate", "cpih", "gdp"):
            if field in context and not isinstance(context[field], str):
                raise SchemaValidationError(f"plain_english_context.{field} must be a string")


def _validate_verifiable_url(url: str, allowed_domains: tuple[str, ...]) -> None:
    if not isinstance(url, str) or not url or any(ord(c) < 32 for c in url):
        raise SchemaValidationError(f"Invalid source URL: {url!r}")
    parsed = urlsplit(url)
    try:
        port = parsed.port
    except ValueError as exc:
        raise SchemaValidationError(f"Invalid port in source URL: {url}") from exc
    host = (parsed.hostname or "").lower()
    if (
        parsed.scheme != "https"
        or not host
        or parsed.username
        or parsed.password
        or port not in (None, 443)
    ):
        raise SchemaValidationError(
            f"Source URL must be a direct HTTPS URL on an approved host: {url}"
        )
    if not _host_matches_allowed(host, allowed_domains):
        raise SchemaValidationError(
            f"Source URL host '{host}' is not in approved domains: {allowed_domains}"
        )


class _ApprovedDomainRedirectHandler(HTTPRedirectHandler):
    """Follow bounded HTTP redirects only while targets remain HTTPS on approved domains."""

    def __init__(self, allowed_domains: tuple[str, ...], max_redirects: int):
        super().__init__()
        self.allowed_domains = allowed_domains
        self.max_redirects = max_redirects
        self.redirects = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.redirects += 1
        if self.redirects > self.max_redirects:
            raise SchemaValidationError(
                f"Source URL exceeded maximum redirects ({self.max_redirects}): {req.full_url}"
            )
        resolved = urljoin(req.full_url, newurl)
        _validate_verifiable_url(resolved, self.allowed_domains)
        redirected = super().redirect_request(req, fp, code, msg, headers, resolved)
        if redirected is not None and req.get_method() == "HEAD" and code in (301, 302, 307, 308):
            redirected.method = "HEAD"
        return redirected


def _http_probe(
    url: str,
    method: str,
    timeout: float,
    allowed_domains: tuple[str, ...],
    max_redirects: int,
) -> tuple[int, str]:
    opener = build_opener(
        ProxyHandler({}),
        _ApprovedDomainRedirectHandler(allowed_domains, max_redirects),
    )
    request = Request(url, method=method, headers={"User-Agent": URL_VERIFY_USER_AGENT})
    try:
        with opener.open(request, timeout=timeout) as response:
            status = getattr(response, "status", None)
            if status is None:
                status = response.getcode()
            final_url = response.geturl() or url
            return int(status), final_url
    except HTTPError as exc:
        final_url = exc.geturl() or url
        code = int(exc.code)
        exc.close()
        return code, final_url


def verify_source_url(
    url: str,
    allowed_domains: tuple[str, ...],
    *,
    fetcher: Callable[[str, str, float], tuple[int, str]] | None = None,
    timeout: float = DEFAULT_URL_VERIFY_TIMEOUT,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
) -> str:
    """Verify ``url`` resolves to HTTP 200 on an approved HTTPS domain.

    Sends HEAD first and falls back to GET on HTTP 405 (Method Not Allowed).
    Rejects non-200 responses, network/timeout errors, excessive redirects, and
    any redirect whose target leaves ``allowed_domains`` or HTTPS.
    """
    _validate_verifiable_url(url, allowed_domains)

    def _probe(target: str, method: str) -> tuple[int, str]:
        try:
            if fetcher is not None:
                return fetcher(target, method, timeout)
            return _http_probe(target, method, timeout, allowed_domains, max_redirects)
        except SchemaValidationError:
            raise
        except (URLError, TimeoutError, OSError) as exc:
            raise SchemaValidationError(f"Could not verify source URL {target}: {exc}") from exc

    status, final_url = _probe(url, "HEAD")
    _validate_verifiable_url(final_url, allowed_domains)

    if status == 405:
        status, final_url = _probe(url, "GET")
        _validate_verifiable_url(final_url, allowed_domains)

    if status != 200:
        raise SchemaValidationError(f"Source URL returned HTTP {status} (expected 200): {url}")

    return final_url


def verify_report_source_urls(
    payload: dict,
    *,
    url_verifier: Callable[[str, tuple[str, ...]], str] = verify_source_url,
) -> None:
    """Verify every non-placeholder report source URL resolves to HTTP 200 on an approved domain."""
    reports = payload.get("current_report_summaries")
    if not isinstance(reports, dict):
        raise SchemaValidationError("current_report_summaries must be an object")

    for report_name, allowed_domains in REPORT_SOURCE_DOMAINS.items():
        obj = reports.get(report_name)
        if not isinstance(obj, dict):
            raise SchemaValidationError(f"Missing report object: {report_name}")
        source = obj.get("source")
        if not isinstance(source, str):
            raise SchemaValidationError(f"{report_name}.source must be a string")
        if source == ALLOWED_PLACEHOLDER:
            continue
        try:
            url_verifier(source, allowed_domains)
        except SchemaValidationError as exc:
            raise SchemaValidationError(
                f"{report_name}.source verification failed: {exc}"
            ) from exc
