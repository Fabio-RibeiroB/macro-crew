import csv
import io
import re
from collections import OrderedDict
from datetime import date, datetime
from typing import Any, Dict, List
from urllib.request import Request, urlopen


USER_AGENT = "macro-crew/1.0 (+https://github.com/Fabio-RibeiroB/macro-crew)"
LOOKBACK_YEARS = 5
BOE_BANK_RATE_URL = (
    "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp"
    "?csv.x=yes&Datefrom={date_from}&Dateto=now&SeriesCodes=IUDBEDR&CSVF=CN&UsingCodes=Y"
)
ONS_CPIH_ANNUAL_RATE_URL = (
    "https://www.ons.gov.uk/generator?format=csv&uri="
    "%2Feconomy%2Finflationandpriceindices%2Ftimeseries%2Fl55o%2Fmm23"
)
ONS_GDP_DATASET_PAGE_URL = "https://www.ons.gov.uk/datasets/gdp-to-four-decimal-places"
ONS_GDP_DATASET_URL_PATTERN = re.compile(
    r"https://download\.ons\.gov\.uk/downloads/datasets/gdp-to-four-decimal-places/"
    r"editions/time-series/versions/\d+\.csv"
)


def _request_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8-sig")


def _discover_ons_gdp_dataset_url() -> str:
    page_html = _request_text(ONS_GDP_DATASET_PAGE_URL)
    matches = ONS_GDP_DATASET_URL_PATTERN.findall(page_html)
    if not matches:
        raise ValueError("Could not find current ONS GDP dataset CSV URL")
    return matches[0]


def _format_percent(value: str, include_plus: bool) -> str:
    normalized = value.strip()
    if not normalized:
        return "not available"
    if normalized.endswith("%"):
        return normalized
    if include_plus and not normalized.startswith(("+", "-")):
        normalized = f"+{normalized}"
    return f"{normalized}%"


def _month_period_to_iso(period: str) -> str | None:
    try:
        parsed = datetime.strptime(period.strip(), "%Y %b").date()
    except ValueError:
        return None
    return parsed.replace(day=1).isoformat()


def _parse_ons_timeseries_csv(payload: str, include_plus: bool) -> List[Dict[str, str]]:
    entries: List[Dict[str, str]] = []
    reader = csv.reader(io.StringIO(payload))
    for row in reader:
        if len(row) < 2:
            continue
        publication_date = _month_period_to_iso(row[0])
        if not publication_date:
            continue
        value = row[1].strip()
        if not value:
            continue
        entries.append(
            {
                "value": _format_percent(value, include_plus=include_plus),
                "publication_date": publication_date,
                "next_publication_date": "not available",
                "source": "https://www.ons.gov.uk",
                "collected_at": datetime.now().isoformat() + "Z",
            }
        )
    return entries


def _parse_boe_bank_rate_csv(payload: str) -> List[Dict[str, str]]:
    monthly_entries: "OrderedDict[str, Dict[str, str]]" = OrderedDict()
    reader = csv.DictReader(io.StringIO(payload))
    for row in reader:
        date_value = row.get("DATE", "").strip()
        rate_value = row.get("VALUE", "").strip()
        if not date_value or not rate_value:
            continue

        parsed_date = datetime.strptime(date_value, "%d %b %Y").date()
        month_key = parsed_date.strftime("%Y-%m")
        monthly_entries[month_key] = {
            "value": _format_percent(rate_value, include_plus=False),
            "publication_date": parsed_date.isoformat(),
            "next_publication_date": "not available",
            "source": "https://www.bankofengland.co.uk",
            "collected_at": datetime.now().isoformat() + "Z",
        }

    return list(monthly_entries.values())


def _parse_ons_gdp_dataset_csv(payload: str) -> List[Dict[str, str]]:
    monthly_index: Dict[date, float] = {}
    reader = csv.DictReader(io.StringIO(payload))
    for row in reader:
        if row.get("Geography") != "United Kingdom":
            continue
        if row.get("UnofficialStandardIndustrialClassification") != "A-T : Monthly GDP":
            continue

        raw_value = (row.get("v4_0") or "").strip()
        raw_period = (row.get("Time") or "").strip()
        if not raw_value or not raw_period:
            continue

        period_date = datetime.strptime(raw_period, "%b-%y").date().replace(day=1)
        monthly_index[period_date] = float(raw_value)

    ordered_dates = sorted(monthly_index)
    entries: List[Dict[str, str]] = []
    for previous_date, current_date in zip(ordered_dates, ordered_dates[1:]):
        previous_value = monthly_index[previous_date]
        current_value = monthly_index[current_date]
        growth = ((current_value / previous_value) - 1) * 100
        entries.append(
            {
                "value": _format_percent(f"{growth:.1f}", include_plus=True),
                "publication_date": current_date.isoformat(),
                "next_publication_date": "not available",
                "source": ONS_GDP_DATASET_PAGE_URL,
                "collected_at": datetime.now().isoformat() + "Z",
            }
        )

    return entries


def _filter_last_n_years(entries: List[Dict[str, str]], years: int, today: date | None) -> List[Dict[str, str]]:
    reference_date = today or date.today()
    cutoff_year = reference_date.year - years
    cutoff = reference_date.replace(year=cutoff_year)
    filtered: List[Dict[str, str]] = []
    for entry in entries:
        publication_date = entry.get("publication_date")
        if not publication_date or publication_date == "not available":
            continue
        parsed_date = datetime.strptime(publication_date, "%Y-%m-%d").date()
        if parsed_date >= cutoff:
            filtered.append(entry)
    return filtered


def fetch_economic_indicator_history(
    years: int = LOOKBACK_YEARS,
    today: date | None = None,
) -> Dict[str, List[Dict[str, Any]]]:
    reference_date = today or date.today()
    date_from = reference_date.replace(year=reference_date.year - years).strftime("%d/%b/%Y")

    interest_rate_payload = _request_text(BOE_BANK_RATE_URL.format(date_from=date_from))
    cpih_payload = _request_text(ONS_CPIH_ANNUAL_RATE_URL)
    gdp_payload = _request_text(_discover_ons_gdp_dataset_url())

    interest_rate_entries = _filter_last_n_years(
        _parse_boe_bank_rate_csv(interest_rate_payload), years=years, today=reference_date
    )
    cpih_entries = _filter_last_n_years(
        _parse_ons_timeseries_csv(cpih_payload, include_plus=True), years=years, today=reference_date
    )
    gdp_entries = _filter_last_n_years(
        _parse_ons_gdp_dataset_csv(gdp_payload), years=years, today=reference_date
    )

    return {
        "interest_rate": interest_rate_entries,
        "cpih": cpih_entries,
        "gdp": gdp_entries,
    }
