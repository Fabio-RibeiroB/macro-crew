from datetime import date

from uk_macro_crew.official_history import (
    _parse_boe_bank_rate_csv,
    _parse_ons_gdp_dataset_csv,
    _parse_ons_timeseries_csv,
    fetch_economic_indicator_history,
)


def test_parse_ons_timeseries_csv_formats_monthly_percentages():
    payload = "\n".join(
        [
            '"Title","Series"',
            '"1997 FEB","0.4"',
            '"2025 DEC","-0.2"',
            '"2026 JAN","0.0"',
        ]
    )

    entries = _parse_ons_timeseries_csv(payload, include_plus=True)

    assert entries[-3]["publication_date"] == "1997-02-01"
    assert entries[-3]["value"] == "+0.4%"
    assert entries[-2]["value"] == "-0.2%"
    assert entries[-1]["value"] == "+0.0%"


def test_parse_boe_bank_rate_csv_keeps_latest_point_per_month():
    payload = "\n".join(
        [
            "DATE,SERIES,VALUE",
            "01 Mar 2026,IUDBEDR,4.5",
            "14 Mar 2026,IUDBEDR,4.5",
            "01 Apr 2026,IUDBEDR,4.25",
        ]
    )

    entries = _parse_boe_bank_rate_csv(payload)

    assert len(entries) == 2
    assert entries[0]["publication_date"] == "2026-03-14"
    assert entries[0]["value"] == "4.5%"
    assert entries[1]["publication_date"] == "2026-04-01"


def test_parse_ons_gdp_dataset_csv_calculates_monthly_growth():
    payload = "\n".join(
        [
            "v4_0,mmm-yy,Time,uk-only,Geography,sic-unofficial,UnofficialStandardIndustrialClassification",
            "100.0000,Jan-26,Jan-26,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
            "101.0000,Feb-26,Feb-26,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
            "100.4950,Mar-26,Mar-26,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
        ]
    )

    entries = _parse_ons_gdp_dataset_csv(payload)

    assert [entry["publication_date"] for entry in entries] == [
        "2026-02-01",
        "2026-03-01",
    ]
    assert [entry["value"] for entry in entries] == [
        "+1.0%",
        "-0.5%",
    ]


def test_fetch_economic_indicator_history_filters_to_last_five_years(monkeypatch):
    responses = {
        "IUDBEDR": "\n".join(
            [
                "DATE,SERIES,VALUE",
                "01 Jan 2020,IUDBEDR,0.75",
                "31 Mar 2021,IUDBEDR,0.10",
                "31 Mar 2026,IUDBEDR,4.50",
            ]
        ),
        "l55o": "\n".join(
            [
                '"Title","Series"',
                '"2020 FEB","0.2"',
                '"2021 MAR","0.3"',
                '"2026 MAR","0.4"',
            ]
        ),
        "gdp_page": '<a href="https://download.ons.gov.uk/downloads/datasets/gdp-to-four-decimal-places/editions/time-series/versions/66.csv">download</a>',
        "gdp_csv": "\n".join(
            [
                "v4_0,mmm-yy,Time,uk-only,Geography,sic-unofficial,UnofficialStandardIndustrialClassification",
                "99.0000,Feb-20,Feb-20,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
                "100.0000,Mar-21,Mar-21,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
                "101.0000,Apr-21,Apr-21,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
                "102.0000,Feb-26,Feb-26,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
                "103.0000,Mar-26,Mar-26,K02000001,United Kingdom,A--T,A-T : Monthly GDP",
            ]
        ),
    }

    def fake_request(url: str) -> str:
        lowered = url.lower()
        if "iudbedr" in lowered:
            return responses["IUDBEDR"]
        if "l55o" in lowered:
            return responses["l55o"]
        if "download.ons.gov.uk/downloads/datasets/gdp-to-four-decimal-places" in lowered:
            return responses["gdp_csv"]
        if "datasets/gdp-to-four-decimal-places" in lowered:
            return responses["gdp_page"]
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr("uk_macro_crew.official_history._request_text", fake_request)

    history = fetch_economic_indicator_history(years=5, today=date(2026, 3, 14))

    assert [entry["publication_date"] for entry in history["interest_rate"]] == [
        "2021-03-31",
        "2026-03-31",
    ]
    assert [entry["publication_date"] for entry in history["cpih"]] == [
        "2026-03-01",
    ]
    assert [entry["publication_date"] for entry in history["gdp"]] == [
        "2021-04-01",
        "2026-02-01",
        "2026-03-01",
    ]
