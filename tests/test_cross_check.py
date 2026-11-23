"""Offline tests for the daily cross-check (scripts/cross_check.py, M14 slice 4).

Nothing here touches the network: sockets and urlopen are blocked for every test, the
HTTP layer is a dict of recorded responses, and GitHub is a recording fake. The live
generation is produced by the real collect -> deliver pipeline over the recorded
official fixtures, then read by the real ``src/app/data/verified.mjs`` on Node. The
"official" responses are derived from the same recorded fixtures, reshaped into the
*other* route each publisher offers (ONS JSON <-> CSV, Bank of England tabular table).
"""
import copy
import csv
import gzip
import hashlib
import importlib.util
import io
import json
import re
import shutil
import socket
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError

import pytest

from finstats.__main__ import collect
from finstats.delivery import deliver
from finstats.sources import DEFINITIONS, parse_fuel_release_page
from tests.test_finstats_sources import FIXTURES, fixture_transport
from tests.test_finstats_storage import CPI_WHEN

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('cross_check', ROOT / 'scripts' / 'cross_check.py')
cc = importlib.util.module_from_spec(_spec)
sys.modules['cross_check'] = cc  # dataclasses resolve their module by name
_spec.loader.exec_module(cc)

SITE = 'https://finstats.fabio.org.uk/'
TODAY = date(2026, 10, 22)  # the day CPI_WHEN collected the recorded generation
NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)
needs_node = pytest.mark.skipif(shutil.which('node') is None, reason='Node is needed to run verified.mjs')


class NetworkTouched(BaseException):
    """Not an Exception, so no `except Exception` in the code under test can hide it."""


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise NetworkTouched('tests must never touch the network')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(socket, 'getaddrinfo', blocked)
    monkeypatch.setattr(urllib.request, 'urlopen', blocked)
    monkeypatch.setattr(cc, 'urlopen', blocked)


# ------------------------------------------------------------------ the recorded live site

@pytest.fixture(scope='module')
def recorded_generation(tmp_path_factory):
    folder = tmp_path_factory.mktemp('live')
    collect(folder / 'private', transport=fixture_transport, clock=lambda: CPI_WHEN)
    deliver(folder / 'private', folder / 'public')
    manifest = json.loads((folder / 'public' / 'current.json').read_text())
    return json.loads((folder / 'public' / manifest['data_url']).read_text())


@pytest.fixture
def generation(recorded_generation):
    """A mutable copy with nothing overdue (the recording is a day after CPIH's release)."""
    data = copy.deepcopy(recorded_generation)
    for metric in data['metrics'].values():
        if metric.get('release_status') == 'delayed':
            metric['release_status'] = 'awaiting_next_release'
    return data


def publish(data, base=SITE):
    """Manifest + generation bytes exactly as the site serves them."""
    body = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
    manifest = {'schema_version': 1, 'generation_id': data['generation_id'],
                'published_at': data['published_at'], 'data_url': f"generations/{data['generation_id']}/data.json",
                'sha256': hashlib.sha256(body).hexdigest()}
    return {base + 'data/current.json': json.dumps(manifest).encode(),
            base + 'data/' + manifest['data_url']: body}


# ------------------------------------------------------------------ recorded official responses

def fixture_bytes(name):
    return (FIXTURES / name).read_bytes()


def ons_json_from_csv(key):
    """ONS JSON /data body for a series the site collects as CSV, from the recorded CSV."""
    rows = csv.reader(io.StringIO(fixture_bytes(f'{key}.csv' if key != 'public_debt' else 'public_debt_hf6x_pusf.csv').decode('utf-8-sig')))
    months = [{'date': row[0], 'value': row[1]} for row in rows if len(row) == 2 and re.fullmatch(r'\d{4} [A-Z]{3}', row[0])]
    return json.dumps({'description': {'cdid': DEFINITIONS[key].series}, 'months': months}).encode()


def ons_csv_from_json(name, series):
    """ONS CSV generator body for a series the site collects as JSON, from the recorded JSON."""
    payload = json.loads(fixture_bytes(name))
    lines = ['"Title","recorded"', f'"CDID","{series}"', '"Source dataset ID","recorded"']
    lines += [f'"{m["date"]}","{m["value"]}"' for m in payload['months']]
    return '\n'.join(lines).encode()


def boe_table(name, codes):
    """Tabular (CSVF=TN) body from the recorded combined CSVF=CN download."""
    table = {}
    for row in list(csv.reader(io.StringIO(fixture_bytes(name).decode())))[1:]:
        if row and row[1] in codes:
            table.setdefault(row[0], {})[row[1]] = row[2]
    lines = ['DATE,' + ','.join(codes)]
    lines += [f'{day},' + ','.join(values.get(code, '') for code in codes) for day, values in table.items()]
    return '\n'.join(lines).encode()


RENTS_PAGE = 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics'
RENTS_BASE = '/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/'


def rents_routes(newest='21october2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx'):
    """A dataset page listing several editions, out of order; only the newest has a workbook."""
    editions = ['16september2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx', newest,
                '19august2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx',
                '17december2025/priceindexofprivaterentsukmonthlypricestatistics3.xlsx']
    page = '\n'.join(f'<a href="{RENTS_BASE}{edition}">workbook</a>' for edition in editions)
    return {RENTS_PAGE: page.encode(), 'https://www.ons.gov.uk' + RENTS_BASE + newest: fixture_bytes('pipr_uk_monthly_price_statistics.xlsx')}


def official_responses():
    fuel_page = fixture_bytes('desnz_weekly_road_fuel_prices_release_2026-10-20.html')
    fuel_csv_url = parse_fuel_release_page(fuel_page)[1]
    hpi_collection = ('<a href="/government/statistical-data-sets/uk-house-price-index-data-downloads-december-2025">old</a>'
                      '<a href="/government/statistical-data-sets/uk-house-price-index-data-downloads-august-2026">new</a>'
                      '<a href="/government/statistical-data-sets/uk-house-price-index-data-downloads-july-2026">older</a>')
    responses = {
        # ONS JSON for the CSV-collected series
        'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23/data': ons_json_from_csv('cpih'),
        'https://www.ons.gov.uk/economy/grossdomesticproductgdp/timeseries/ecyx/mgdp/data': ons_json_from_csv('gdp'),
        'https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf/data': ons_json_from_csv('public_debt'),
        # ONS CSV for the JSON-collected series
        'https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7g7/mm23': ons_csv_from_json('cpi_d7g7_mm23.json', 'D7G7'),
        'https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7bt/mm23': ons_csv_from_json('cpi_index_d7bt_mm23.json', 'D7BT'),
        'https://www.ons.gov.uk/generator?format=csv&uri=/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms': ons_csv_from_json('regular_pay_nominal_kai9_lms.json', 'KAI9'),
        'https://www.ons.gov.uk/generator?format=csv&uri=/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms': ons_csv_from_json('regular_pay_real_a2fa_lms.json', 'A2FA'),
        'https://www.ons.gov.uk/generator?format=csv&uri=/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms': ons_csv_from_json('unemployment_mgsx_lms.json', 'MGSX'),
        # Land Registry via gov.uk
        'https://www.gov.uk/government/collections/uk-house-price-index-reports': hpi_collection.encode(),
        'https://www.gov.uk/government/statistical-data-sets/uk-house-price-index-data-downloads-august-2026': fixture_bytes('uk_hpi_release_page_2026-08.html'),
        'https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-08.csv': fixture_bytes('uk_hpi_average_prices.csv'),
        # DESNZ fuel
        'https://www.gov.uk/government/statistics/weekly-road-fuel-prices': fuel_page,
        fuel_csv_url: fixture_bytes('desnz_weekly_road_fuel_prices_2026-10-20.csv'),
        # Ofgem
        DEFINITIONS['household_energy'].source_url: gzip.decompress(fixture_bytes('ofgem_energy_price_cap_2026-10.html.gz')),
        # ONS affordability
        DEFINITIONS['price_to_earnings'].source_url: fixture_bytes('ons_house_price_earnings_dataset_page_2026-03-26.html'),
        'https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian/current/aff1ratioofhousepricetoworkplacebasedearnings.xlsx': fixture_bytes('ons_house_price_earnings_ratio_table_1c.xlsx'),
    }
    responses.update(rents_routes())
    return responses


BOE_ROUTES = {
    'SeriesCodes=IUDBEDR&CSVF=TN': boe_table('bank_rate.csv', ('IUDBEDR',)),
    'SeriesCodes=IUDSNPY,IUDMNPY,IUDLNPY&CSVF=TN': boe_table('boe_nominal_par_yields_5_10_20_daily.csv', ('IUDSNPY', 'IUDMNPY', 'IUDLNPY')),
    'SeriesCodes=IUMBV34,IUMBV42&CSVF=TN': boe_table('boe_quoted_mortgage_rates_2y_5y_75ltv_monthly.csv', ('IUMBV34', 'IUMBV42')),
}


class FakeWeb:
    """Recorded responses by exact URL, then by substring. Unknown URLs are 'unreachable'."""
    def __init__(self, responses=(), site=None):
        self.exact = dict(responses)
        self.contains = dict(BOE_ROUTES)
        self.exact.update(site or {})
        self.requested = []

    def __call__(self, url, limit=0):
        self.requested.append(url)
        found = self.exact.get(url)
        if found is None:
            found = next((value for part, value in self.contains.items() if part in url), None)
        if isinstance(found, Exception):
            raise found
        if found is None:
            raise cc.FetchError(f'no recorded response for {url}')
        return found

    def replace(self, key, value):
        if key in self.exact:
            self.exact[key] = value
        else:
            self.contains[key] = value


def web(generation=None):
    site = publish(generation) if generation is not None else {}
    fake = FakeWeb(official_responses(), site)
    return fake


def check(fake, **kwargs):
    return cc.run_check(SITE, cc.CachedFetcher(fake), today=TODAY, now=NOW, **kwargs)


def kinds(report):
    return {result.key: result.kinds for result in report.results}


class FakeGitHub:
    def __init__(self, open_issues=()):
        self.issues, self.writes = list(open_issues), []

    def open_issues(self):
        return list(self.issues)

    def create_issue(self, title, body):
        self.writes.append(('create', title, body))
        return {'number': 7}

    def comment(self, number, body):
        self.writes.append(('comment', number, body))

    def close(self, number):
        self.writes.append(('close', number))


EXISTING = {'number': 3, 'title': cc.ISSUE_TITLE, 'body': cc.ISSUE_MARKER + '\nold report'}


# ------------------------------------------------------------------ the guard itself

def test_the_network_guard_blocks_real_requests():
    with pytest.raises(NetworkTouched):
        urllib.request.urlopen('https://www.ons.gov.uk/')
    with pytest.raises(NetworkTouched):
        cc.make_fetcher({'www.ons.gov.uk'})('https://www.ons.gov.uk/')


def test_default_fetcher_refuses_plain_http_and_foreign_hosts_before_any_request():
    fetch = cc.make_fetcher({'www.ons.gov.uk'})
    for url in ('http://www.ons.gov.uk/x', 'https://example.com/x', 'file:///etc/passwd'):
        with pytest.raises(cc.FetchError):
            fetch(url)


def test_default_fetcher_retries_429_then_succeeds_and_bounds_the_wait(monkeypatch):
    answers = [HTTPError('https://www.ons.gov.uk/x', 429, 'Too Many Requests', {'Retry-After': '90'}, None), 'ok']
    waits = []

    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def geturl(self): return 'https://www.ons.gov.uk/x'
        def read(self, n): return b'data'

    def fake_urlopen(request, timeout):
        assert request.get_header('User-agent').startswith('FinStats-cross-check/')
        assert timeout == 30
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return Response()

    monkeypatch.setattr(cc, 'urlopen', fake_urlopen)
    fetch = cc.make_fetcher({'www.ons.gov.uk'}, sleep=waits.append)
    assert fetch('https://www.ons.gov.uk/x') == b'data'
    assert waits == [30]  # Retry-After 90 is capped at 30 seconds


def test_default_fetcher_gives_up_on_persistent_errors_and_oversize_bodies(monkeypatch):
    def always_500(request, timeout):
        raise HTTPError(request.full_url, 503, 'Unavailable', {}, None)
    monkeypatch.setattr(cc, 'urlopen', always_500)
    with pytest.raises(cc.FetchError, match='503'):
        cc.make_fetcher({'www.ons.gov.uk'}, sleep=lambda s: None)('https://www.ons.gov.uk/x')

    class Big:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def geturl(self): return 'https://www.ons.gov.uk/x'
        def read(self, n): return b'x' * n
    monkeypatch.setattr(cc, 'urlopen', lambda request, timeout: Big())
    with pytest.raises(cc.FetchError, match='exceeds'):
        cc.make_fetcher({'www.ons.gov.uk'})('https://www.ons.gov.uk/x', 10)


# ------------------------------------------------------------------ the site's own reader, on real Node

@needs_node
def test_verified_mjs_reads_a_recorded_generation_on_node(generation):
    site = publish(generation)
    result = cc.run_site_reader(site[SITE + 'data/current.json'], site[SITE + f"data/generations/{generation['generation_id']}/data.json"])
    assert result['ok'] is True
    assert set(result['dataset']['metrics']) == set(DEFINITIONS)
    assert result['dataset']['metrics']['cpih']['latest']['value'] == '3.3'


@needs_node
def test_verified_mjs_rejects_a_wrong_checksum_and_a_bad_definition(generation):
    site = publish(generation)
    manifest = json.loads(site[SITE + 'data/current.json'])
    data_key = SITE + 'data/' + manifest['data_url']
    manifest['sha256'] = '0' * 64
    result = cc.run_site_reader(json.dumps(manifest).encode(), site[data_key])
    assert result['ok'] is False and 'integrity' in result['error']

    altered = copy.deepcopy(generation)
    altered['metrics']['cpi']['source_download_url'] = 'https://evil.example/data'
    site = publish(altered)
    result = cc.run_site_reader(site[SITE + 'data/current.json'], site[SITE + f"data/generations/{altered['generation_id']}/data.json"])
    assert result['ok'] is False


# ------------------------------------------------------------------ clean run

@needs_node
def test_matching_recorded_responses_give_a_clean_report_and_no_issue(generation):
    fake = web(generation)
    report = check(fake)
    assert report.clean, report.problems
    assert set(kinds(report)) == set(DEFINITIONS) and len(report.results) == 22
    assert all(k == [cc.OK] for k in kinds(report).values())
    # Different routes: CSV-collected series are read as JSON and vice versa, BoE as tabular.
    requested = ' '.join(fake.requested)
    assert 'timeseries/l55o/mm23/data' in requested and 'generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7g7' in requested
    assert 'CSVF=TN' in requested and 'CSVF=CN' not in requested
    client = FakeGitHub()
    out = []
    assert cc.sync_issue(report, cc.render_report(report), client, out=out.append) == 'nothing'
    assert client.writes == []


@needs_node
def test_rents_edition_with_a_numeric_suffix_is_picked_by_date_not_list_order(generation):
    newest = '18november2026/priceindexofprivaterentsukmonthlypricestatistics10.xlsx'
    fake = web(generation)
    fake.exact.pop('https://www.ons.gov.uk' + RENTS_BASE + '21october2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx')
    fake.exact.update(rents_routes(newest))
    report = check(fake)
    assert kinds(report)['private_rent_growth'] == [cc.OK] and kinds(report)['private_rent_level'] == [cc.OK]
    assert any(url.endswith(newest) for url in fake.requested)


# ------------------------------------------------------------------ mismatches

@needs_node
def test_a_one_month_lag_is_a_mismatch_the_19_november_case(generation):
    for key in ('private_rent_growth', 'private_rent_level'):
        metric = generation['metrics'][key]
        metric['history'] = metric['history'][:-1]
        metric['latest'] = metric['history'][-1]
    report = check(web(generation))
    by_key = {r.key: r for r in report.results}
    assert not report.clean
    for key in ('private_rent_growth', 'private_rent_level'):
        assert by_key[key].kinds == [cc.MISMATCH]
        assert 'latest period: site 2026-08' in by_key[key].details[0] and 'official 2026-09' in by_key[key].details[0]
    assert [r.key for r in report.problems] == ['private_rent_growth', 'private_rent_level']


@needs_node
def test_a_changed_latest_value_is_a_mismatch(generation):
    metric = generation['metrics']['cpi']
    metric['latest']['value'] = metric['history'][-1]['value'] = '3.4'
    report = check(web(generation))
    result = {r.key: r for r in report.results}['cpi']
    assert result.kinds == [cc.MISMATCH]
    assert 'site 3.4, official 3.5' in result.details[0]
    assert [r.key for r in report.problems] == ['cpi']


@needs_node
def test_a_changed_earlier_value_in_recent_history_is_a_mismatch(generation):
    metric = generation['metrics']['gdp']
    metric['history'][-3]['value'] = '9.9'
    report = check(web(generation))
    result = {r.key: r for r in report.results}['gdp']
    assert result.kinds == [cc.MISMATCH]
    assert metric['history'][-3]['period'] in result.details[0] and 'site 9.9' in result.details[0]


@needs_node
def test_a_revised_official_value_is_a_mismatch_even_when_the_site_is_unchanged(generation):
    fake = web(generation)
    url = 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23/data'
    payload = json.loads(fake.exact[url])
    payload['months'][-1]['value'] = '3.4'
    fake.replace(url, json.dumps(payload).encode())
    result = {r.key: r for r in check(fake).results}['cpih']
    assert result.kinds == [cc.MISMATCH] and 'official 3.4' in result.details[0]


@needs_node
def test_values_compare_as_exact_decimals_not_text(generation):
    metric = generation['metrics']['bank_rate']
    metric['latest']['value'] = metric['history'][-1]['value'] = '3.750'  # same number, different text
    assert kinds(check(web(generation)))['bank_rate'] == [cc.OK]


@needs_node
def test_official_data_ahead_of_the_site_is_reported_once_as_a_latest_period_difference(generation):
    metric = generation['metrics']['gdp']
    metric['history'] = metric['history'][:-2]
    metric['latest'] = metric['history'][-1]
    result = {r.key: r for r in check(web(generation)).results}['gdp']
    assert result.kinds == [cc.MISMATCH] and len(result.details) == 1


# ------------------------------------------------------------------ could not check

@needs_node
def test_an_unreachable_source_is_could_not_check_never_a_pass_and_triggers_an_issue(generation):
    fake = web(generation)
    fake.replace('https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l55o/mm23/data',
                 cc.FetchError('URLError: timed out'))
    report = check(fake)
    result = {r.key: r for r in report.results}['cpih']
    assert result.kinds == [cc.COULD_NOT_CHECK] and 'timed out' in result.details[0]
    assert not report.clean
    assert [r.key for r in report.problems] == ['cpih']
    client = FakeGitHub()
    assert cc.sync_issue(report, cc.render_report(report), client, out=lambda s: None) == 'opened'
    assert client.writes[0][0] == 'create' and 'Could not check' in client.writes[0][2]


@needs_node
@pytest.mark.parametrize('key, url', [
    ('bank_rate', 'SeriesCodes=IUDBEDR&CSVF=TN'),
    ('petrol_price', 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'),
    ('household_energy', DEFINITIONS['household_energy'].source_url),
    ('price_to_earnings', DEFINITIONS['price_to_earnings'].source_url),
    ('house_price_level', 'https://www.gov.uk/government/collections/uk-house-price-index-reports'),
    ('private_rent_level', RENTS_PAGE),
])
def test_unparseable_and_http_error_responses_are_could_not_check(generation, key, url):
    for bad in (b'<html>maintenance</html>', cc.FetchError('HTTP 503 from example')):
        fake = web(generation)
        fake.replace(url, bad)
        report = check(fake)
        assert {r.key: r for r in report.results}[key].kinds == [cc.COULD_NOT_CHECK], bad
        assert not report.clean


@needs_node
def test_an_unreachable_live_site_is_reported_not_passed(generation):
    report = check(FakeWeb(official_responses()))
    assert report.site_problem and report.site_problem.startswith('Could not read the live site')
    assert not report.clean and report.results == []


# ------------------------------------------------------------------ rejected, overdue, unavailable

@needs_node
def test_a_figure_that_fails_the_site_reader_rejects_the_whole_generation_today(generation):
    generation['metrics']['cpi']['source_download_url'] = 'https://evil.example/data'
    report = check(web(generation))
    assert report.site_problem.startswith('The live generation was rejected by the site reader')
    assert not report.clean
    client = FakeGitHub()
    assert cc.sync_issue(report, cc.render_report(report), client, out=lambda s: None) == 'opened'


@needs_node
def test_a_bad_checksum_rejects_the_generation(generation):
    fake = web(generation)
    manifest = json.loads(fake.exact[SITE + 'data/current.json'])
    manifest['sha256'] = 'f' * 64
    fake.exact[SITE + 'data/current.json'] = json.dumps(manifest).encode()
    assert 'integrity' in check(fake).site_problem


def per_metric_reader(tmp_path):
    """A stand-in for slice 2's reader: it drops one bad metric instead of throwing."""
    real = (ROOT / 'src' / 'app' / 'data' / 'verified.mjs').read_text()
    wrapper = real.replace('export function parseDataset(', 'function realParseDataset(') + '''
export function parseDataset(value, manifest) {
  const copy = structuredClone(value);
  const bad = copy.metrics.cpi;
  delete copy.metrics.cpi;
  const dataset = realParseDataset(copy, manifest);
  dataset.metrics.cpi = { ...bad, validation_status: "unavailable", verification_rejected: true, latest: null, history: [] };
  return dataset;
}
'''
    path = tmp_path / 'per-metric-reader.mjs'
    path.write_text(wrapper)
    return path


@needs_node
def test_a_metric_the_reader_drops_while_the_generation_loads_is_rejected(generation, tmp_path):
    report = check(web(generation), reader=per_metric_reader(tmp_path))
    by_key = {r.key: r for r in report.results}
    assert report.site_problem is None
    assert by_key['cpi'].kinds == [cc.REJECTED]
    assert [r.key for r in report.problems] == ['cpi']
    assert by_key['cpih'].kinds == [cc.OK]  # every other figure is still checked


@needs_node
def test_a_delayed_release_status_is_overdue_and_still_compared(recorded_generation):
    report = check(web(copy.deepcopy(recorded_generation)))  # CPIH is naturally "delayed" in the recording
    by_key = {r.key: r for r in report.results}
    assert by_key['cpih'].kinds == [cc.OVERDUE] and 'was due 2026-10-21' in by_key['cpih'].details[0]
    assert not report.clean and [r.key for r in report.problems] == ['cpih']


@needs_node
def test_an_overdue_figure_that_also_disagrees_reports_both(generation):
    metric = generation['metrics']['cpih']
    metric['release_status'] = 'delayed'
    metric['history'] = metric['history'][:-1]
    metric['latest'] = metric['history'][-1]
    assert kinds(check(web(generation)))['cpih'] == [cc.OVERDUE, cc.MISMATCH]


@needs_node
def test_a_metric_unavailable_on_the_site_is_unavailable_not_a_pass(generation):
    metric = generation['metrics']['cpih']
    metric.update(validation_status='unavailable', latest=None, history=[])
    report = check(web(generation))
    assert {r.key: r for r in report.results}['cpih'].kinds == [cc.UNAVAILABLE]
    assert not report.clean


def metric_states():
    verified = {'validation_status': 'verified'}
    gone = {'validation_status': 'unavailable', 'latest': None, 'history': []}
    return [
        (verified, gone, cc.REJECTED),
        (verified, None, cc.REJECTED),
        ({'validation_status': 'unavailable'}, {'validation_status': 'unavailable', 'verification_rejected': True}, cc.REJECTED),
        (None, None, cc.UNAVAILABLE),
        ({'validation_status': 'unavailable'}, gone, cc.UNAVAILABLE),
    ]


@pytest.mark.parametrize('raw_metric, parsed_metric, expected', metric_states())
def test_raw_versus_parsed_states_classify_rejected_and_unavailable(raw_metric, parsed_metric, expected):
    raw = {'metrics': {'cpi': raw_metric} if raw_metric is not None else {}}
    parsed = {'metrics': {'cpi': parsed_metric} if parsed_metric is not None else {}}
    result, metric = cc.check_site_metric('cpi', raw, parsed)
    assert result.kinds == [expected] and metric is None


# ------------------------------------------------------------------ comparison rules

def test_compare_flags_missing_extra_and_changed_recent_periods():
    D = cc.Decimal
    truth = {f'2026-0{m}': D(m) for m in range(1, 8)}
    assert cc.compare(dict(truth), truth) == []
    changed = dict(truth, **{'2026-05': D(50)})
    assert cc.compare(changed, truth) == ['2026-05: site 50, official 5']
    gap = {p: v for p, v in truth.items() if p != '2026-05'}
    assert cc.compare(gap, truth) == ['2026-05: missing on the site (official 5)']
    extra = dict(truth, **{'2026-06': D(60)})
    official_gap = {p: v for p, v in truth.items() if p != '2026-06'}
    assert cc.compare(extra, official_gap) == ['2026-06: site 60, not in the official data']
    older = {f'2025-{m:02d}': D(m) for m in range(1, 13)}
    assert cc.compare({**older, **truth}, {**older, **truth, '2025-01': D(99)}) == []  # old history is not compared
    assert cc.compare({}, truth) == ['the site has no observations']


# ------------------------------------------------------------------ issue lifecycle

def problem_report():
    result = cc.MetricResult('cpi', [cc.MISMATCH], '3.4 (2026-09)', '3.5 (2026-09)', 'ONS CSV D7G7/MM23', ['latest value'])
    return cc.Report(SITE, 'a' * 32, '2026-10-22 12:00 UTC', [result, cc.MetricResult('gdp', [cc.OK])])


def clean_report():
    return cc.Report(SITE, 'a' * 32, '2026-10-22 12:00 UTC', [cc.MetricResult('cpi', [cc.OK])])


def test_a_problem_with_no_open_issue_opens_exactly_one():
    client, report = FakeGitHub(), problem_report()
    body = cc.render_report(report)
    assert cc.sync_issue(report, body, client, out=lambda s: None) == 'opened'
    assert client.writes == [('create', cc.ISSUE_TITLE, body)]
    assert cc.ISSUE_MARKER in body and '| `cpi` | Mismatch | 3.4 (2026-09) | 3.5 (2026-09) |' in body


def test_a_repeat_problem_comments_on_the_open_issue_without_a_duplicate():
    other = {'number': 9, 'title': 'Something else', 'body': 'unrelated'}
    client, report = FakeGitHub([other, EXISTING]), problem_report()
    assert cc.sync_issue(report, cc.render_report(report), client, out=lambda s: None) == 'commented'
    assert [w[:2] for w in client.writes] == [('comment', 3)]


def test_the_issue_is_found_by_marker_even_if_the_title_was_edited():
    client = FakeGitHub([{'number': 4, 'title': 'renamed', 'body': 'x ' + cc.ISSUE_MARKER}])
    assert cc.find_open_issue(client)['number'] == 4


def test_clean_run_closes_the_open_issue_with_a_comment():
    client = FakeGitHub([EXISTING])
    assert cc.sync_issue(clean_report(), cc.render_report(clean_report()), client, out=lambda s: None) == 'closed'
    assert [w[:2] for w in client.writes] == [('comment', 3), ('close', 3)]
    assert 'match their official sources again' in client.writes[0][2]


def test_clean_run_with_no_open_issue_sends_nothing():
    client = FakeGitHub([{'number': 9, 'title': 'Something else', 'body': ''}])
    assert cc.sync_issue(clean_report(), '', client, out=lambda s: None) == 'nothing'
    assert client.writes == []


def test_dry_run_never_writes():
    for existing, report in (([], problem_report()), ([EXISTING], problem_report()), ([EXISTING], clean_report())):
        client = FakeGitHub(existing)
        assert cc.sync_issue(report, '', client, dry_run=True, out=lambda s: None).startswith('would_')
        assert client.writes == []


def test_github_client_requests_use_the_default_token_and_skip_pull_requests():
    calls = []

    class Response:
        def __init__(self, payload): self.payload = payload
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def read(self, n): return json.dumps(self.payload).encode()

    def opener(request, timeout):
        calls.append((request.get_method(), request.full_url, request.get_header('Authorization'),
                      json.loads(request.data) if request.data else None))
        if request.get_method() == 'GET':
            return Response([{'number': 1, 'title': 'a PR', 'pull_request': {}}, {'number': 2, 'title': cc.ISSUE_TITLE}])
        return Response({'number': 5})

    client = cc.GitHubClient('tok', 'Fabio-RibeiroB/macro-crew', opener)
    assert [i['number'] for i in client.open_issues()] == [2]
    client.create_issue('t', 'b')
    client.comment(2, 'c')
    client.close(2)
    base = 'https://api.github.com/repos/Fabio-RibeiroB/macro-crew'
    assert calls == [
        ('GET', base + '/issues?state=open&per_page=100&page=1', 'Bearer tok', None),
        ('POST', base + '/issues', 'Bearer tok', {'title': 't', 'body': 'b'}),
        ('POST', base + '/issues/2/comments', 'Bearer tok', {'body': 'c'}),
        ('PATCH', base + '/issues/2', 'Bearer tok', {'state': 'closed', 'state_reason': 'completed'}),
    ]
    with pytest.raises(ValueError):
        cc.GitHubClient('tok', 'not a repo')


# ------------------------------------------------------------------ the command line, end to end

@needs_node
def test_main_end_to_end_clean_then_lag_then_clean_again(generation, capsys):
    client = FakeGitHub()
    env = {'GITHUB_REPOSITORY': 'Fabio-RibeiroB/macro-crew', 'GITHUB_SERVER_URL': 'https://github.com', 'GITHUB_RUN_ID': '42'}
    assert cc.main([], fetch=web(generation), client=client, env=env, out=lambda s: None) == 0
    assert client.writes == []

    lagged = copy.deepcopy(generation)
    for key in ('private_rent_growth', 'private_rent_level'):
        lagged['metrics'][key]['history'].pop()
        lagged['metrics'][key]['latest'] = lagged['metrics'][key]['history'][-1]
    printed = []
    assert cc.main([], fetch=web(lagged), client=client, env=env, out=printed.append) == 0
    assert [w[0] for w in client.writes] == ['create']
    assert 'actions/runs/42' in client.writes[0][2]

    client.issues = [{'number': 11, 'title': cc.ISSUE_TITLE, 'body': client.writes[0][2]}]
    assert cc.main([], fetch=web(lagged), client=client, env=env, out=lambda s: None) == 0
    assert [w[0] for w in client.writes] == ['create', 'comment']

    assert cc.main([], fetch=web(generation), client=client, env=env, out=lambda s: None) == 0
    assert [w[0] for w in client.writes] == ['create', 'comment', 'comment', 'close']


def test_main_without_credentials_cannot_open_an_issue_but_dry_run_works(generation):
    fake = web(copy.deepcopy(generation))
    assert cc.main(['--dry-run'], fetch=fake, env={}, out=lambda s: None) == 0


# ------------------------------------------------------------------ the workflow

WORKFLOW = (ROOT / '.github' / 'workflows' / 'cross-check.yml').read_text()
PYTHON_TESTS = (ROOT / '.github' / 'workflows' / 'python-tests.yml').read_text()


def uses(text):
    return re.findall(r'^\s*-?\s*uses:\s*(\S+)', text, re.M)


def test_workflow_runs_daily_and_on_demand_only():
    assert re.search(r"^\s*schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'", WORKFLOW, re.M)
    assert re.search(r'^\s*workflow_dispatch:', WORKFLOW, re.M)
    assert not re.search(r'^\s*(pull_request|pull_request_target|push|issue_comment):', WORKFLOW, re.M)


def test_workflow_permissions_are_contents_read_and_issues_write_only():
    block = re.search(r'^permissions:\n((?:[ ]+\S.*\n)+)', WORKFLOW, re.M).group(1)
    assert {line.strip() for line in block.strip().splitlines()} == {'contents: read', 'issues: write'}
    assert WORKFLOW.count('permissions:') == 1


def test_workflow_uses_only_the_default_token_no_other_secrets_or_ai():
    assert set(re.findall(r'secrets\.(\w+)', WORKFLOW)) <= {'GITHUB_TOKEN'}
    assert not re.search(r'(?i)openai|anthropic|exa_api|api[_-]?key|VITE_', WORKFLOW)
    assert 'GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}' in WORKFLOW


def test_workflow_actions_are_pinned_to_the_same_shas_as_the_python_tests_workflow():
    pinned = {action.split('@')[0]: action.split('@')[1] for action in uses(PYTHON_TESTS)}
    mine = uses(WORKFLOW)
    assert mine, 'the workflow must use actions'
    for action in mine:
        name, ref = action.split('@')
        assert re.fullmatch(r'[0-9a-f]{40}', ref), f'{action} is not pinned to a commit SHA'
        assert pinned[name] == ref
    assert {a.split('@')[0] for a in mine} == {'actions/checkout', 'actions/setup-node'}
    assert 'persist-credentials: false' in WORKFLOW
    assert re.search(r'^\s*timeout-minutes:\s*\d+', WORKFLOW, re.M)


def test_workflow_runs_the_script_without_changing_site_data():
    assert 'python3 scripts/cross_check.py' in WORKFLOW
    assert not re.search(r'git (push|commit)|npm (ci|install)|ssh|rsync|scp|deploy', WORKFLOW)
