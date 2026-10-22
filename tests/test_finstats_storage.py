from datetime import datetime, timezone, timedelta
import hashlib
import json

import pytest

from finstats.sources import ValidationError
from finstats.storage import Store
from tests.test_finstats_sources import fixture

WHEN = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
CPI_WHEN = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)


@pytest.fixture
def store(tmp_path):
    instance = Store(tmp_path / 'state')
    yield instance
    instance.close()


def test_replay_records_attempts_without_duplicate_vintages(store):
    first = store.ingest('gdp', fixture('gdp'), WHEN)
    assert store.ingest('gdp', fixture('gdp'), WHEN + timedelta(hours=1)) == first
    assert store.db.execute('SELECT count(*) FROM snapshot').fetchone()[0] == 1
    assert store.db.execute('SELECT count(*) FROM attempt').fetchone()[0] == 2
    assert store.db.execute('SELECT count(*) FROM observation').fetchone()[0] > 300
    digest = hashlib.sha256(fixture('gdp')).hexdigest()
    assert (store.directory / 'raw' / (digest + '.bin')).read_bytes() == fixture('gdp')


def test_existing_store_reopen_and_replay_preserves_definitions_and_semantic_hash(tmp_path):
    directory = tmp_path / 'existing'
    original = Store(directory)
    snapshot_id = original.ingest('gdp', fixture('gdp'), WHEN)
    stored_definition = original.db.execute(
        "SELECT content FROM definition WHERE key='gdp'").fetchone()['content']
    stored_snapshot = original.db.execute(
        'SELECT semantic_hash,payload FROM snapshot WHERE id=?', (snapshot_id,)
    ).fetchone()
    original.close()

    reopened = Store(directory)
    try:
        assert reopened.ingest('gdp', fixture('gdp'), WHEN + timedelta(hours=1)) == snapshot_id
        assert reopened.db.execute(
            "SELECT content FROM definition WHERE key='gdp'").fetchone()['content'] == stored_definition
        replayed = reopened.db.execute(
            'SELECT semantic_hash,payload FROM snapshot WHERE id=?', (snapshot_id,)
        ).fetchone()
        assert tuple(replayed) == tuple(stored_snapshot)
        assert reopened.db.execute('SELECT count(*) FROM snapshot').fetchone()[0] == 1
        assert reopened.db.execute('SELECT count(*) FROM receipt').fetchone()[0] == 2
    finally:
        reopened.close()


def test_revision_and_local_knowledge_time_are_preserved(store):
    first = store.ingest('gdp', fixture('gdp'), WHEN)
    corrected = fixture('gdp').replace(b'"2026 AUG","0.1"', b'"2026 AUG","0.2"')
    second = store.ingest('gdp', corrected, WHEN + timedelta(hours=1))
    assert second != first
    assert store.revisions(first, second) == {'2026-08': '0.1'}
    assert store.latest('gdp', known_at=WHEN)['id'] == first
    assert store.latest('gdp')['id'] == second
    assert store.latest('gdp', known_at=WHEN - timedelta(days=1)) is None


def test_new_release_with_unchanged_values_has_its_own_vintage(store):
    first = store.ingest('gdp', fixture('gdp'), WHEN)
    newer = fixture('gdp').replace(b'15-10-2026', b'19-10-2026')
    second = store.ingest('gdp', newer, WHEN)
    assert first != second
    assert store.revisions(first, second) == {}


def test_historical_backfill_does_not_replace_newer_release(store):
    first = store.ingest('gdp', fixture('gdp'), WHEN)
    older = fixture('gdp').replace(b'15-10-2026', b'14-10-2026')
    backfill = store.ingest('gdp', older, WHEN + timedelta(hours=1))
    assert first != backfill
    assert store.latest('gdp')['id'] == first


def test_truncated_or_invalid_source_cannot_replace_verified_history(store):
    first = store.ingest('gdp', fixture('gdp'), WHEN)
    truncated = fixture('gdp').replace(b'"1997 FEB","0.3"\n', b'')
    for body in (truncated, b'<html>denied</html>'):
        with pytest.raises(ValidationError):
            store.ingest('gdp', body, WHEN)
    assert store.latest('gdp')['id'] == first
    assert store.db.execute("SELECT count(*) FROM attempt WHERE status='rejected'").fetchone()[0] == 2
    assert store.db.execute('SELECT count(*) FROM snapshot').fetchone()[0] == 1


def test_hpi_reference_period_cannot_exceed_recorded_release_month(store):
    body = fixture('house_price_level')
    with pytest.raises(ValidationError, match='later than its source release'):
        store.ingest('house_price_level', body, CPI_WHEN,
                     source_url='https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-08.csv',
                     source_published_date='2026-07-31')


@pytest.mark.parametrize('key', ['house_price_level', 'house_price_growth'])
def test_hpi_truncated_edition_rejects_and_retains_prior_snapshot(store, tmp_path, key):
    body = b''.join(
        line for line in fixture('house_price_level').splitlines(keepends=True)
        if not line.startswith(b'2026-08-01,United Kingdom,K02000001,')
    )
    july_url = 'https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-07.csv'
    august_url = 'https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-08.csv'
    prior_id = store.ingest(key, body, CPI_WHEN, source_url=july_url,
                            source_published_date='2026-07-31')
    prior = store.latest(key)
    prior_history = store.db.execute(
        'SELECT period,value,status,source_row FROM observation WHERE snapshot_id=? ORDER BY period',
        (prior_id,),
    ).fetchall()
    assert json.loads(prior['payload'])['published_date'] == '2026-07-31'
    assert json.loads(prior['payload'])['observations'][-1]['period'] == '2026-07'

    with pytest.raises(ValidationError, match='latest reference period does not match'):
        store.ingest(key, body, CPI_WHEN, source_url=august_url,
                     source_published_date='2026-10-21')

    current = store.latest(key)
    assert current['id'] == prior_id
    assert current['payload'] == prior['payload']
    assert current['source_url'] == july_url
    assert store.db.execute(
        'SELECT period,value,status,source_row FROM observation WHERE snapshot_id=? ORDER BY period',
        (prior_id,),
    ).fetchall() == prior_history
    rejected = store.db.execute(
        'SELECT status,source_url FROM attempt WHERE key=? ORDER BY id DESC LIMIT 1', (key,),
    ).fetchone()
    assert tuple(rejected) == ('rejected', august_url)
    assert store.db.execute('SELECT count(*) FROM snapshot WHERE key=?', (key,)).fetchone()[0] == 1

    cold = Store(tmp_path / f'cold-{key}')
    try:
        with pytest.raises(ValidationError, match='latest reference period does not match'):
            cold.ingest(key, body, CPI_WHEN, source_url=august_url,
                        source_published_date='2026-10-21')
        assert cold.latest(key) is None
        assert cold.db.execute(
            "SELECT status FROM attempt WHERE key=? ORDER BY id DESC LIMIT 1", (key,),
        ).fetchone()['status'] == 'rejected'
    finally:
        cold.close()


def test_metrics_fail_independently_and_no_ai_is_required(store):
    store.ingest('cpih', fixture('cpih'), WHEN)
    store.failed('gdp', WHEN, 'HTTP 503')
    assert store.latest('cpih') is not None
    assert store.latest('gdp') is None


def test_backup_restores_snapshots_and_query_results(store, tmp_path):
    store.ingest('gdp', fixture('gdp'), WHEN)
    restored_dir = tmp_path / 'restored'
    restored_dir.mkdir()
    store.backup(restored_dir / 'statistics.sqlite3')
    restored = Store(restored_dir)
    try:
        assert restored.latest('gdp')['payload'] == store.latest('gdp')['payload']
    finally:
        restored.close()


def test_cpi_json_replay_stores_snapshots_and_evidence(store):
    first = store.ingest('cpi', fixture('cpi'), CPI_WHEN)
    assert store.ingest('cpi', fixture('cpi'), CPI_WHEN + timedelta(hours=1)) == first
    assert store.db.execute('SELECT count(*) FROM snapshot').fetchone()[0] == 1
    assert store.db.execute('SELECT count(*) FROM attempt').fetchone()[0] == 2
    observations = store.db.execute(
        'SELECT period,value FROM observation WHERE snapshot_id=?', (first,)).fetchall()
    assert ('2026-09', '3.5') in {(o['period'], o['value']) for o in observations}
    assert len(observations) == 17
    digest = hashlib.sha256(fixture('cpi')).hexdigest()
    assert (store.directory / 'raw' / (digest + '.bin')).read_bytes() == fixture('cpi')


def test_cpi_revision_is_recorded_and_the_latest_wins(store):
    first = store.ingest('cpi', fixture('cpi'), CPI_WHEN)
    revised = fixture('cpi').replace(b'"value": "3.5"', b'"value": "3.6"')
    second = store.ingest('cpi', revised, CPI_WHEN + timedelta(hours=1))
    assert second != first
    assert store.revisions(first, second) == {'2026-09': '0.1'}
    assert store.latest('cpi')['id'] == second
    assert store.latest('cpi', known_at=CPI_WHEN)['id'] == first


def test_cpi_replayed_original_returns_to_the_original_snapshot(store):
    first = store.ingest('cpi', fixture('cpi'), CPI_WHEN)
    revised = fixture('cpi').replace(b'"value": "3.5"', b'"value": "3.6"')
    store.ingest('cpi', revised, CPI_WHEN + timedelta(minutes=1))
    replayed = store.ingest('cpi', fixture('cpi'), CPI_WHEN + timedelta(minutes=2))
    assert replayed == first
    assert store.latest('cpi')['id'] == first


def test_cpi_history_loss_is_rejected_and_last_verified_survives(store):
    first = store.ingest('cpi', fixture('cpi'), CPI_WHEN)
    payload = json.loads(fixture('cpi').decode())
    payload['months'] = [m for m in payload['months'] if m['date'] != '2025 JAN']
    with pytest.raises(ValidationError, match='history lost'):
        store.ingest('cpi', json.dumps(payload).encode(), CPI_WHEN + timedelta(hours=1))
    assert store.latest('cpi')['id'] == first
    assert store.db.execute("SELECT count(*) FROM attempt WHERE status='rejected'").fetchone()[0] == 1


def test_cpi_unknown_value_token_quarantines_the_candidate(store):
    first = store.ingest('cpi', fixture('cpi'), CPI_WHEN)
    payload = json.loads(fixture('cpi').decode())
    for month in payload['months']:
        if month['date'] == '2026 SEP':
            month['value'] = '..'
    with pytest.raises(ValidationError):
        store.ingest('cpi', json.dumps(payload).encode(), CPI_WHEN + timedelta(hours=1))
    assert store.latest('cpi')['id'] == first


def test_cpi_json_never_accepts_the_csv_generator_route(store):
    # The CPIH CSV body must not silently become CPI evidence.
    with pytest.raises(ValidationError):
        store.ingest('cpi', fixture('cpih'), CPI_WHEN)


def test_rejects_naive_collection_time(store):
    with pytest.raises(ValueError, match='timezone-aware'):
        store.ingest('gdp', fixture('gdp'), datetime(2026, 10, 20))


def test_transaction_rolls_back_partial_observation_insert(store):
    store.db.executescript("""CREATE TRIGGER fail_observation BEFORE INSERT ON observation
        WHEN NEW.period='2026-08' BEGIN SELECT RAISE(ABORT,'injected disk/db error'); END;""")
    with pytest.raises(Exception, match='injected disk/db error'):
        store.ingest('gdp', fixture('gdp'), WHEN)
    assert store.latest('gdp') is None
    assert store.db.execute('SELECT count(*) FROM observation').fetchone()[0] == 0
    assert store.db.execute('SELECT status FROM attempt').fetchone()[0] == 'rejected'


def test_same_date_a_b_a_reappearance_selects_latest_receipt(store):
    first = store.ingest('gdp', fixture('gdp'), WHEN)
    changed = fixture('gdp').replace(b'"2026 AUG","0.1"', b'"2026 AUG","0.2"')
    second = store.ingest('gdp', changed, WHEN + timedelta(minutes=1))
    repeated = store.ingest('gdp', fixture('gdp'), WHEN + timedelta(minutes=2))
    assert repeated == first  # Content deduplicates; receipt chronology does not.
    assert store.latest('gdp')['id'] == first
    assert store.latest('gdp')['receipt_id'] == 3
    assert store.latest('gdp')['collected_at'].startswith('2026-10-20T12:02')
    assert store.latest('gdp', known_at=WHEN + timedelta(minutes=1))['id'] == second
    assert store.latest('gdp', known_at=WHEN)['receipt_id'] == 1
    assert store.revisions(second, repeated) == {'2026-08': '-0.1'}
    assert store.db.execute('SELECT count(*) FROM snapshot').fetchone()[0] == 2
    assert store.db.execute('SELECT count(*) FROM receipt').fetchone()[0] == 3


def test_as_known_cutoff_excludes_later_fractional_second(store):
    store.ingest('gdp', fixture('gdp'), WHEN + timedelta(microseconds=1))
    assert store.latest('gdp', known_at=WHEN) is None


def test_v1_migration_recovers_repeated_receipts_and_is_idempotent(tmp_path):
    directory = tmp_path / 'legacy'
    instance = Store(directory)
    first = instance.ingest('gdp', fixture('gdp'), WHEN)
    instance.ingest('gdp', fixture('gdp').replace(b'"2026 AUG","0.1"', b'"2026 AUG","0.2"'),
                    WHEN + timedelta(minutes=1))
    instance.ingest('gdp', fixture('gdp'), WHEN + timedelta(minutes=2))
    instance.db.executescript('DROP TABLE receipt; PRAGMA user_version=1;')
    instance.close()
    for _ in range(2):
        instance = Store(directory)
        try:
            assert instance.db.execute('PRAGMA user_version').fetchone()[0] == 2
            assert instance.latest('gdp')['id'] == first
            assert instance.latest('gdp')['receipt_id'] == 3
            assert instance.latest('gdp', known_at=WHEN)['receipt_id'] == 1
        finally:
            instance.close()


def test_v1_migration_missing_archive_fails_without_partial_receipts(tmp_path):
    directory = tmp_path / 'legacy'
    instance = Store(directory)
    instance.ingest('gdp', fixture('gdp'), WHEN)
    instance.db.executescript('DROP TABLE receipt; PRAGMA user_version=1;')
    instance.close()
    for raw in (directory / 'raw').iterdir():
        raw.unlink()
    with pytest.raises(OSError):
        Store(directory)
    import sqlite3
    with sqlite3.connect(directory / 'statistics.sqlite3') as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 1
        assert db.execute('SELECT count(*) FROM receipt').fetchone()[0] == 0
