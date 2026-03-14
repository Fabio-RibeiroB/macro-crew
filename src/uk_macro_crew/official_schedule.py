import csv
import io
import re
from datetime import datetime
from typing import Dict
from urllib.request import Request, urlopen


USER_AGENT = "macro-crew/1.0 (+https://github.com/Fabio-RibeiroB/macro-crew)"
BANK_RATE_PAGE_URL = "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate"
ONS_CPIH_MONTHLY_RATE_URL = (
    "https://www.ons.gov.uk/generator?format=csv&uri="
    "%2Feconomy%2Finflationandpriceindices%2Ftimeseries%2Fl59c%2Fmm23"
)
ONS_GDP_RELEASE_URL = (
    "https://www.ons.gov.uk/generator?format=csv&uri="
    "%2Feconomy%2Fgrossdomesticproductgdp%2Ftimeseries%2Fecyx%2Fmgdp"
)
DATE_PATTERNS = ("%d %B %Y", "%d-%m-%Y")
NEXT_DUE_PATTERN = re.compile(r"Next due:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})", re.IGNORECASE)


def _request_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8-sig")


def _parse_human_date(value: str) -> str:
    normalized = value.strip()
    for pattern in DATE_PATTERNS:
        try:
            return datetime.strptime(normalized, pattern).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unsupported date format: {value}")


def _extract_ons_next_release_date(csv_payload: str) -> str:
    reader = csv.reader(io.StringIO(csv_payload))
    for row in reader:
        if len(row) < 2:
            continue
        if row[0].strip().lower() == "next release":
            return _parse_human_date(row[1])
    raise ValueError("Could not find ONS next release date")


def _extract_bank_rate_next_due(html_payload: str) -> str:
    match = NEXT_DUE_PATTERN.search(html_payload)
    if not match:
        raise ValueError("Could not find Bank Rate next due date")
    return _parse_human_date(match.group(1))


def fetch_official_release_schedule() -> Dict[str, Dict[str, str]]:
    return {
        "interest_rate": {
            "next_publication_date": _extract_bank_rate_next_due(_request_text(BANK_RATE_PAGE_URL)),
            "source": BANK_RATE_PAGE_URL,
        },
        "cpih": {
            "next_publication_date": _extract_ons_next_release_date(_request_text(ONS_CPIH_MONTHLY_RATE_URL)),
            "source": ONS_CPIH_MONTHLY_RATE_URL,
        },
        "gdp": {
            "next_publication_date": _extract_ons_next_release_date(_request_text(ONS_GDP_RELEASE_URL)),
            "source": ONS_GDP_RELEASE_URL,
        },
    }
