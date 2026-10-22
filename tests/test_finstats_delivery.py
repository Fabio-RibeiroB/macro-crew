import hashlib
import json
from pathlib import Path
import stat
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from finstats.__main__ import collect
from finstats.delivery import deliver, main
from finstats.storage import Store, atomic_write
from finstats.sources import parse_hpi_release_page
from tests.test_finstats_sources import FIXTURES, fixture, fixture_transport
from tests.test_finstats_storage import CPI_WHEN, WHEN


def prepared(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    return private, public


def read_public(public):
    manifest = json.loads((public / 'current.json').read_text())
    body = (public / manifest['data_url']).read_bytes()
    assert hashlib.sha256(body).hexdigest() == manifest['sha256']
    return json.loads(body)


def test_public_delivery_is_readable_official_and_contains_no_private_files(tmp_path):
    private, public = prepared(tmp_path)
    deliver(private, public)
    data = read_public(public)
    assert data['mode'] == 'official'
    assert data['metrics']['cpih']['latest']['value'] == '3.3'
    assert len(data['metrics']['cpih']['history']) == 61
    assert stat.S_IMODE((public / 'current.json').stat().st_mode) == 0o644
    assert not list(public.rglob('*.sqlite3'))
    assert not list(public.rglob('*.bin'))
    assert 'source_row' not in json.dumps(data)
    assert 'raw/' not in json.dumps(data)
    assert str(private) not in json.dumps(data)
    receipts = [json.loads(path.read_text()) for path in (private / 'receipts').glob('*.json')]
    assert len(receipts) == 2  # UK HPI release receipts remain isolated by source.
    fuel_receipts = [json.loads(path.read_text()) for path in (private / 'fuel-receipts').glob('*.json')]
    assert {receipt['metric_key'] for receipt in fuel_receipts} == {'petrol_price', 'diesel_price'}
    for receipt in fuel_receipts:
        assert receipt['release_page_url'] == 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'
        assert receipt['source_csv_url'].startswith('https://assets.publishing.service.gov.uk/media/')
        assert hashlib.sha256((private / 'raw' / f"{receipt['release_page_sha256']}.bin").read_bytes()).hexdigest() == receipt['release_page_sha256']
        assert hashlib.sha256((private / 'raw' / f"{receipt['source_csv_sha256']}.bin").read_bytes()).hexdigest() == receipt['source_csv_sha256']

    store = Store(private)
    try:
        for receipt in receipts:
            assert receipt['release_page_evidence_kind'] == 'official_download'
            page = (private / 'raw' / f"{receipt['release_page_sha256']}.bin").read_bytes()
            csv = (private / 'raw' / f"{receipt['source_csv_sha256']}.bin").read_bytes()
            assert hashlib.sha256(page).hexdigest() == receipt['release_page_sha256']
            assert hashlib.sha256(csv).hexdigest() == receipt['source_csv_sha256']
            assert parse_hpi_release_page(page) == (
                receipt['parsed_published_date'], receipt['parsed_csv_url'])
            assert receipt['parsed_published_date'] == receipt['source_published_date']
            assert receipt['parsed_csv_url'] == receipt['source_csv_url']
            attempt = store.db.execute(
                'SELECT status,source_url,raw_hash FROM attempt WHERE id=?',
                (receipt['attempt_id'],),
            ).fetchone()
            assert tuple(attempt) == ('accepted', receipt['source_csv_url'], receipt['source_csv_sha256'])
            assert store.db.execute(
                'SELECT 1 FROM receipt WHERE attempt_id=?', (receipt['attempt_id'],),
            ).fetchone()
    finally:
        store.close()
    public_text = json.dumps(data)
    assert 'release_page_sha256' not in public_text
    assert 'release_page_retrieved_at' not in public_text
    assert not list(public.rglob('*.html'))


def test_additive_events_sidecar_is_separate_and_checksummed(tmp_path):
    private, public = prepared(tmp_path)
    event = {'id':'ons:/releases/gdp','title':'GDP monthly estimate, UK','date':'2027-01-01',
             'time':None,'time_precision':'date','status':'scheduled','source':'ons',
             'source_url':'https://www.ons.gov.uk/releases/gdp','linked_indicators':['uk.gdp.monthly_growth']}
    (private / 'events.json').write_text(json.dumps({
        'schema_version':1,'mode':'official','checked_at':'2026-10-22T12:00:00Z',
        'providers':{'ons':{'status':'ok','qualification':'qualified','retrieved_at':'2026-10-22T12:00:00Z',
          'source_url':'https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-10-22&toDate=2027-10-22',
          'calendar_url':'https://www.ons.gov.uk/releasecalendar','sha256':'a'*64,
          'evidence_kind':'official_download','events':[event]}},'attempts':[],'revisions':[]}))
    deliver(private, public)
    manifest=json.loads((public/'events-manifest.json').read_text())
    assert manifest['data_url']==f"event-generations/{manifest['sha256']}.json"
    payload=(public/manifest['data_url']).read_bytes()
    assert manifest['sha256']==hashlib.sha256(payload).hexdigest()
    assert json.loads(payload)['events']==[event]
    assert not list(public.rglob('*.bin')) and not list(public.rglob('*.sqlite3'))


def test_invalid_event_state_does_not_block_metric_activation_or_replace_event_manifest(tmp_path):
    private, public = prepared(tmp_path)
    public.mkdir()
    old_events = b'{"data_url":"event-generations/old.json","sha256":"old"}'
    (public/'events-manifest.json').write_bytes(old_events)
    (private/'events.json').write_text(json.dumps({
        'schema_version':1,'mode':'official','checked_at':'2026-10-22T12:00:00Z',
        'providers':{'ons':{'status':'ok','qualification':'qualified',
          'evidence_kind':'official_download','source_url':'https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-10-22&toDate=2027-10-22',
          'calendar_url':'https://www.ons.gov.uk/releasecalendar','events':[{'id':'bad','source':'ons','title':'GDP release',
          'date':'2027-01-01','time':None,'time_precision':'date','status':'scheduled',
          'source_url':'https://evil.example/releases/gdp','linked_indicators':['uk.gdp.monthly_growth']}]}}
    }))
    failures=[]
    deliver(private,public,event_failure_sink=failures)
    assert failures==['event_validation']
    assert read_public(public)['mode']=='official'
    assert (public/'events-manifest.json').read_bytes()==old_events


def test_event_payload_write_failure_keeps_old_event_manifest_and_publishes_metrics(tmp_path):
    from unittest.mock import patch
    import finstats.delivery as delivery
    private, public = prepared(tmp_path)
    public.mkdir()
    old_events = b'previous verified events manifest'
    (public/'events-manifest.json').write_bytes(old_events)
    event={'id':'ons:/releases/gdp-release','title':'GDP monthly estimate, UK','date':'2027-01-01',
           'time':None,'time_precision':'date','status':'scheduled','source':'ons',
           'source_url':'https://www.ons.gov.uk/releases/gdp-release',
           'linked_indicators':['uk.gdp.monthly_growth']}
    (private/'events.json').write_text(json.dumps({
        'schema_version':1,'mode':'official','checked_at':'2026-10-22T12:00:00Z',
        'providers':{'ons':{'status':'ok','qualification':'qualified','retrieved_at':'2026-10-22T12:00:00Z',
          'source_url':'https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate=2026-10-22&toDate=2027-10-22',
          'calendar_url':'https://www.ons.gov.uk/releasecalendar','sha256':'a'*64,
          'evidence_kind':'official_download','events':[event]}}}))
    original=delivery.atomic_write
    def broken_event_writer(path,*args,**kwargs):
        if 'event-generations' in str(path): raise OSError('simulated event payload write failure')
        return original(path,*args,**kwargs)
    failures=[]
    with patch('finstats.delivery.atomic_write',side_effect=broken_event_writer):
        delivery.deliver(private,public,event_failure_sink=failures)
    assert failures==['event_publication']
    assert (public/'events-manifest.json').read_bytes()==old_events
    assert read_public(public)['mode']=='official'


def test_fixture_event_state_is_rejected_without_blocking_metrics(tmp_path):
    from finstats.events import collect_events
    private, public = prepared(tmp_path)
    collect_events(private,clock=lambda:CPI_WHEN,fixtures=FIXTURES)
    failures=[]
    deliver(private,public,event_failure_sink=failures)
    assert failures==['event_validation']
    assert read_public(public)['mode']=='official'
    assert not (public/'events-manifest.json').exists()


def test_event_generation_pruning_keeps_active_symlinks_and_unexpected_files(tmp_path):
    import os, time
    from finstats.events import prune_event_generations
    directory=tmp_path/'event-generations'; directory.mkdir()
    active='a'*64; stale='b'*64; linked='c'*64
    active_path=directory/f'{active}.json'; stale_path=directory/f'{stale}.json'
    active_path.write_text('active'); stale_path.write_text('stale')
    old=time.time()-20*86400
    os.utime(active_path,(old,old)); os.utime(stale_path,(old,old))
    target=tmp_path/'outside.json'; target.write_text('preserve')
    (directory/f'{linked}.json').symlink_to(target)
    unexpected=directory/'notes.txt'; unexpected.write_text('preserve')
    (tmp_path/'events-manifest.json').write_text(json.dumps({
        'data_url':f'event-generations/{active}.json','sha256':active}))
    private=(tmp_path/'events-raw'); private.mkdir(); receipt=private/'receipt.bin'; receipt.write_bytes(b'private')
    (tmp_path/'events.json').write_text('private receipts remain untouched')
    prune_event_generations(tmp_path)
    assert active_path.exists() and not stale_path.exists()
    assert (directory/f'{linked}.json').is_symlink() and unexpected.exists()
    assert receipt.read_bytes()==b'private' and (tmp_path/'events.json').exists()


@pytest.mark.parametrize('failure', [
    'date_mismatch', 'link_mismatch', 'missing_page', 'page_archive', 'receipt_archive',
])
def test_hpi_release_evidence_failures_reject_only_hpi_and_publish_other_metrics(tmp_path, failure):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    deliver(private, public)
    before_store = Store(private)
    try:
        before = {key: before_store.latest(key)['id']
                  for key in ('house_price_level', 'house_price_growth')}
    finally:
        before_store.close()

    hpi_values = fixture_transport('house_price_level')
    page_body = hpi_values[3]['body'] + (b' ' if failure == 'page_archive' else b'')

    def transport(key):
        values = fixture_transport(key)
        if not key.startswith('house_price_'):
            return values
        body, url, published, page = values
        page = dict(page)
        if failure == 'date_mismatch':
            published = '2026-10-20'
        elif failure == 'link_mismatch':
            url += '&unlisted=1'
        elif failure == 'missing_page':
            page = None
        elif failure == 'page_archive':
            page['body'] = page_body
        return body, url, published, page

    if failure in ('page_archive', 'receipt_archive'):
        page_hash = hashlib.sha256(page_body).hexdigest()
        original = atomic_write

        def fail_page_archive(path, body, **kwargs):
            if failure == 'page_archive' and path.parent.name == 'raw' and path.name == page_hash + '.bin':
                raise OSError('private page archive unavailable')
            if failure == 'receipt_archive' and path.parent.name == 'receipts':
                raise OSError('private page archive unavailable')
            return original(path, body, **kwargs)

        with patch('finstats.storage.atomic_write', side_effect=fail_page_archive):
            result = collect(private, transport=transport, clock=lambda: CPI_WHEN + timedelta(days=1))
    else:
        result = collect(private, transport=transport, clock=lambda: CPI_WHEN + timedelta(days=1))

    assert result['failed_metrics'] == ['house_price_level', 'house_price_growth']
    after_store = Store(private)
    try:
        for key, snapshot_id in before.items():
            assert after_store.latest(key)['id'] == snapshot_id
            status = after_store.db.execute(
                'SELECT status FROM attempt WHERE key=? ORDER BY id DESC LIMIT 1', (key,),
            ).fetchone()['status']
            assert status == 'rejected'
    finally:
        after_store.close()
    deliver(private, public)
    data = read_public(public)
    assert all(data['metrics'][key]['collection_status'] == 'degraded'
               for key in before)
    assert all(data['metrics'][key]['latest']['value'] is not None for key in before)
    assert all(data['metrics'][key]['collection_status'] == 'ok'
               for key in data['metrics'] if key not in before)
    assert 'release_page_sha256' not in json.dumps(data)


def test_delivery_publishes_cpi_headline_with_core_metrics_retained(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    deliver(private, public)
    data = read_public(public)
    assert set(data['metrics']) == {
        'bank_rate', 'cpih', 'gdp', 'cpi',
        'regular_pay_nominal_growth', 'regular_pay_real_growth', 'unemployment',
        'public_debt', 'private_rent_growth', 'private_rent_level',
        'gilt_5y', 'gilt_10y', 'gilt_20y',
        'house_price_level', 'house_price_growth', 'petrol_price', 'diesel_price'}
    cpi = data['metrics']['cpi']
    assert cpi['validation_status'] == 'verified'
    assert cpi['snapshot_evidence_kind'] == 'official_download'
    assert cpi['latest'] == {'period': '2026-09', 'value': '3.5', 'status': 'observed'}
    assert cpi['latest'] == cpi['history'][-1]
    assert cpi['definition']['geography'] == 'United Kingdom'
    assert cpi['definition']['series'] == 'D7G7'
    assert cpi['source_download_url'].endswith('/economy/inflationandpriceindices/timeseries/d7g7/mm23/data')
    assert cpi['source_published_date'] == '2026-10-21'
    assert cpi['next_release_date'] == '2026-11-18'
    assert len(cpi['history']) == 17
    assert data['metrics']['cpih']['latest']['value'] == '3.3'
    assert data['metrics']['cpih']['definition']['series'] == 'L55O'
    assert data['metrics']['gdp']['latest']['value'] == '0.1'
    assert data['metrics']['bank_rate']['latest']['value'] == '3.75'
    debt = data['metrics']['public_debt']
    assert debt['latest'] == {'period': '2026-09', 'value': '94.0', 'status': 'observed'}
    assert debt['definition']['geography'] == 'United Kingdom'
    assert debt['definition']['unit'] == 'percent'
    assert debt['definition']['series'] == 'HF6X'
    assert debt['source_published_date'] == '2026-10-21'
    assert debt['next_release_date'] == '2026-11-20'
    assert debt['source_download_url'].endswith('timeseries%2Fhf6x%2Fpusf')
    assert data['metrics']['petrol_price']['latest']['value'] == '174.57'
    assert data['metrics']['diesel_price']['latest']['value'] == '199.33'
    assert data['metrics']['petrol_price']['latest']['period'] == '2026-10-19'
    assert data['metrics']['diesel_price']['latest']['reference'] == {
        'kind': 'weekly_observation', 'date': '2026-10-19'}
    nominal = data['metrics']['regular_pay_nominal_growth']
    real = data['metrics']['regular_pay_real_growth']
    assert nominal['latest']['reference'] == real['latest']['reference'] == {
        'kind': 'rolling_months', 'start_month': '2026-06', 'end_month': '2026-08'}
    assert nominal['definition']['geography'] == real['definition']['geography'] == 'Great Britain'
    assert nominal['definition']['unit'] == real['definition']['unit'] == 'percent'
    assert real['definition']['deflator'] == 'CPIH'
    assert real['latest']['value'] == '0.6'
    unemployment = data['metrics']['unemployment']
    assert unemployment['definition']['series'] == 'MGSX'
    assert unemployment['definition']['age_group'] == '16 and over'
    assert unemployment['latest']['period'] == '2026-08'
    assert unemployment['latest']['reference'] == {
        'kind': 'rolling_months', 'start_month': '2026-06', 'end_month': '2026-08'}
    assert '95% confidence intervals' in unemployment['quality_note']
    assert unemployment['quality_source_url'].endswith('/articles/labourforcesurveyqualityupdate/october2026')
    growth = data['metrics']['private_rent_growth']
    level = data['metrics']['private_rent_level']
    assert growth['definition']['geography'] == level['definition']['geography'] == 'United Kingdom'
    assert growth['definition']['area_code'] == level['definition']['area_code'] == 'K02000001'
    assert growth['definition']['unit'] == 'percent'
    assert level['definition']['unit'] == 'GBP_per_month'
    assert growth['latest']['period'] == level['latest']['period'] == '2026-09'
    assert level['latest']['value'] == '1406'
    house_level = data['metrics']['house_price_level']
    house_growth = data['metrics']['house_price_growth']
    assert house_level['definition']['geography'] == 'United Kingdom'
    assert house_level['definition']['area_code'] == 'K02000001'
    assert house_level['definition']['unit'] == 'GBP'
    assert house_growth['definition']['unit'] == 'percent'
    assert house_level['latest']['period'] == house_growth['latest']['period'] == '2026-08'
    assert house_level['latest']['value'] == '273037'
    assert house_growth['latest']['value'] == '0.9'
    assert house_level['source_published_date'] == '2026-10-21'


def test_checked_in_producer_generation_regenerates_byte_identically(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    calls = 0
    def producer_clock():
        nonlocal calls
        calls += 1
        # Keep the established source timestamps byte-identical. The
        # retained release page was captured the following day, so only the two
        # HPI ingests and final publication use that later controlled time.
        return CPI_WHEN - timedelta(days=1) if calls <= 16 else CPI_WHEN
    with patch('finstats.publication.uuid4', return_value=SimpleNamespace(hex='c' * 32)):
        collect(private, transport=fixture_transport, clock=producer_clock)
        deliver(private, public)
    wire = Path(__file__).parent / 'fixtures' / 'verified'
    manifest = json.loads((public / 'current.json').read_text())
    assert manifest['generation_id'] == 'c' * 32
    assert (public / 'current.json').read_bytes() == (wire / 'producer-fuel-v1.manifest.json').read_bytes()
    assert (public / manifest['data_url']).read_bytes() == (wire / 'producer-fuel-v1.json').read_bytes()
    candidate = json.loads((wire / 'producer-fuel-v1.json').read_bytes())
    previous = json.loads((wire / 'producer-cpi-v1.json').read_bytes())
    for key in ('bank_rate', 'cpih', 'gdp', 'cpi'):
        current_core = dict(candidate['metrics'][key])
        previous_core = dict(previous['metrics'][key])
        # This field depends on the publication clock, unlike core source data.
        current_core.pop('release_status', None)
        previous_core.pop('release_status', None)
        assert current_core == previous_core


def test_shared_wire_fixtures_keep_m1_core_identical_and_add_optional_members():
    wire = Path(__file__).parent / 'fixtures' / 'verified'
    def load(name):
        body = (wire / f'{name}.json').read_bytes()
        manifest = json.loads((wire / f'{name}.manifest.json').read_text())
        data = json.loads(body)
        assert hashlib.sha256(body).hexdigest() == manifest['sha256']
        assert data['generation_id'] == manifest['generation_id']
        return data

    baseline = load('m1-core-only')
    candidate = load('v1-with-optional')
    core = {'bank_rate', 'cpih', 'gdp'}
    assert set(baseline['metrics']) == core
    assert set(candidate['metrics']) == core | {
        'cpi', 'regular_pay_nominal_growth', 'regular_pay_real_growth', 'unemployment'
    }
    for key in core:
        assert candidate['metrics'][key] == baseline['metrics'][key]
        assert candidate['metrics'][key]['latest'] == candidate['metrics'][key]['history'][-1]


def test_fixture_replay_cannot_be_published_as_official(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, fixtures=FIXTURES, clock=lambda: WHEN)
    with pytest.raises(ValueError, match='fixtures'):
        deliver(private, public)
    assert not (public / 'current.json').exists()


def test_mocked_collection_cannot_publish_hpi_backed_by_recorded_page(tmp_path):
    from finstats.sources import recorded_hpi_release_evidence

    private, public = tmp_path / 'private', tmp_path / 'public'
    def transport(key):
        values = fixture_transport(key)
        if key.startswith('house_price_'):
            body, url, published, _ = values
            return (body, url, published,
                    recorded_hpi_release_evidence(url, published, '2026-10-21T23:06:23Z'))
        return values

    result = collect(private, transport=transport, clock=lambda: CPI_WHEN)
    assert result['failed_metrics'] == ['house_price_level', 'house_price_growth']
    store = Store(private)
    try:
        for key in ('house_price_level', 'house_price_growth'):
            assert store.latest(key) is None
            assert store.db.execute(
                "SELECT status FROM attempt WHERE key=? ORDER BY id DESC LIMIT 1", (key,),
            ).fetchone()[0] == 'rejected'
    finally:
        store.close()
    deliver(private, public)
    data = read_public(public)
    for key in ('house_price_level', 'house_price_growth'):
        assert data['metrics'][key]['validation_status'] == 'unavailable'
        assert data['metrics'][key]['latest'] is None
        assert data['metrics'][key]['history'] == []
    assert data['metrics']['gdp']['latest']['value'] is not None


def test_invalid_source_hash_or_path_never_replaces_public_manifest(tmp_path):
    private, public = prepared(tmp_path)
    deliver(private, public)
    previous = (public / 'current.json').read_bytes()
    manifest_path = private / 'shadow' / 'current.json'
    manifest = json.loads(manifest_path.read_text())
    for change in ({'sha256': '0' * 64}, {'data_url': '../../private.json'}):
        manifest_path.write_text(json.dumps({**manifest, **change}))
        with pytest.raises(ValueError):
            deliver(private, public)
        assert (public / 'current.json').read_bytes() == previous


def test_public_activation_failure_keeps_previous_complete_generation(tmp_path):
    private, public = prepared(tmp_path)
    deliver(private, public)
    previous = (public / 'current.json').read_bytes()
    collect(private, transport=fixture_transport, clock=lambda: WHEN)
    def fail(path, body, **kwargs):
        if path.name == 'current.json':
            raise OSError('activation failed')
        atomic_write(path, body, **kwargs)
    with patch('finstats.delivery.atomic_write', side_effect=fail), pytest.raises(OSError):
        deliver(private, public)
    assert (public / 'current.json').read_bytes() == previous
    read_public(public)


def test_partial_collection_publishes_valid_statistics_but_returns_failure(tmp_path):
    private, public = prepared(tmp_path)
    def partial(directory):
        def fetcher(key):
            if key == 'gdp':
                raise TimeoutError()
            return fixture_transport(key)
        return collect(directory, transport=fetcher, clock=lambda: WHEN)
    with patch('finstats.delivery.collect', side_effect=partial):
        assert main(['--state-dir', str(private), '--output-dir', str(public)]) == 1
    assert read_public(public)['metrics']['gdp']['collection_status'] == 'degraded'


@pytest.mark.parametrize('relationship', ['same', 'child', 'parent'])
def test_private_state_cannot_be_exposed_as_public_root(tmp_path, relationship):
    private = tmp_path / 'state'
    public = private if relationship == 'same' else private / 'web' if relationship == 'child' else tmp_path
    with pytest.raises(ValueError):
        deliver(private, public)


def test_public_directories_remain_traversable_under_private_service_umask(tmp_path):
    import os
    private, public = prepared(tmp_path)
    old = os.umask(0o077)
    try:
        manifest = deliver(private, public)
    finally:
        os.umask(old)
    for path in (public, public / 'generations', (public / manifest['data_url']).parent):
        assert stat.S_IMODE(path.stat().st_mode) == 0o755


def test_export_retention_keeps_active_generations_and_all_source_evidence(tmp_path):
    import os
    from finstats.delivery import prune_generations
    private, public = prepared(tmp_path)
    deliver(private, public)
    manifest = json.loads((public / 'current.json').read_text())
    current = public / manifest['data_url']
    old_dir = public / 'generations' / ('f' * 32)
    old_dir.mkdir()
    old_payload = old_dir / 'data.json'
    old_payload.write_text('{}')
    os.utime(old_payload, (1, 1))
    os.utime(current, (1, 1))
    unusual = public / 'generations' / ('e' * 32)
    unusual.mkdir()
    (unusual / 'operator-note.txt').write_text('keep')
    prune_generations(public)
    assert current.exists()
    assert not old_dir.exists()
    assert unusual.exists()
    assert (private / 'statistics.sqlite3').exists()
    assert list((private / 'raw').iterdir())
