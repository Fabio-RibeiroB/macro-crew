import json
import os
import tempfile

from uk_macro_crew.history import build_history_from_snapshot


def _snapshot(publication_date: str, gdp_value: str = "+0.1%"):
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
                "value": gdp_value,
                "publication_date": publication_date,
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


def test_build_history_appends_new_date_entries():
    with tempfile.TemporaryDirectory() as temp_dir:
        history_file = os.path.join(temp_dir, "history_report.json")

        fetcher = lambda: {
            "interest_rate": [],
            "cpih": [],
            "gdp": [{"value": "+0.1%", "publication_date": "2026-02-12"}],
        }

        first = build_history_from_snapshot(
            _snapshot("2026-02-12", "+0.1%"), history_file, economic_history_fetcher=fetcher
        )
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(first, f)

        second_fetcher = lambda: {
            "interest_rate": [],
            "cpih": [],
            "gdp": [
                {"value": "+0.1%", "publication_date": "2026-02-12"},
                {"value": "+0.2%", "publication_date": "2026-03-12"},
            ],
        }
        second = build_history_from_snapshot(
            _snapshot("2026-03-12", "+0.2%"), history_file, economic_history_fetcher=second_fetcher
        )
        gdp_entries = second["history"]["economic_indicators"]["gdp"]

        assert len(gdp_entries) == 2
        assert gdp_entries[0]["publication_date"] == "2026-02-12"
        assert gdp_entries[1]["publication_date"] == "2026-03-12"


def test_build_history_dedupes_same_date_by_upsert():
    with tempfile.TemporaryDirectory() as temp_dir:
        history_file = os.path.join(temp_dir, "history_report.json")

        fetcher = lambda: {
            "interest_rate": [],
            "cpih": [],
            "gdp": [{"value": "+0.1%", "publication_date": "2026-02-12"}],
        }
        first = build_history_from_snapshot(
            _snapshot("2026-02-12", "+0.1%"), history_file, economic_history_fetcher=fetcher
        )
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(first, f)

        second_fetcher = lambda: {
            "interest_rate": [],
            "cpih": [],
            "gdp": [{"value": "+0.4%", "publication_date": "2026-02-12"}],
        }
        second = build_history_from_snapshot(
            _snapshot("2026-02-12", "+0.4%"), history_file, economic_history_fetcher=second_fetcher
        )
        gdp_entries = second["history"]["economic_indicators"]["gdp"]

        assert len(gdp_entries) == 1
        assert gdp_entries[0]["value"] == "+0.4%"


def test_build_history_falls_back_to_snapshot_when_official_fetch_fails():
    with tempfile.TemporaryDirectory() as temp_dir:
        history_file = os.path.join(temp_dir, "history_report.json")

        def failing_fetcher():
            raise RuntimeError("network issue")

        history = build_history_from_snapshot(
            _snapshot("2026-02-12", "+0.1%"),
            history_file,
            economic_history_fetcher=failing_fetcher,
        )
        gdp_entries = history["history"]["economic_indicators"]["gdp"]

        assert len(gdp_entries) == 1
        assert gdp_entries[0]["publication_date"] == "2026-02-12"
        assert gdp_entries[0]["value"] == "+0.1%"
