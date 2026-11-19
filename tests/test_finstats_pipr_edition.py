"""Offline PIPR edition selection: the newest dated ONS workbook wins; no network."""
import pytest

from finstats import sources
from finstats.sources import ValidationError, select_pipr_workbook_href

BASE = ('/file?uri=/economy/inflationandpriceindices/datasets/'
        'priceindexofprivaterentsukmonthlypricestatistics/')
NAME = 'priceindexofprivaterentsukmonthlypricestatistics'
OLD = f'{BASE}21october2026/{NAME}.xlsx'
NEW = f'{BASE}18november2026/{NAME}10.xlsx'
CURRENT = f'{BASE}current/{NAME}10.xlsx'


def page(*hrefs):
    return ('<html><body>' + ''.join(f'<a href="{h}">x</a>' for h in hrefs) +
            '<a href="/other">other</a></body></html>').encode()


@pytest.mark.parametrize('hrefs', [
    [NEW, OLD, CURRENT], [OLD, CURRENT, NEW], [CURRENT, OLD, NEW]])
def test_newest_edition_wins_in_any_order(hrefs):
    assert select_pipr_workbook_href(hrefs) == NEW


def test_encoded_separators_still_match():
    encoded = OLD.replace('/economy/', '%2Feconomy%2F').replace(
        'datasets/', 'datasets%2F').replace('statistics/21', 'statistics%2F21').replace(
        'october2026/', 'october2026%2F')
    assert select_pipr_workbook_href([encoded]) == encoded


@pytest.mark.parametrize('hrefs', [
    [], [CURRENT], ['/other'],
    [f'{BASE}31foo2026/{NAME}.xlsx'],            # month does not parse
    [f'{BASE}31february2026/{NAME}.xlsx'],       # impossible date
    [f'{BASE}18november2026/{NAME}x.xlsx'],      # non-numeric suffix
    [f'https://evil.example{OLD}'],
])
def test_no_valid_link_raises(hrefs):
    with pytest.raises(ValidationError, match='workbook link unavailable'):
        select_pipr_workbook_href(hrefs)


class FakeResponse:
    def __init__(self, url, body):
        self.status, self._url, self._body = 200, url, body

    def geturl(self):
        return self._url

    def read(self, limit):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_urlopen(pages, requested):
    def opener(request, timeout):
        requested.append(request.full_url)
        return FakeResponse(request.full_url, pages[request.full_url])
    return opener


def test_fetch_downloads_newest_edition(monkeypatch):
    page_url = sources.DEFINITIONS['private_rent_growth'].download_url
    pages = {page_url: page(OLD, NEW, CURRENT), sources.ONS + NEW: b'workbook'}
    requested = []
    monkeypatch.setattr(sources, 'urlopen', fake_urlopen(pages, requested))
    payload, url = sources.fetch('private_rent_growth')
    assert (payload, url) == (b'workbook', sources.ONS + NEW)
    assert requested == [page_url, sources.ONS + NEW]


def test_fetch_fails_loudly_without_a_valid_link(monkeypatch):
    page_url = sources.DEFINITIONS['private_rent_growth'].download_url
    requested = []
    monkeypatch.setattr(sources, 'urlopen', fake_urlopen({page_url: page(CURRENT)}, requested))
    with pytest.raises(ValidationError, match='workbook link unavailable'):
        sources.fetch('private_rent_growth')
    assert requested == [page_url]
