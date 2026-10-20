from datetime import datetime, timezone, timedelta
import hashlib
import json

import pytest

from finstats.sources import ValidationError
from finstats.storage import Store
from tests.test_finstats_sources import fixture

WHEN = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)


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
