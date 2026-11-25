import json
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

import pytest

from finstats.events import collect_events, deduplicate_events, event, public_events

FIXTURES='tests/fixtures/official'
NOW=datetime(2026,10,22,12,tzinfo=timezone.utc)

def test_recorded_sources_preserve_precision_dst_dedup_and_changes(tmp_path):
    result=collect_events(tmp_path,clock=lambda:NOW,fixtures=FIXTURES)
    assert result['failed_sources']==[]
    assert result['unqualified_sources']==[]
    p=result['schedule']['providers']
    assert all(item['qualification']=='qualified' for item in p.values())
    ons=p['ons']['events']
    assert len(ons)==3
    assert ons[1]['time']=='2027-07-21T07:00+01:00'  # BST, UTC release instant converted to London
    assert ons[1]['time_precision']=='minute'
    assert ons[2]['status']=='rescheduled'
    assert ons[0]['status']=='cancelled'
    boe=p['boe_mpc']['events']
    assert boe[0]['time'] is None and boe[0]['time_precision']=='date'
    assert len({e['id'] for e in boe})==2
    assert all(p[name]['status']=='ok' for name in ('obr','hm_treasury','ofgem_energy'))
    assert p['obr']['events'][0]['date']=='2026-10-28'
    assert p['hm_treasury']['events'][0]['date']=='2026-10-28'
    assert [e['date'] for e in p['ofgem_energy']['events']]==['2026-11-25','2027-02-23','2027-05-26']
    first_cap=p['ofgem_energy']['events'][0]
    assert first_cap['title']=='Ofgem price cap level announcement due by 25 November 2026; Ofgem may publish earlier (effective period 1 January 2027 to 31 March 2027)'
    assert first_cap['linked_indicators']==['uk.energy_price_cap.typical_dual_fuel_bill']
    assert first_cap['status']=='scheduled' and first_cap['time'] is None and first_cap['time_precision']=='date'
    with pytest.raises(ValueError,match='fixture'):
        public_events(tmp_path)

def test_failure_retains_last_schedule_as_stale(tmp_path):
    collect_events(tmp_path,clock=lambda:NOW,fixtures=FIXTURES)
    before=json.loads((tmp_path/'events.json').read_text())
    for provider in before['providers'].values():
        provider['evidence_kind']='official_download'
        provider['retrieved_at']='2026-10-22T12:00:00.000000Z'
    (tmp_path/'events.json').write_text(json.dumps(before))
    result=collect_events(tmp_path,clock=lambda:NOW,fetch=lambda url: (_ for _ in ()).throw(OSError()))
    assert len(result['failed_sources'])==6
    after=result['schedule']['providers']
    assert after['ons']['status']=='stale'
    assert after['ons']['events']==before['providers']['ons']['events']
    assert after['obr']['status']=='stale' and after['obr']['events']==before['providers']['obr']['events']

def test_failure_after_successful_empty_schedule_is_stale(tmp_path):
    class EmptyOfficial:
        def __call__(self, url):
            if 'ons.gov.uk' in url:
                return b'{"breakdown":{"total":0},"releases": []}'
            if 'bankofengland.co.uk' in url:
                return (Path(FIXTURES)/'events_boe_mpc_capture.html').read_bytes()
            if 'gov.uk/government/statistics/weekly-road-fuel-prices' in url:
                return (Path(FIXTURES)/'desnz_weekly_road_fuel_prices_release_2026-10-20.html').read_bytes()
            if 'obr.uk' in url:
                return (Path(FIXTURES)/'events_obr.html').read_bytes()
            if 'gov.uk/api/search.json' in url:
                return b'{"total":0,"results":[]}'
            return (Path(FIXTURES)/'events_ofgem_energy.html').read_bytes()
    collect_events(tmp_path,clock=lambda:NOW,fetch=EmptyOfficial())
    before=json.loads((tmp_path/'events.json').read_text())
    assert before['providers']['ons']['events']==[]
    result=collect_events(tmp_path,clock=lambda:NOW,
                          fetch=lambda url: (_ for _ in ()).throw(OSError()))
    assert 'ons' in result['failed_sources']
    assert result['schedule']['providers']['ons']['status']=='stale'
    assert result['schedule']['providers']['ons']['unknown_dates'] is True

def test_public_projection_keeps_receipts_and_private_errors_out(tmp_path):
    result=collect_events(tmp_path,clock=lambda:NOW,fixtures=FIXTURES)
    private=result['schedule']
    for p in private['providers'].values():
        p['evidence_kind']='official_download'
        p.pop('last_error',None)
    (tmp_path/'events.json').write_text(json.dumps(private))
    projected=public_events(tmp_path)
    encoded=json.dumps(projected)
    assert 'events-raw' not in encoded and 'attempts' not in projected
    assert 'last_error' not in encoded and 'sha256' in encoded
    assert projected['events']==sorted(projected['events'],key=lambda e:(e['date'],e['id']))

def test_ons_release_families_link_only_relevant_indicators():
    from finstats.events import _parse_ons
    body=json.dumps({'releases':[
        {'uri':'/releases/gdp-release','description':{'title':'GDP monthly estimate, UK','release_date':'2027-01-01T08:30:00Z'}},
        {'uri':'/releases/cpi-release','description':{'title':'Consumer price inflation, UK','release_date':'2027-02-01T08:30:00Z'}},
        {'uri':'/releases/labour-release','description':{'title':'UK Labour Market','release_date':'2027-03-01T08:30:00Z'}},
        {'uri':'/releases/gdp-corrected','date_changes':[{'previous_date':'2027-01-01'}],
         'description':{'title':'GDP monthly estimate, UK corrected','release_date':'2027-04-01T08:30:00Z','published':True,'postponed':True}},
        {'uri':'/releases/producer-price-inflation','description':{'title':'Producer price inflation, UK','release_date':'2027-05-01T08:30:00Z'}},
        {'uri':'/releases/quarterly-gdp','description':{'title':'GDP first quarterly estimate, UK','release_date':'2027-06-01T08:30:00Z'}},
        {'uri':'/releases/unemployment','description':{'title':'Unemployment in the UK','release_date':'2027-07-01T08:30:00Z'}},
        {'uri':'/releases/vacancies','description':{'title':'Vacancies and jobs in the UK','release_date':'2027-08-01T08:30:00Z'}},
        {'uri':'/releases/earnings','description':{'title':'Employee earnings in the UK: 2027','release_date':'2027-09-01T08:30:00Z'}},
        {'uri':'/releases/cpi-weights','description':{'title':'Consumer price inflation, updating weights: 2027','release_date':'2027-03-12T09:30:00Z'}},
        {'uri':'/releases/cpi-basket','description':{'title':'Consumer price inflation basket of goods and services: 2027','release_date':'2027-03-12T09:30:00Z'}},
    ],'breakdown':{'total':11}}).encode()
    parsed=_parse_ons(body,NOW.date())
    by_title={e['title']:e['linked_indicators'] for e in parsed}
    assert by_title['GDP monthly estimate, UK']==['uk.gdp.monthly_growth']
    assert by_title['Consumer price inflation, UK']==['uk.cpi.annual_rate','uk.cpih.annual_rate']
    assert 'uk.cpi.annual_rate' not in by_title['GDP monthly estimate, UK']
    assert 'uk.gdp.monthly_growth' not in by_title['Consumer price inflation, UK']
    assert 'Producer price inflation, UK' not in by_title
    assert 'GDP first quarterly estimate, UK' not in by_title
    assert 'Unemployment in the UK' not in by_title
    assert 'Vacancies and jobs in the UK' not in by_title
    assert 'Consumer price inflation, updating weights: 2027' not in by_title
    assert 'Consumer price inflation basket of goods and services: 2027' not in by_title
    assert by_title['Employee earnings in the UK: 2027']==[
        'uk.regular_pay.nominal_annual_growth','uk.regular_pay.real_annual_growth']
    assert next(e for e in parsed if e['title'].endswith('corrected'))['status']=='published'

def test_desnz_release_day_is_not_upcoming_and_published_notice_is_not_scheduled():
    from finstats.events import parse_source
    body=(b'<h1>Weekly road fuel prices</h1><h2>Updates to this page</h2>'
          b'<p>Road fuel prices for week commencing Monday 26 October 2026 published. 22 October 2026</p>'
          b'<p>Road fuel prices for week commencing Monday 2 November 2026 published. 29 October 2026</p>')
    events=parse_source('desnz_fuel',body,NOW.date())
    assert [item['date'] for item in events]==['2026-10-29']
    assert events[0]['status']=='published'

def test_qualified_sources_have_real_official_capture_receipts():
    receipt=json.loads((Path(FIXTURES)/'events_source_receipts.json').read_text())
    assert receipt['capture_date']=='2026-10-22'
    for provider,item in receipt['receipts'].items():
        body=(Path(FIXTURES)/item['fixture']).read_bytes()
        assert item['evidence_kind']=='official_download'
        assert item['qualification'].startswith('qualified_')
        assert len(body)==item['bytes']
        assert sha256(body).hexdigest()==item['sha256']
        if provider=='ons':
            payload=json.loads(body)
            assert len(payload['releases'])==item['results_returned']==item['results_total']==9
            assert item['page_limit']==1000

def test_qualified_adapters_extract_official_dates_and_fail_closed_on_markup_change():
    from finstats.events import parse_source
    official={
        name:(Path(FIXTURES)/filename).read_bytes()
        for name,filename in (('obr','events_obr.html'),('hm_treasury','events_hm_treasury.html'),
                              ('ofgem_energy','events_ofgem_energy.html'))
    }
    parsed={name:parse_source(name,body,NOW.date()) for name,body in official.items()}
    assert [e['date'] for e in parsed['obr']]==['2026-10-28']
    assert [e['date'] for e in parsed['hm_treasury']]==['2026-10-28']
    assert [e['date'] for e in parsed['ofgem_energy']]==['2026-11-25','2027-02-23','2027-05-26']
    assert parsed['obr'][0]['linked_indicators']==['uk.public_debt.net_debt_gdp']
    assert parsed['hm_treasury'][0]['linked_indicators']==['uk.public_debt.net_debt_gdp']
    no_date={
        'obr':b'<div class="block-pubs-footer"><h4><a>Economic and fiscal outlook</a></h4>Next release: TBC</div>',
        'hm_treasury':b'<main><h1>Chancellor letter - Budget 2026 date</h1><div class="govspeak">The Budget date has not been announced.</div></main>',
        'ofgem_energy':b'<main><h1>Changes to energy price cap</h1><h2>Energy price cap level dates</h2><p>Levels for the next periods will be announced by: We may publish before these dates.</p></main>',
    }
    assert all(parse_source(name,body,NOW.date())==[] for name,body in no_date.items())
    changed={'obr':b'<html><body>Maintenance</body></html>',
             'hm_treasury':b'<html><body>Maintenance</body></html>',
             'ofgem_energy':b'<html><body>Maintenance</body></html>'}
    for name,body in changed.items():
        with pytest.raises(ValueError): parse_source(name,body,NOW.date())
    with pytest.raises(ValueError,match='OBR'):
        parse_source('obr',b'<div class="block-pubs-footer"><h4><a>Economic and fiscal outlook</a></h4>Next release: October 2026</div>',NOW.date())
    with pytest.raises(ValueError,match='HM Treasury'):
        parse_source('hm_treasury',b'<main><h1>Chancellor letter - Budget 2026 date</h1><div class="govspeak">The Budget takes place on 28 October 2026.</div></main>',NOW.date())

def test_ons_fetch_url_is_bound_to_approved_host_and_path():
    from finstats.events import _provider_url_valid, _parse_ons, _source_url
    url='https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&release-type=type-upcoming&fromDate=2026-10-22&toDate=2027-10-22'
    assert _source_url('ons',NOW.date())==url
    assert _provider_url_valid('ons',url)
    assert not _provider_url_valid('ons',url.replace('&release-type=type-upcoming',''))
    assert not _provider_url_valid('ons',url.replace('type-upcoming','type-published'))
    assert not _provider_url_valid('ons',url.replace('api.beta.ons.gov.uk','evil.example'))
    assert not _provider_url_valid('ons',url.replace('limit=1000','limit=100'))
    assert not _provider_url_valid('ons',url+'#frag')
    with pytest.raises(ValueError,match='truncated'):
        _parse_ons(b'{"breakdown":{"total":2},"releases":[{}]}',NOW.date())

def test_corrupt_private_event_state_is_reported_without_blocking_metric_collection(tmp_path):
    from finstats.__main__ import collect
    from tests.test_finstats_sources import fixture_transport
    from tests.test_finstats_storage import CPI_WHEN
    (tmp_path/'events.json').write_text('{truncated')
    # The event collector sees corrupt state; the metrics collector still
    # completes when supplied its deterministic in-memory source transport.
    result=collect(tmp_path,transport=fixture_transport,clock=lambda:CPI_WHEN,
                   event_collector=lambda *args,**kwargs: collect_events(
                       tmp_path,clock=lambda:NOW,fetch=lambda _url:pytest.fail('must reject state before fetch')))
    assert result['failed_event_sources']==['event_state']
    assert (tmp_path/'shadow'/'current.json').exists()
    assert (tmp_path/'events.json').read_text()=='{truncated'

def test_time_requires_zone_and_is_converted_to_london():
    e=event('x','x','2027-01-02','2027-01-02T08:30:00Z','scheduled','ons',[],'https://www.ons.gov.uk/x')
    assert e['time']=='2027-01-02T08:30+00:00'
    with pytest.raises(ValueError): event('x','x','2027-01-02','2027-01-02T08:30','scheduled','ons',[],'https://www.ons.gov.uk/x')
    assert event('z','x','2027-01-02','2027-01-02T08:30:00Z','scheduled','ons',[],'https://www.ons.gov.uk/x')['time']=='2027-01-02T08:30+00:00'

def test_event_horizon_is_safe_on_leap_day():
    from finstats.events import _source_url
    url=_source_url('ons',datetime(2024,2,29,tzinfo=timezone.utc).date())
    assert 'toDate=2025-02-28' in url
    assert 'release-type=type-upcoming' in url

def test_reworked_boe_or_desnz_page_fails_closed():
    from finstats.events import parse_source
    with pytest.raises(ValueError,match='BoE'):
        parse_source('boe_mpc',b'<html><body>Maintenance</body></html>',NOW.date())
    with pytest.raises(ValueError,match='DESNZ'):
        parse_source('desnz_fuel',b'<html><body>Maintenance</body></html>',NOW.date())

def test_shared_event_identity_deduplicates_on_publication(tmp_path):
    a=event('shared','GDP release','2027-01-02',None,'scheduled','ons',['uk.gdp.monthly_growth'],'https://www.ons.gov.uk/x')
    b=dict(a,linked_indicators=['uk.gdp.monthly_growth','uk.unemployment.rate'])
    merged=deduplicate_events([a,b])
    assert len(merged)==1
    assert merged[0]['linked_indicators']==['uk.gdp.monthly_growth','uk.unemployment.rate']


@pytest.mark.parametrize('bad_date', [None, 'invalid', '2027-07-21', '2027-07-21T07:00:00'])
def test_malformed_recognized_ons_date_retains_previous_schedule(tmp_path, bad_date):
    collect_events(tmp_path, clock=lambda: NOW, fixtures=FIXTURES)
    state_path = tmp_path / 'events.json'
    saved = json.loads(state_path.read_text())
    saved['providers']['ons']['evidence_kind'] = 'official_download'
    previous = saved['providers']['ons']['events']
    state_path.write_text(json.dumps(saved))
    body = json.loads((Path(FIXTURES) / 'events_case_ons.json').read_text())
    body['releases'][0]['description']['release_date'] = bad_date
    def broken(url):
        if 'api.beta.ons.gov.uk' in url:
            return json.dumps(body).encode()
        raise OSError('unrelated provider unavailable')
    result = collect_events(tmp_path, clock=lambda: NOW, fetch=broken)
    assert 'ons' in result['failed_sources']
    assert result['schedule']['providers']['ons']['status'] == 'stale'
    assert result['schedule']['providers']['ons']['events'] == previous


def test_durable_sources_contain_no_hardcoded_2026_urls():
    from finstats.events import SOURCES
    for name, (fetch_url, calendar_url) in SOURCES.items():
        assert '2026' not in fetch_url, name
        assert '2026' not in calendar_url, name
    assert 'release-type=type-upcoming' in SOURCES['ons'][0]
    assert SOURCES['ofgem_energy'][0] == SOURCES['ofgem_energy'][1]
    assert SOURCES['hm_treasury'][0].startswith('https://www.gov.uk/api/search.json?')
    assert SOURCES['hm_treasury'][1] == 'https://www.gov.uk/government/organisations/hm-treasury'


def test_ofgem_durable_page_parses_omitted_start_year_and_excludes_published_periods():
    from finstats.events import SOURCES, parse_source
    durable_html = (
        b'<main><h1>Energy price cap</h1>'
        b'<article><h3>Changes to energy price cap between 1 January and 31 March 2027</h3>'
        b'<p>Publication date: 25 November 2026</p></article>'
        b'<section><h2>\n  Energy price cap dates\n</h2>'
        b'<p>The levels for the next periods will be announced by:</p>'
        b'<p>25 November 2026 \xe2\x80\x93 period 1 January 2027 to 31 March 2027</p>'
        b'<p>23 February 2027 \xe2\x80\x93 period 1 April 2027 to 30 June 2027</p>'
        b'<p>25 August 2027 \xe2\x80\x93 period 1 October to 31 December 2027</p>'
        b'<p>24 November 2027 \xe2\x80\x93 period 1 November to 31 January 2028</p>'
        b'<p>We may publish before these dates if we need to because of external reasons.</p>'
        b'</section></main>'
    )
    events = parse_source('ofgem_energy', durable_html, datetime(2026, 11, 25, 12, tzinfo=timezone.utc).date())
    assert [e['date'] for e in events] == ['2027-02-23', '2027-08-25', '2027-11-24']
    assert events[0]['source_url'] == SOURCES['ofgem_energy'][0]
    assert events[1]['title'] == (
        'Ofgem price cap level announcement due by 25 August 2027; '
        'Ofgem may publish earlier (effective period 1 October 2027 to 31 December 2027)'
    )
    assert events[2]['title'] == (
        'Ofgem price cap level announcement due by 24 November 2027; '
        'Ofgem may publish earlier (effective period 1 November 2027 to 31 January 2028)'
    )
    bad_period = (
        b'<main><h1>Energy price cap</h1><h2>Energy price cap dates</h2>'
        b'<p>The levels for the next periods will be announced by: '
        b'23 February 2027 - period 30 June 2027 to 1 April 2027. '
        b'We may publish before these dates.</p></main>'
    )
    with pytest.raises(ValueError, match='Ofgem'):
        parse_source('ofgem_energy', bad_period, NOW.date())


def test_hm_treasury_durable_search_api_extracts_future_budget_and_handles_unknown_dates(tmp_path):
    from finstats.events import SOURCES, parse_source
    payload = {
        'total': 4,
        'results': [
            {
                'public_timestamp': '2026-07-31T14:04:56Z',
                'title': 'Chancellor letter to the Treasury Select Committee (TSC) - Budget 2026 date',
                'link': '/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date',
                'description': 'The Chancellor has today written to the Treasury Select Committee (TSC) to confirm the date of the budget.',
            },
            {
                'public_timestamp': '2026-07-31T14:03:00Z',
                'title': 'Budget announcement 2026',
                'link': '/government/news/budget-2026-date-announcement',
                'description': 'Today (Friday 31 July), the Chancellor has confirmed that the date of the Budget will be Wednesday 28 October.',
            },
            {
                'public_timestamp': '2026-12-10T11:00:00Z',
                'title': 'Spring Budget 2027 date',
                'link': '/government/news/spring-budget-2027-date',
                'description': 'The Chancellor confirmed that the date of the Spring Budget will be Wednesday 10 March.',
            },
            {
                'public_timestamp': '2027-07-15T10:00:00Z',
                'title': 'Autumn Budget 2027 date',
                'link': '/government/publications/autumn-budget-2027-date',
                'description': 'The next Budget will be held on Wednesday 27 October 2027.',
            },
        ],
    }
    raw = json.dumps(payload).encode()
    before_2026 = parse_source('hm_treasury', raw, datetime(2026, 9, 1, tzinfo=timezone.utc).date())
    assert [(e['date'], e['source_url']) for e in before_2026] == [
        ('2026-10-28', 'https://www.gov.uk/government/news/budget-2026-date-announcement'),
        ('2027-03-10', 'https://www.gov.uk/government/news/spring-budget-2027-date'),
        ('2027-10-27', 'https://www.gov.uk/government/publications/autumn-budget-2027-date'),
    ]
    assert all(e['linked_indicators'] == ['uk.public_debt.net_debt_gdp'] for e in before_2026)

    after_all = parse_source('hm_treasury', raw, datetime(2027, 11, 1, tzinfo=timezone.utc).date())
    assert after_all == []

    # Full collection + public_events projection validates durable HM Treasury event provenance.
    def official_fetch(url):
        if 'api.beta.ons.gov.uk' in url:
            return b'{"breakdown":{"total":0},"releases":[]}'
        if 'bankofengland.co.uk' in url:
            return (Path(FIXTURES) / 'events_boe_mpc_capture.html').read_bytes()
        if 'weekly-road-fuel-prices' in url:
            return (Path(FIXTURES) / 'desnz_weekly_road_fuel_prices_release_2026-10-20.html').read_bytes()
        if 'obr.uk' in url:
            return (Path(FIXTURES) / 'events_obr.html').read_bytes()
        if 'gov.uk/api/search.json' in url:
            return raw
        return (Path(FIXTURES) / 'events_ofgem_energy.html').read_bytes()

    result = collect_events(tmp_path, clock=lambda: datetime(2027, 11, 1, 12, tzinfo=timezone.utc), fetch=official_fetch)
    assert result['failed_sources'] == []
    hmt = result['schedule']['providers']['hm_treasury']
    assert hmt['status'] == 'ok' and hmt['unknown_dates'] is True and hmt['events'] == []
    assert hmt['source_url'] == SOURCES['hm_treasury'][0]
    assert hmt['calendar_url'] == SOURCES['hm_treasury'][1]
    assert public_events(tmp_path)['providers']['hm_treasury']['unknown_dates'] is True

    result_future = collect_events(tmp_path, clock=lambda: datetime(2026, 9, 1, 12, tzinfo=timezone.utc), fetch=official_fetch)
    assert result_future['failed_sources'] == []
    projected = public_events(tmp_path)
    assert len(projected['providers']['hm_treasury']['events']) == 3

    # Reject spoofed HM Treasury event URL in public_events.
    tampered = json.loads((tmp_path / 'events.json').read_text())
    tampered['providers']['hm_treasury']['events'][0]['source_url'] = 'https://evil.example/government/news/fake'
    (tmp_path / 'events.json').write_text(json.dumps(tampered))
    with pytest.raises(ValueError, match='HM Treasury'):
        public_events(tmp_path)


@pytest.mark.parametrize('bad_payload', [
    b'{truncated',
    b'{"unexpected": true}',
    b'{"total": true, "results": [{}]}',
    b'{"total": 2, "results": []}',
    b'{"total": 0, "results": [{}]}',
    b'{"total": 1, "results": ["not-a-dict"]}',
    json.dumps({'total': 1, 'results': [{
        'public_timestamp': '2027-07-01T10:00:00Z',
        'link': '/evil/path',
        'description': 'The Chancellor confirmed that the date of the Budget will be Wednesday 27 October.',
    }]}).encode(),
    json.dumps({'total': 1, 'results': [{
        'public_timestamp': '2027-07-01T10:00:00',
        'link': '/government/news/budget-2027',
        'description': 'The Chancellor confirmed that the date of the Budget will be Wednesday 27 October.',
    }]}).encode(),
    json.dumps({'total': 1, 'results': [{
        'link': '/government/news/budget-2027',
        'description': 'The Chancellor confirmed that the date of the Budget will be Wednesday 27 October.',
    }]}).encode(),
    json.dumps({'total': 1, 'results': [{
        'public_timestamp': '2027-07-01T10:00:00Z',
        'link': '/government/news/budget-2027',
        'description': 'The Chancellor confirmed that the date of the Budget will be 31 February.',
    }]}).encode(),
])
def test_hm_treasury_malformed_search_payload_fails_closed(bad_payload):
    from finstats.events import parse_source
    with pytest.raises(ValueError, match='HM Treasury'):
        parse_source('hm_treasury', bad_payload, NOW.date())


@pytest.mark.parametrize('item,today', [
    # Historical 2025 announcement edited later in 2025 or 2026: 26 Nov 2026 is a Thursday, not Wednesday.
    ({
        'public_timestamp': '2025-12-01T10:00:00Z',
        'title': 'Budget announcement',
        'link': '/government/news/budget-2025-address',
        'description': 'Today (Wednesday 3 September), the Chancellor has confirmed that the date of the Budget will be Wednesday 26 November.',
    }, datetime(2026, 1, 10, tzinfo=timezone.utc).date()),
    ({
        'public_timestamp': '2026-02-01T10:00:00Z',
        'title': 'Budget announcement',
        'link': '/government/news/budget-2025-address',
        'description': 'Today (Wednesday 3 September), the Chancellor has confirmed that the date of the Budget will be Wednesday 26 November.',
    }, datetime(2026, 3, 1, tzinfo=timezone.utc).date()),
    # Edited 6 years later when 26 Nov is a Wednesday again, but title/link still marks Budget 2025.
    ({
        'public_timestamp': '2031-09-04T11:20:02Z',
        'title': 'Budget 2025 date',
        'link': '/government/news/budget-2025-date',
        'description': 'Today (Wednesday 3 September), the Chancellor has confirmed that the date of the Budget will be Wednesday 26 November.',
    }, datetime(2031, 9, 10, tzinfo=timezone.utc).date()),
    # Wrong weekday (28 Oct 2026 is Wednesday, not Monday) with inferred or explicit year.
    ({
        'public_timestamp': '2026-07-31T14:03:00Z',
        'title': 'Budget announcement 2026',
        'link': '/government/news/budget-2026-date',
        'description': 'The Chancellor confirmed that the date of the Budget will be Monday 28 October.',
    }, datetime(2026, 9, 1, tzinfo=timezone.utc).date()),
    ({
        'public_timestamp': '2026-07-31T14:03:00Z',
        'title': 'Budget announcement 2026',
        'link': '/government/news/budget-2026-date',
        'description': 'The next Budget will be held on Monday 28 October 2026.',
    }, datetime(2026, 9, 1, tzinfo=timezone.utc).date()),
    # Missing weekday when year is omitted cannot safely infer the year from public_timestamp.
    ({
        'public_timestamp': '2026-07-31T14:03:00Z',
        'title': 'Budget announcement',
        'link': '/government/news/budget-date',
        'description': 'The Chancellor confirmed that the date of the Budget will be 28 October.',
    }, datetime(2026, 9, 1, tzinfo=timezone.utc).date()),
    # Speculation and negation framing must never emit an official Budget date.
    ({
        'public_timestamp': '2026-07-31T14:03:00Z',
        'title': 'Response to press reports',
        'link': '/government/news/press-response',
        'description': 'Reports that the date of the Budget will be Wednesday 28 October are speculation.',
    }, datetime(2026, 9, 1, tzinfo=timezone.utc).date()),
    ({
        'public_timestamp': '2026-07-31T14:03:00Z',
        'title': 'Clarification on Budget date',
        'link': '/government/news/budget-clarification',
        'description': 'Claims that the date of the Budget will be Wednesday 28 October 2026 are not confirmed.',
    }, datetime(2026, 9, 1, tzinfo=timezone.utc).date()),
])
def test_hm_treasury_rejects_edited_historical_wrong_weekday_and_speculation_items(item, today):
    from finstats.events import parse_source
    raw = json.dumps({'total': 1, 'results': [item]}).encode()
    assert parse_source('hm_treasury', raw, today) == []


def test_migrated_provider_urls_reset_cleanly_to_unavailable_on_transient_failure(tmp_path):
    from finstats.events import SOURCES
    legacy_state = {
        'schema_version': 1,
        'mode': 'official',
        'checked_at': '2026-10-22T12:00:00Z',
        'providers': {
            'ons': {
                'status': 'ok',
                'qualification': 'qualified',
                'retrieved_at': '2026-10-22T12:00:00Z',
                'source_url': 'https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-10-22&toDate=2027-10-22',
                'calendar_url': 'https://www.ons.gov.uk/releasecalendar',
                'sha256': 'a' * 64,
                'evidence_kind': 'official_download',
                'events': [],
            },
            'ofgem_energy': {
                'status': 'ok',
                'qualification': 'qualified',
                'retrieved_at': '2026-10-22T12:00:00Z',
                'source_url': 'https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026',
                'calendar_url': 'https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap',
                'sha256': 'b' * 64,
                'evidence_kind': 'official_download',
                'events': [],
            },
            'hm_treasury': {
                'status': 'ok',
                'qualification': 'qualified',
                'retrieved_at': '2026-10-22T12:00:00Z',
                'source_url': 'https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date',
                'calendar_url': 'https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date',
                'sha256': 'c' * 64,
                'evidence_kind': 'official_download',
                'events': [],
            },
        },
        'attempts': [],
        'revisions': [],
    }
    (tmp_path / 'events.json').write_text(json.dumps(legacy_state))

    def partial_fetch(url):
        if 'ofgem.gov.uk' in url:
            raise OSError('transient Ofgem timeout')
        if 'api.beta.ons.gov.uk' in url:
            return b'{"breakdown":{"total":0},"releases":[]}'
        if 'bankofengland.co.uk' in url:
            return (Path(FIXTURES) / 'events_boe_mpc_capture.html').read_bytes()
        if 'weekly-road-fuel-prices' in url:
            return (Path(FIXTURES) / 'desnz_weekly_road_fuel_prices_release_2026-10-20.html').read_bytes()
        if 'obr.uk' in url:
            return (Path(FIXTURES) / 'events_obr.html').read_bytes()
        if 'gov.uk/api/search.json' in url:
            return b'{"total":0,"results":[]}'
        raise AssertionError(f'unexpected url {url}')

    result = collect_events(tmp_path, clock=lambda: NOW, fetch=partial_fetch)
    assert result['failed_sources'] == ['ofgem_energy']
    ofgem = result['schedule']['providers']['ofgem_energy']
    assert ofgem['status'] == 'unavailable'
    assert ofgem['events'] == []
    assert ofgem['source_url'] == SOURCES['ofgem_energy'][0]
    assert ofgem['calendar_url'] == SOURCES['ofgem_energy'][1]
    assert 'retrieved_at' not in ofgem
    # public_events must succeed so the newly deployed manifest can publish cleanly.
    projected = public_events(tmp_path)
    assert projected['providers']['ofgem_energy']['status'] == 'unavailable'
    assert projected['providers']['ons']['status'] == 'ok'
    assert projected['providers']['hm_treasury']['status'] == 'ok'
