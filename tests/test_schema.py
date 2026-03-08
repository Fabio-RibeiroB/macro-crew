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
