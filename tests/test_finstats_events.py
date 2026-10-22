import json
from datetime import datetime, timezone

import pytest

from finstats.events import collect_events, deduplicate_events, event, public_events

FIXTURES='tests/fixtures/official'
NOW=datetime(2026,10,22,12,tzinfo=timezone.utc)

def test_recorded_sources_preserve_precision_dst_dedup_and_changes(tmp_path):
    result=collect_events(tmp_path,clock=lambda:NOW,fixtures=FIXTURES)
    assert result['failed_sources']==[]
    p=result['schedule']['providers']
    ons=p['ons']['events']
    assert len(ons)==3
    assert ons[1]['time']=='2027-07-21T07:00+01:00'  # BST, UTC release instant converted to London
    assert ons[1]['time_precision']=='minute'
    assert ons[2]['status']=='rescheduled'
    assert ons[0]['status']=='cancelled'
    boe=p['boe_mpc']['events']
    assert boe[0]['time'] is None and boe[0]['time_precision']=='date'
    assert len({e['id'] for e in boe})==2
    assert p['obr']['unknown_dates'] and p['ofgem_energy']['unknown_dates']
    with pytest.raises(ValueError,match='fixture'):
        public_events(tmp_path)

def test_failure_retains_last_schedule_as_stale(tmp_path):
    collect_events(tmp_path,clock=lambda:NOW,fixtures=FIXTURES)
    before=json.loads((tmp_path/'events.json').read_text())
    result=collect_events(tmp_path,clock=lambda:NOW,fetch=lambda url: (_ for _ in ()).throw(OSError()))
    assert len(result['failed_sources'])==6
    after=result['schedule']['providers']
    assert after['ons']['status']=='stale'
    assert after['ons']['events']==before['providers']['ons']['events']

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

def test_time_requires_zone_and_is_converted_to_london():
    e=event('x','x','2027-01-02','2027-01-02T08:30:00Z','scheduled','ons',[],'https://www.ons.gov.uk/x')
    assert e['time']=='2027-01-02T08:30+00:00'
    with pytest.raises(ValueError): event('x','x','2027-01-02','2027-01-02T08:30','scheduled','ons',[],'https://www.ons.gov.uk/x')

def test_shared_event_identity_deduplicates_on_publication(tmp_path):
    a=event('shared','GDP release','2027-01-02',None,'scheduled','ons',['uk.gdp.monthly_growth'],'https://www.ons.gov.uk/x')
    b=dict(a,linked_indicators=['uk.gdp.monthly_growth','uk.unemployment.rate'])
    merged=deduplicate_events([a,b])
    assert len(merged)==1
    assert merged[0]['linked_indicators']==['uk.gdp.monthly_growth','uk.unemployment.rate']
