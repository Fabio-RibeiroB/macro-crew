import hashlib
import json
from pathlib import Path
import stat
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from finstats.__main__ import collect
from finstats.delivery import deliver, main
from finstats.storage import atomic_write
from tests.test_finstats_sources import FIXTURES, fixture
from tests.test_finstats_storage import CPI_WHEN, WHEN


def prepared(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=fixture, clock=lambda: WHEN)
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


def test_delivery_publishes_cpi_headline_with_core_metrics_retained(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=fixture, clock=lambda: CPI_WHEN)
    deliver(private, public)
    data = read_public(public)
    assert set(data['metrics']) == {'bank_rate', 'cpih', 'gdp', 'cpi'}
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


def test_checked_in_producer_generation_regenerates_byte_identically(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    with patch('finstats.publication.uuid4', return_value=SimpleNamespace(hex='c' * 32)):
        collect(private, transport=fixture, clock=lambda: CPI_WHEN)
        deliver(private, public)
    wire = Path(__file__).parent / 'fixtures' / 'verified'
    manifest = json.loads((public / 'current.json').read_text())
    assert manifest['generation_id'] == 'c' * 32
    assert (public / 'current.json').read_bytes() == (wire / 'producer-cpi-v1.manifest.json').read_bytes()
    assert (public / manifest['data_url']).read_bytes() == (wire / 'producer-cpi-v1.json').read_bytes()


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
    collect(private, transport=fixture, clock=lambda: WHEN)
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
            return fixture(key)
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
