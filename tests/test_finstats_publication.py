from datetime import timedelta
import http.client
import hashlib
import io
import json
from pathlib import Path
from unittest.mock import patch
import zipfile

import pytest

from finstats.__main__ import collect, collector_lock, main
from finstats.publication import publish
from finstats.storage import Store
from tests.test_finstats_sources import FIXTURES, fixture, fixture_transport
from tests.test_finstats_storage import CPI_WHEN, WHEN


def read_generation(directory):
    root = directory / 'shadow'
    manifest = json.loads((root / 'current.json').read_text())
    body = (root / manifest['data_url']).read_bytes()
    assert hashlib.sha256(body).hexdigest() == manifest['sha256']
    data = json.loads(body)
    assert data['generation_id'] == manifest['generation_id']
    return data


def corrupt_pipr_table_xml(body):
    source = zipfile.ZipFile(io.BytesIO(body))
    altered = io.BytesIO()
    with zipfile.ZipFile(altered, 'w', zipfile.ZIP_DEFLATED) as output:
        for member in source.infolist():
            content = (b'<invalid' if member.filename == 'xl/worksheets/sheet4.xml'
                       else source.read(member.filename))
            output.writestr(member.filename, content)
    body = altered.getvalue()
    assert zipfile.is_zipfile(io.BytesIO(body))
    with zipfile.ZipFile(io.BytesIO(body)) as check:
        assert check.read('xl/worksheets/sheet4.xml') == b'<invalid'
        assert check.read('xl/workbook.xml')
    return body


def test_offline_cli_publishes_core_and_cpi_without_ai(tmp_path):
    with patch.dict('os.environ', {'OPENAI_API_KEY': '', 'EXA_API_KEY': ''}):
        result = collect(tmp_path, fixtures=FIXTURES, clock=lambda: CPI_WHEN)
    assert not result['failed_metrics']
    data = read_generation(tmp_path)
    assert data['mode'] == 'shadow'
    for member in data['metrics'].values():
        assert member['snapshot_evidence_kind'] == 'recorded_fixture'
        assert member['last_successful_check_at'] is None  # Not a live freshness claim.
        assert member['latest'] == member['history'][-1]
    assert data['metrics']['cpi']['latest']['value'] == '3.5'
    assert data['metrics']['cpi']['definition']['geography'] == 'United Kingdom'
    assert data['metrics']['cpi']['source_published_date'] == '2026-10-21'
    assert not (tmp_path / 'research_report.json').exists()
    assert not (tmp_path / 'history_report.json').exists()


def test_failed_source_keeps_last_verified_figures_and_other_sources_publish(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: WHEN)
    def broken(key):
        if key == 'cpih':
            raise TimeoutError('do not publish sensitive error detail')
        return fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: WHEN + timedelta(days=2))
    assert result['failed_metrics'] == ['cpih']
    data = read_generation(tmp_path)
    assert data['metrics']['cpih']['latest']['value'] == '3.3'
    assert data['metrics']['cpih']['collection_status'] == 'degraded'
    assert data['metrics']['cpih']['release_status'] == 'delayed'
    assert data['metrics']['gdp']['collection_status'] == 'ok'
    assert 'sensitive error' not in json.dumps(data)


def test_first_run_missing_source_is_unavailable_not_zero(tmp_path):
    def broken(key):
        return b'<html>access denied</html>' if key == 'gdp' else fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN)
    assert result['failed_metrics'] == ['gdp']
    member = read_generation(tmp_path)['metrics']['gdp']
    assert member['latest'] is None
    assert member['history'] == []
    assert member['validation_status'] == 'unavailable'


def test_cpi_never_collected_is_unavailable_not_zero(tmp_path):
    def broken(key):
        return b'<html>access denied</html>' if key == 'cpi' else fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN)
    assert result['failed_metrics'] == ['cpi']
    member = read_generation(tmp_path)['metrics']['cpi']
    assert member['latest'] is None
    assert member['history'] == []
    assert member['validation_status'] == 'unavailable'
    assert member['definition']['geography'] == 'United Kingdom'
    assert read_generation(tmp_path)['metrics']['cpih']['latest']['value'] == '3.3'


def test_cpi_failure_after_success_keeps_last_verified_cpi(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    def broken(key):
        if key == 'cpi':
            raise TimeoutError('temporary outage')
        return fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN + timedelta(days=2))
    assert result['failed_metrics'] == ['cpi']
    data = read_generation(tmp_path)
    assert data['metrics']['cpi']['latest']['value'] == '3.5'
    assert data['metrics']['cpi']['collection_status'] == 'degraded'
    assert 'temporary outage' not in json.dumps(data)


def test_pay_windows_round_trip_through_private_store_and_public_projection(tmp_path):
    private, public_dir = tmp_path / 'private', tmp_path / 'public'
    result = collect(private, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    assert not result['failed_metrics']
    data = read_generation(private)
    for key in ('regular_pay_nominal_growth', 'regular_pay_real_growth'):
        member = data['metrics'][key]
        assert member['definition']['geography'] == 'Great Britain'
        assert member['definition']['window_months'] == 3
        assert member['latest']['reference'] == {
            'kind': 'rolling_months', 'start_month': '2026-06', 'end_month': '2026-08'}
        assert member['history'][-1]['reference'] == member['latest']['reference']
        assert member['latest']['row'] > 0  # Source locator stays in the private shadow.
    assert data['metrics']['regular_pay_real_growth']['definition']['deflator'] == 'CPIH'
    from finstats.delivery import deliver
    deliver(private, public_dir)
    manifest = json.loads((public_dir / 'current.json').read_text())
    public = json.loads((public_dir / manifest['data_url']).read_text())
    for key in ('regular_pay_nominal_growth', 'regular_pay_real_growth'):
        assert 'row' not in public['metrics'][key]['latest']


def test_pay_feeds_fail_independently_and_preserve_their_own_last_window(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    def broken(key):
        if key == 'regular_pay_real_growth':
            raise TimeoutError('private source failure')
        return fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == ['regular_pay_real_growth']
    data = read_generation(tmp_path)
    assert data['metrics']['regular_pay_nominal_growth']['collection_status'] == 'ok'
    assert data['metrics']['regular_pay_real_growth']['collection_status'] == 'degraded'
    assert data['metrics']['regular_pay_real_growth']['latest']['period'] == '2026-08'
    assert data['metrics']['regular_pay_real_growth']['latest']['reference']['start_month'] == '2026-06'


def test_rent_level_failure_does_not_hide_growth_and_retains_its_verified_history(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    def broken(key):
        if key == 'private_rent_level':
            raise TimeoutError('level download failure')
        return fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == ['private_rent_level']
    data = read_generation(tmp_path)
    assert data['metrics']['private_rent_growth']['collection_status'] == 'ok'
    assert data['metrics']['private_rent_growth']['latest']['value'] == '3.8'
    assert data['metrics']['private_rent_level']['collection_status'] == 'degraded'
    assert data['metrics']['private_rent_level']['latest']['value'] == '1406'


@pytest.mark.parametrize(('bad_column', 'failed_key', 'accepted_key'), [
    ('Annual_Change', 'house_price_growth', 'house_price_level'),
    ('Average_Price', 'house_price_level', 'house_price_growth'),
])
def test_house_price_series_fail_independently_and_keep_prior_verified_history(
        tmp_path, bad_column, failed_key, accepted_key):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    before = read_generation(tmp_path)
    def broken_one_series(key):
        if key.startswith('house_price_'):
            body, url, released, page_evidence = fixture_transport(key)
            lines = body.decode().splitlines()
            headers = lines[0].split(',')
            position = headers.index(bad_column)
            cells = lines[-1].split(',')
            cells[position] = 'UNKNOWN'
            lines[-1] = ','.join(cells)
            return ('\n'.join(lines) + '\n').encode(), url, released, page_evidence
        return fixture_transport(key)
    result = collect(tmp_path, transport=broken_one_series, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == [failed_key]
    data = read_generation(tmp_path)
    assert data['metrics'][failed_key]['collection_status'] == 'degraded'
    assert data['metrics'][failed_key]['history'] == before['metrics'][failed_key]['history']
    assert data['metrics'][accepted_key]['collection_status'] == 'ok'
    assert data['metrics'][accepted_key]['latest']['period'] == '2026-08'
    assert data['metrics']['gdp']['collection_status'] == 'ok'
    from finstats.delivery import deliver
    public_dir = tmp_path.parent / (tmp_path.name + '-public')
    deliver(tmp_path, public_dir)
    manifest = json.loads((public_dir / 'current.json').read_text())
    public = json.loads((public_dir / manifest['data_url']).read_text())
    assert public['metrics'][failed_key]['collection_status'] == 'degraded'
    assert public['metrics'][accepted_key]['collection_status'] == 'ok'
    assert public['metrics']['gdp']['latest']['value'] is not None


def test_malformed_hpi_csv_is_quarantined_while_other_feeds_deliver(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    malformed_body = b'Date,Region_Name,Area_Code\n\xff'
    def malformed_hpi(key):
        if key.startswith('house_price_'):
            body, url, released, page_evidence = fixture_transport(key)
            return malformed_body, url, released, page_evidence
        return fixture_transport(key)
    result = collect(tmp_path, transport=malformed_hpi, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == ['house_price_level', 'house_price_growth']
    data = read_generation(tmp_path)
    for key in ('house_price_level', 'house_price_growth'):
        assert data['metrics'][key]['collection_status'] == 'degraded'
        assert data['metrics'][key]['latest']['period'] == '2026-08'
    assert data['metrics']['gdp']['collection_status'] == 'ok'
    store = Store(tmp_path)
    try:
        for key in ('house_price_level', 'house_price_growth'):
            attempt = store.db.execute(
                'SELECT status,raw_hash,error FROM attempt WHERE key=? ORDER BY id DESC LIMIT 1',
                (key,),
            ).fetchone()
            assert tuple(attempt) == (
                'rejected', hashlib.sha256(malformed_body).hexdigest(), 'Invalid UK HPI CSV',
            )
    finally:
        store.close()


def test_corrupt_pipr_is_quarantined_and_other_metrics_still_deliver(tmp_path):
    private, public_dir = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    first = read_generation(private)

    def malformed_pipr(key):
        if key.startswith('private_rent_'):
            body, source_url = fixture_transport(key)
            return corrupt_pipr_table_xml(body), source_url
        return fixture_transport(key)

    result = collect(private, transport=malformed_pipr, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == ['private_rent_growth', 'private_rent_level']
    data = read_generation(private)
    for key in ('private_rent_growth', 'private_rent_level'):
        assert data['metrics'][key]['collection_status'] == 'degraded'
        assert data['metrics'][key]['latest']['value'] == first['metrics'][key]['latest']['value']
        assert data['metrics'][key]['history'] == first['metrics'][key]['history']
    assert data['metrics']['cpih']['collection_status'] == 'ok'
    assert data['metrics']['cpih']['latest']['value'] == '3.3'

    from finstats.delivery import deliver
    deliver(private, public_dir)
    manifest = json.loads((public_dir / 'current.json').read_text())
    public_body = (public_dir / manifest['data_url']).read_bytes()
    assert hashlib.sha256(public_body).hexdigest() == manifest['sha256']
    public = json.loads(public_body)
    assert public['metrics']['cpih']['latest']['value'] == '3.3'
    assert public['metrics']['private_rent_growth']['latest']['value'] == '3.8'
    assert public['metrics']['private_rent_level']['latest']['value'] == '1406'
    assert public['metrics']['private_rent_growth']['collection_status'] == 'degraded'
    assert public['metrics']['private_rent_level']['collection_status'] == 'degraded'


def test_petrol_feed_failure_keeps_its_verified_history_and_diesel_independent(tmp_path):
    private = tmp_path / 'fuel-state'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    store = Store(private)
    try:
        before_petrol = store.latest('petrol_price')['id']
        petrol_attempt = store.latest('petrol_price')['receipt_id']
        before_diesel = store.latest('diesel_price')['id']
    finally:
        store.close()

    def petrol_header_failure(key):
        fetched = fixture_transport(key)
        if key == 'petrol_price':
            body, url, published, page = fetched
            return body.replace(b'ULSP (Ultra low sulphur unleaded petrol) Pump price', b'wrong source', 1), url, published, page
        return fetched

    result = collect(private, transport=petrol_header_failure, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == ['petrol_price']
    store = Store(private)
    try:
        petrol = store.latest('petrol_price')
        diesel = store.latest('diesel_price')
        assert petrol['id'] == before_petrol
        assert diesel['id'] == before_diesel
        assert len(json.loads(petrol['payload'])['observations']) == 460
        rejected = store.db.execute("SELECT id FROM attempt WHERE key='petrol_price' AND status='rejected' ORDER BY id DESC LIMIT 1").fetchone()
        assert rejected is not None
        receipt = json.loads((private / 'fuel-receipts' / f"{petrol_attempt}.json").read_text())
        assert receipt['metric_key'] == 'petrol_price'
        assert receipt['source_csv_url'].startswith('https://assets.publishing.service.gov.uk/media/')
        assert receipt['release_page_url'] == 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'
    finally:
        store.close()


def test_pay_revision_keeps_window_identity_and_previous_snapshot(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    first = read_generation(tmp_path)['metrics']['regular_pay_nominal_growth']
    def revised(key):
        body = fixture(key)
        return body.replace(b'"date": "2026 AUG", "value": "3.7"',
                            b'"date": "2026 AUG", "value": "3.8"') if key == 'regular_pay_nominal_growth' else body
    collect(tmp_path, transport=revised, clock=lambda: CPI_WHEN + timedelta(minutes=1))
    current = read_generation(tmp_path)['metrics']['regular_pay_nominal_growth']
    assert current['latest']['value'] == '3.8'
    assert current['latest']['reference'] == first['latest']['reference']
    assert current['snapshot_id'] != first['snapshot_id']


def test_unemployment_failure_retains_its_verified_window_without_blocking_pay(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    first = read_generation(tmp_path)
    prior = first['metrics']['unemployment']
    def broken(key):
        if key == 'unemployment':
            return fixture(key).replace(b'"date": "2026 JUL", "value": "4.7"',
                                        b'"date": "2026 JUL", "value": ".."', 1)
        return fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == ['unemployment']
    data = read_generation(tmp_path)
    current = data['metrics']['unemployment']
    assert current['collection_status'] == 'degraded'
    assert current['latest'] == prior['latest']
    assert current['latest']['reference'] == {
        'kind': 'rolling_months', 'start_month': '2026-06', 'end_month': '2026-08'}
    assert current['quality_note'] == prior['quality_note']
    assert data['metrics']['regular_pay_nominal_growth']['collection_status'] == 'ok'
    assert data['metrics']['gdp']['collection_status'] == 'ok'


def test_never_collected_unemployment_stays_unavailable_and_not_zero(tmp_path):
    def broken(key):
        return b'<html>access denied</html>' if key == 'unemployment' else fixture_transport(key)
    result = collect(tmp_path, transport=broken, clock=lambda: CPI_WHEN)
    assert result['failed_metrics'] == ['unemployment']
    member = read_generation(tmp_path)['metrics']['unemployment']
    assert member['validation_status'] == 'unavailable'
    assert member['latest'] is None
    assert member['history'] == []


def test_unemployment_revision_preserves_rolling_window_and_prior_vintage(tmp_path):
    collect(tmp_path, transport=lambda key: fixture_transport(key), clock=lambda: CPI_WHEN)
    original = read_generation(tmp_path)['metrics']['unemployment']
    def revised(key):
        body = fixture(key)
        return body.replace(b'"date": "2026 JUL", "value": "4.7"',
                            b'"date": "2026 JUL", "value": "4.8"') if key == 'unemployment' else body
    collect(tmp_path, transport=revised, clock=lambda: CPI_WHEN + timedelta(minutes=1))
    current = read_generation(tmp_path)['metrics']['unemployment']
    assert current['latest']['value'] == '4.8'
    assert current['latest']['reference'] == original['latest']['reference']
    assert current['snapshot_id'] != original['snapshot_id']


def test_activation_failure_preserves_previous_complete_generation(tmp_path):
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN)
    original = read_generation(tmp_path)
    from finstats.storage import atomic_write
    def fail_manifest(path, body):
        if path.name == 'current.json':
            raise OSError('injected activation failure')
        atomic_write(path, body)
    store = Store(tmp_path)
    try:
        with patch('finstats.publication.atomic_write', side_effect=fail_manifest):
            with pytest.raises(OSError):
                publish(store, WHEN + timedelta(hours=1))
        assert read_generation(tmp_path) == original
        assert json.loads((tmp_path / 'shadow' / 'health.json').read_text())['checked_at'].startswith('2026-10-20T13')
        publish(store, WHEN + timedelta(hours=2))
        assert read_generation(tmp_path)['generation_id'] != original['generation_id']
    finally:
        store.close()


def test_incomplete_generation_never_activates(tmp_path):
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN)
    original = read_generation(tmp_path)
    with patch('finstats.publication.atomic_write', side_effect=OSError('disk full')):
        with pytest.raises(OSError):
            collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN)
    assert read_generation(tmp_path) == original


def test_overlapping_collectors_fail_without_mutating_state(tmp_path):
    with collector_lock(tmp_path):
        with pytest.raises(RuntimeError, match='Another shadow collector'):
            collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN)
    assert not (tmp_path / 'statistics.sqlite3').exists()


def test_cli_returns_failure_for_partial_collection_and_rejects_production_paths(tmp_path):
    with patch('finstats.__main__.collect', return_value={'failed_metrics': ['gdp']}):
        assert main(['--data-dir', str(tmp_path)]) == 1
    project = Path(__file__).resolve().parents[1]
    for directory in (project, project / 'public', project / 'dist' / 'data'):
        with pytest.raises(SystemExit):
            main(['--data-dir', str(directory)])


@pytest.mark.parametrize('error_factory', [
    lambda: http.client.IncompleteRead(b'partial CSV'),
    lambda: http.client.RemoteDisconnected('closed'),
    lambda: http.client.BadStatusLine('invalid response'),
])
def test_http_protocol_failure_is_isolated_and_last_verified_data_survives(tmp_path, error_factory):
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: CPI_WHEN)
    def transport(key):
        if key == 'cpih':
            raise error_factory()
        return fixture_transport(key)
    result = collect(tmp_path, transport=transport, clock=lambda: CPI_WHEN + timedelta(hours=1))
    assert result['failed_metrics'] == ['cpih']
    data = read_generation(tmp_path)
    assert data['metrics']['cpih']['latest']['value'] == '3.3'
    assert data['metrics']['cpih']['collection_status'] == 'degraded'
    assert data['metrics']['cpi']['collection_status'] == 'ok'
    assert data['metrics']['gdp']['collection_status'] == 'ok'


def test_sqlite_statement_failure_rolls_back_one_metric_and_others_publish(tmp_path):
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: CPI_WHEN)
    instance = Store(tmp_path)
    instance.db.executescript("""
        CREATE TRIGGER reject_cpih BEFORE INSERT ON observation
        WHEN (SELECT key FROM snapshot WHERE id=NEW.snapshot_id)='cpih'
        BEGIN SELECT RAISE(ABORT,'injected source statement failure'); END;
    """)
    instance.close()
    def transport(key):
        body = fixture(key)
        return body.replace(b'"2026 AUG","3.3"', b'"2026 AUG","3.4"') if key == 'cpih' else fixture_transport(key)
    result = collect(tmp_path, transport=transport, clock=lambda: CPI_WHEN + timedelta(hours=1))
    assert result['failed_metrics'] == ['cpih']
    data = read_generation(tmp_path)
    assert data['metrics']['cpih']['latest']['value'] == '3.3'
    assert data['metrics']['cpih']['collection_status'] == 'degraded'
    assert data['metrics']['gdp']['collection_status'] == 'ok'
    instance = Store(tmp_path)
    try:
        from finstats.sources import DEFINITIONS
        assert instance.db.execute('SELECT count(*) FROM snapshot').fetchone()[0] == len(DEFINITIONS)
        assert not instance.db.in_transaction
    finally:
        instance.close()


def test_unusable_database_stops_without_publishing_and_cli_reports_failure(tmp_path, capsys):
    import sqlite3
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN)
    before = read_generation(tmp_path)
    with patch('finstats.__main__.Store.ingest', side_effect=sqlite3.OperationalError('private detail')), \
         patch('finstats.__main__.Store.failed', side_effect=sqlite3.OperationalError('private detail')), \
         patch('finstats.__main__.publish') as publication:
        assert main(['--data-dir', str(tmp_path), '--fixtures-dir', str(FIXTURES)]) == 1
        publication.assert_not_called()
    assert read_generation(tmp_path) == before
    assert 'private detail' not in capsys.readouterr().err


def test_cli_rejects_all_project_descendants_and_symlink_aliases(tmp_path):
    project = Path(__file__).resolve().parents[1]
    alias = tmp_path / 'repository-link'
    alias.symlink_to(project, target_is_directory=True)
    for directory in (project / 'private-shadow', project / 'src' / 'state', alias / 'private-shadow'):
        with pytest.raises(SystemExit):
            main(['--data-dir', str(directory)])
    with patch('finstats.__main__.collect', return_value={'failed_metrics': []}) as collection:
        assert main(['--data-dir', str(tmp_path / 'outside')]) == 0
        collection.assert_called_once()


def test_a_b_a_export_uses_current_receipt_with_deduplicated_content(tmp_path):
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN)
    first = read_generation(tmp_path)['metrics']['gdp']
    def revised(key):
        body = fixture(key)
        return body.replace(b'"2026 AUG","0.1"', b'"2026 AUG","0.2"') if key == 'gdp' else body
    collect(tmp_path, transport=revised, clock=lambda: WHEN + timedelta(minutes=1))
    collect(tmp_path, fixtures=FIXTURES, clock=lambda: WHEN + timedelta(minutes=2))
    current = read_generation(tmp_path)['metrics']['gdp']
    assert current['latest']['value'] == '0.1'
    assert current['snapshot_id'] == first['snapshot_id']
    assert current['source_receipt_id'] != first['source_receipt_id']
    assert current['retrieved_at'] != first['retrieved_at']
