import pytest

from uk_macro_crew.schema import SchemaValidationError, validate_latest_snapshot


def build_valid_payload():
    return {
        "current_economic_indicators": {
            "interest_rate": {
                "value": "3.75%",
                "publication_date": "2026-02-05",
                "next_publication_date": "2026-03-19",
                "source": "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
            },
            "cpih": {
                "value": "-0.3%",
                "publication_date": "2026-02-18",
                "next_publication_date": "2026-03-25",
                "source": "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/january2026",
            },
            "gdp": {
                "value": "+0.1%",
                "publication_date": "2026-02-12",
                "next_publication_date": "2026-03-31",
                "source": "https://www.ons.gov.uk/economy/grossdomesticproductgdp",
            },
        },
        "current_report_summaries": {
            "monetary_policy_report": {
                "summary": "Policy stance remains restrictive while inflation moderates.",
                "report_date": "2026-02-05",
                "next_publication_date": "2026-03-19",
                "source": "https://www.bankofengland.co.uk/monetary-policy-report/2026/february-2026",
            },
            "financial_stability_report": {
                "summary": "Banking system remains resilient with pockets of stress risk.",
                "report_date": "2025-12-15",
                "next_publication_date": "2026-06-15",
                "source": "https://www.bankofengland.co.uk/financial-stability-report",
            },
        },
    }


def test_validate_latest_snapshot_accepts_valid_payload():
    payload = build_valid_payload()
    validate_latest_snapshot(payload)


def test_validate_latest_snapshot_rejects_bad_percentage_format():
    payload = build_valid_payload()
    payload["current_economic_indicators"]["gdp"]["value"] = "0.1"

    with pytest.raises(SchemaValidationError, match="gdp.value"):
        validate_latest_snapshot(payload)


def test_validate_latest_snapshot_rejects_missing_required_key():
    payload = build_valid_payload()
    del payload["current_report_summaries"]["monetary_policy_report"]["source"]

    with pytest.raises(SchemaValidationError, match="monetary_policy_report.source"):
        validate_latest_snapshot(payload)


def test_validate_latest_snapshot_rejects_unapproved_indicator_source_domain():
    payload = build_valid_payload()
    payload["current_economic_indicators"]["cpih"]["source"] = "https://example.com/cpih"

    with pytest.raises(SchemaValidationError, match="cpih.source must be from approved domains"):
        validate_latest_snapshot(payload)


def test_validate_latest_snapshot_rejects_invalid_iso_date():
    payload = build_valid_payload()
    payload["current_economic_indicators"]["gdp"]["publication_date"] = "2026-13-40"

    with pytest.raises(SchemaValidationError, match="gdp.publication_date"):
        validate_latest_snapshot(payload)


def test_validate_latest_snapshot_rejects_next_date_before_current_date():
    payload = build_valid_payload()
    payload["current_economic_indicators"]["interest_rate"]["publication_date"] = "2026-03-19"
    payload["current_economic_indicators"]["interest_rate"]["next_publication_date"] = "2026-03-01"

    with pytest.raises(SchemaValidationError, match="interest_rate.publication_date.next_publication_date"):
        validate_latest_snapshot(payload)


def test_validate_latest_snapshot_rejects_future_report_date():
    from datetime import date

    payload = build_valid_payload()
    payload["current_report_summaries"]["financial_stability_report"]["report_date"] = "2026-03-01"
    with pytest.raises(SchemaValidationError, match="financial_stability_report.report_date cannot be in the future"):
        validate_latest_snapshot(payload, today=date(2026, 2, 20))
    validate_latest_snapshot(payload, today=date(2026, 3, 1))  # same day is allowed


def test_headline_is_optional_on_the_monetary_policy_report():
    payload = build_valid_payload()
    assert "headline" not in payload["current_report_summaries"]["monetary_policy_report"]
    validate_latest_snapshot(payload)  # absent is valid

    payload["current_report_summaries"]["monetary_policy_report"]["headline"] = (
        "The Bank held Bank Rate and expects inflation to stay above target for now."
    )
    validate_latest_snapshot(payload)

    payload["current_report_summaries"]["monetary_policy_report"]["headline"] = "x" * 160
    validate_latest_snapshot(payload)  # exactly at the limit


def test_headline_must_be_a_short_string_when_present():
    payload = build_valid_payload()
    report = payload["current_report_summaries"]["monetary_policy_report"]

    report["headline"] = "x" * 161
    with pytest.raises(SchemaValidationError, match="monetary_policy_report.headline must be at most 160"):
        validate_latest_snapshot(payload)

    report["headline"] = 3.75
    with pytest.raises(SchemaValidationError, match="monetary_policy_report.headline must be a string"):
        validate_latest_snapshot(payload)


def test_verify_source_url_accepts_http_200_with_head():
    from uk_macro_crew.schema import verify_source_url

    calls = []

    def fake_fetcher(url, method, timeout):
        calls.append((url, method, timeout))
        return 200, url

    target = "https://www.bankofengland.co.uk/monetary-policy-report/2026/november-2026"
    assert verify_source_url(target, ("bankofengland.co.uk",), fetcher=fake_fetcher, timeout=5.0) == target
    assert calls == [(target, "HEAD", 5.0)]


def test_verify_source_url_falls_back_from_head_405_to_get():
    from uk_macro_crew.schema import verify_source_url

    calls = []

    def fake_fetcher(url, method, timeout):
        calls.append((url, method))
        if method == "HEAD":
            return 405, url
        return 200, url

    target = "https://www.bankofengland.co.uk/-/media/boe/files/monetary-policy-report/2026/november/opening-remarks-november-2026.pdf"
    assert verify_source_url(target, ("bankofengland.co.uk",), fetcher=fake_fetcher) == target
    assert calls == [(target, "HEAD"), (target, "GET")]


@pytest.mark.parametrize("status", [404, 403, 410, 500, 503])
def test_verify_source_url_rejects_non_200_without_get_fallback(status):
    from uk_macro_crew.schema import verify_source_url

    calls = []

    def fake_fetcher(url, method, timeout):
        calls.append(method)
        return status, url

    target = "https://www.bankofengland.co.uk/-/media/boe/files/financial-stability-report/2026/november/financial-stability-report-november-2026"
    with pytest.raises(SchemaValidationError, match=f"HTTP {status}"):
        verify_source_url(target, ("bankofengland.co.uk",), fetcher=fake_fetcher)
    assert calls == ["HEAD"]


def test_verify_source_url_rejects_405_then_get_404():
    from uk_macro_crew.schema import verify_source_url

    calls = []

    def fake_fetcher(url, method, timeout):
        calls.append(method)
        return (405, url) if method == "HEAD" else (404, url)

    target = "https://www.bankofengland.co.uk/financial-stability-report/missing"
    with pytest.raises(SchemaValidationError, match="HTTP 404"):
        verify_source_url(target, ("bankofengland.co.uk",), fetcher=fake_fetcher)
    assert calls == ["HEAD", "GET"]


@pytest.mark.parametrize(
    "redirected_url",
    [
        "https://evil.example/financial-stability-report",
        "https://bankofengland.co.uk.evil.example/report",
        "http://www.bankofengland.co.uk/financial-stability-report",
        "https://127.0.0.1/internal",
    ],
)
def test_verify_source_url_rejects_redirect_to_unapproved_host_or_scheme(redirected_url):
    from uk_macro_crew.schema import verify_source_url

    target = "https://www.bankofengland.co.uk/financial-stability-report"
    with pytest.raises(SchemaValidationError):
        verify_source_url(
            target,
            ("bankofengland.co.uk",),
            fetcher=lambda url, method, timeout: (200, redirected_url),
        )


def test_verify_source_url_accepts_redirect_within_approved_domain():
    from uk_macro_crew.schema import verify_source_url

    target = "https://www.bankofengland.co.uk/financial-stability-report"
    canonical = "https://www.bankofengland.co.uk/financial-stability-report/2026/july-2026"
    assert (
        verify_source_url(
            target,
            ("bankofengland.co.uk",),
            fetcher=lambda url, method, timeout: (200, canonical),
        )
        == canonical
    )


@pytest.mark.parametrize(
    "bad_url",
    [
        "http://www.bankofengland.co.uk/report",
        "https://evil.example/report",
        "https://user:pass@www.bankofengland.co.uk/report",
        "https://www.bankofengland.co.uk:8443/report",
        "file:///etc/passwd",
    ],
)
def test_verify_source_url_rejects_untrusted_url_before_network(bad_url):
    from uk_macro_crew.schema import verify_source_url

    def fail_if_called(url, method, timeout):
        pytest.fail("fetcher must not be called for untrusted initial URL")

    with pytest.raises(SchemaValidationError):
        verify_source_url(bad_url, ("bankofengland.co.uk",), fetcher=fail_if_called)


def test_verify_source_url_rejects_network_errors():
    from urllib.error import URLError
    from uk_macro_crew.schema import verify_source_url

    target = "https://www.bankofengland.co.uk/financial-stability-report"

    def raise_timeout(url, method, timeout):
        raise TimeoutError("timed out")

    def raise_url_error(url, method, timeout):
        raise URLError("DNS failure")

    with pytest.raises(SchemaValidationError, match="Could not verify source URL"):
        verify_source_url(target, ("bankofengland.co.uk",), fetcher=raise_timeout)
    with pytest.raises(SchemaValidationError, match="Could not verify source URL"):
        verify_source_url(target, ("bankofengland.co.uk",), fetcher=raise_url_error)


def test_redirect_handler_blocks_unapproved_host_downgrade_and_excessive_hops():
    from urllib.request import Request
    from uk_macro_crew.schema import _ApprovedDomainRedirectHandler

    req = Request("https://www.bankofengland.co.uk/start", method="HEAD")

    handler = _ApprovedDomainRedirectHandler(("bankofengland.co.uk",), max_redirects=2)
    with pytest.raises(SchemaValidationError, match="not in approved domains"):
        handler.redirect_request(req, None, 302, "Found", {}, "https://attacker.example/phish")

    handler = _ApprovedDomainRedirectHandler(("bankofengland.co.uk",), max_redirects=2)
    with pytest.raises(SchemaValidationError, match="direct HTTPS URL"):
        handler.redirect_request(req, None, 301, "Moved", {}, "http://www.bankofengland.co.uk/plain")

    handler = _ApprovedDomainRedirectHandler(("bankofengland.co.uk",), max_redirects=2)
    hop1 = handler.redirect_request(req, None, 302, "Found", {}, "/step-1")
    assert hop1.full_url == "https://www.bankofengland.co.uk/step-1"
    assert hop1.get_method() == "HEAD"
    hop2 = handler.redirect_request(hop1, None, 302, "Found", {}, "https://www.bankofengland.co.uk/step-2")
    assert hop2.get_method() == "HEAD"
    with pytest.raises(SchemaValidationError, match="maximum redirects"):
        handler.redirect_request(hop2, None, 302, "Found", {}, "https://www.bankofengland.co.uk/step-3")


def test_http_probe_405_fallback_and_404_rejection_via_opener(monkeypatch):
    from email.message import Message
    from types import SimpleNamespace
    from urllib.error import HTTPError
    from uk_macro_crew import schema as mod

    seen_methods = []

    class _OkResponse:
        status = 200

        def __init__(self, url):
            self._url = url

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def geturl(self):
            return self._url

    def fake_open_405_then_200(request, timeout):
        seen_methods.append((request.get_method(), timeout))
        if request.get_method() == "HEAD":
            raise HTTPError(request.full_url, 405, "Method Not Allowed", Message(), None)
        return _OkResponse(request.full_url)

    monkeypatch.setattr(mod, "build_opener", lambda *args: SimpleNamespace(open=fake_open_405_then_200))
    target = "https://www.bankofengland.co.uk/monetary-policy-report/2026/november-2026"
    assert mod.verify_source_url(target, ("bankofengland.co.uk",), timeout=7.5) == target
    assert seen_methods == [("HEAD", 7.5), ("GET", 7.5)]

    def fake_open_404(request, timeout):
        raise HTTPError(request.full_url, 404, "Not Found", Message(), None)

    monkeypatch.setattr(mod, "build_opener", lambda *args: SimpleNamespace(open=fake_open_404))
    with pytest.raises(SchemaValidationError, match="HTTP 404"):
        mod.verify_source_url(target, ("bankofengland.co.uk",))


def test_verify_report_source_urls_skips_placeholder_and_fails_on_404():
    from uk_macro_crew.schema import verify_report_source_urls, verify_source_url

    payload = build_valid_payload()
    payload["current_report_summaries"]["financial_stability_report"]["source"] = "not available"

    checked = []

    def verifier(url, allowed_domains):
        checked.append((url, allowed_domains))
        return url

    verify_report_source_urls(payload, url_verifier=verifier)
    assert checked == [
        (
            "https://www.bankofengland.co.uk/monetary-policy-report/2026/february-2026",
            ("bankofengland.co.uk",),
        )
    ]

    broken = build_valid_payload()
    broken["current_report_summaries"]["financial_stability_report"]["source"] = (
        "https://www.bankofengland.co.uk/-/media/boe/files/financial-stability-report/2026/november/financial-stability-report-november-2026"
    )
    with pytest.raises(SchemaValidationError, match="financial_stability_report.source verification failed.*HTTP 404"):
        verify_report_source_urls(
            broken,
            url_verifier=lambda url, domains: verify_source_url(
                url,
                domains,
                fetcher=lambda u, m, t: (404, u) if "november" in u else (200, u),
            ),
        )
