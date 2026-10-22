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
            if 'chancellor-letter-to-the-treasury' in url:
                return (Path(FIXTURES)/'events_hm_treasury.html').read_bytes()
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
    ],'breakdown':{'total':9}}).encode()
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
    from finstats.events import _provider_url_valid
    from finstats.events import _parse_ons
    url='https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-10-22&toDate=2027-10-22'
    assert _provider_url_valid('ons',url)
    assert not _provider_url_valid('ons',url.replace('api.beta.ons.gov.uk','evil.example'))
    assert not _provider_url_valid('ons',url.replace('limit=1000','limit=100'))
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
    assert 'toDate=2025-02-28' in _source_url('ons',datetime(2024,2,29,tzinfo=timezone.utc).date())

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
