"""Append-only evidence and source vintages. No dependency on AI or public JSON."""
from __future__ import annotations

from dataclasses import asdict, replace
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
import re
from pathlib import Path
import sqlite3
import tempfile

from finstats.sources import (
    DEFINITIONS, MAX_SOURCE_PAGE_BYTES, ValidationError, parse,
    parse_hpi_release_page, public_definition,
)


def utc_now():
    return datetime.now(timezone.utc)


def timestamp(value):
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError('A timezone-aware collection time is required')
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def atomic_write(path: Path, body: bytes, mode=0o600):
    """Same-filesystem replacement; the old file survives incomplete writes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(self.directory / 'statistics.sqlite3', timeout=5)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('PRAGMA journal_mode=WAL')
        version = self.db.execute('PRAGMA user_version').fetchone()[0]
        if version not in (0, 1, 2):
            self.db.close()
            raise ValueError('Unsupported statistics database version')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS definition (
                key TEXT PRIMARY KEY, content TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempt (
                id INTEGER PRIMARY KEY, key TEXT NOT NULL REFERENCES definition(key),
                collected_at TEXT NOT NULL, source_url TEXT NOT NULL,
                evidence_kind TEXT NOT NULL, raw_hash TEXT,
                status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','failed')),
                error TEXT
            );
            CREATE TABLE IF NOT EXISTS snapshot (
                id INTEGER PRIMARY KEY, key TEXT NOT NULL REFERENCES definition(key),
                attempt_id INTEGER NOT NULL REFERENCES attempt(id),
                vintage TEXT NOT NULL, semantic_hash TEXT NOT NULL,
                payload TEXT NOT NULL, UNIQUE(key, semantic_hash)
            );
            CREATE TABLE IF NOT EXISTS observation (
                snapshot_id INTEGER NOT NULL REFERENCES snapshot(id),
                period TEXT NOT NULL, value TEXT,
                status TEXT NOT NULL CHECK(status IN ('observed','missing')),
                source_row INTEGER NOT NULL,
                CHECK((value IS NULL AND status='missing') OR
                      (value IS NOT NULL AND status='observed')),
                PRIMARY KEY(snapshot_id,period)
            );
            CREATE INDEX IF NOT EXISTS snapshot_vintage ON snapshot(key,vintage,id);
            CREATE TABLE IF NOT EXISTS receipt (
                attempt_id INTEGER PRIMARY KEY REFERENCES attempt(id),
                snapshot_id INTEGER NOT NULL REFERENCES snapshot(id)
            );
        ''')
        with self.db:
            for key in DEFINITIONS:
                content = encode(public_definition(key)).decode()
                existing = self.db.execute('SELECT content FROM definition WHERE key=?', (key,)).fetchone()
                if existing and existing['content'] != content:
                    raise ValueError('Metric definition changed: explicit migration required')
                self.db.execute('INSERT OR IGNORE INTO definition VALUES (?,?)', (key, content))
        if version < 2:
            try:
                with self.db:
                    # Recover every accepted receipt, including A -> B -> A replays,
                    # from the original archive. Do not infer chronology from content IDs.
                    for attempt in self.db.execute('SELECT * FROM attempt').fetchall():
                        when = datetime.fromisoformat(attempt['collected_at'].replace('Z', '+00:00'))
                        self.db.execute('UPDATE attempt SET collected_at=? WHERE id=?',
                                        (timestamp(when), attempt['id']))
                        if attempt['status'] != 'accepted':
                            continue
                        body = (self.directory / 'raw' / (attempt['raw_hash'] + '.bin')).read_bytes()
                        if hashlib.sha256(body).hexdigest() != attempt['raw_hash']:
                            raise ValueError('Cannot migrate corrupted source evidence')
                        candidate = parse(attempt['key'], body, when.date())
                        digest = hashlib.sha256(encode(candidate.semantic_content())).hexdigest()
                        snapshot = self.db.execute(
                            'SELECT id FROM snapshot WHERE key=? AND semantic_hash=?',
                            (attempt['key'], digest)).fetchone()
                        if snapshot is None:
                            raise ValueError('Cannot recover accepted source receipt')
                        self.db.execute('INSERT INTO receipt VALUES (?,?)',
                                        (attempt['id'], snapshot['id']))
                    self.db.execute('PRAGMA user_version=2')
            except Exception:
                self.db.close()
                raise

    def close(self):
        self.db.close()

    def _archive_raw(self, body):
        digest = hashlib.sha256(body).hexdigest()
        raw_path = self.directory / 'raw' / (digest + '.bin')
        if not raw_path.exists():
            atomic_write(raw_path, body)
        elif hashlib.sha256(raw_path.read_bytes()).hexdigest() != digest:
            raise OSError('Archived source evidence failed integrity check')
        return digest

    def _write_hpi_evidence_receipt(self, attempt_id, receipt):
        path = self.directory / 'receipts' / f'{attempt_id}.json'
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.parent.chmod(0o700)
        body = encode(receipt)
        if path.exists():
            if path.read_bytes() != body:
                raise OSError('HPI source receipt is immutable')
            return
        atomic_write(path, body)

    def failed(self, key, when, error, source_url=None, evidence_kind='official_download'):
        with self.db:
            self.db.execute('''INSERT INTO attempt
                (key,collected_at,source_url,evidence_kind,status,error)
                VALUES (?,?,?,?,'failed',?)''',
                (key, timestamp(when), source_url or DEFINITIONS[key].download_url,
                 evidence_kind, error))

    def latest(self, key, known_at=None):
        cutoff = '' if known_at is None else ' AND a.collected_at <= ?'
        params = [key] if known_at is None else [key, timestamp(known_at)]
        row = self.db.execute('''SELECT s.*, a.id AS receipt_id, a.collected_at, a.raw_hash,
            a.source_url, a.evidence_kind FROM snapshot s
            JOIN receipt r ON r.snapshot_id=s.id JOIN attempt a ON a.id=r.attempt_id
            WHERE s.key=?''' + cutoff + ' ORDER BY s.vintage DESC,a.id DESC LIMIT 1', params).fetchone()
        return dict(row) if row else None

    def ingest(self, key, body, when, source_url=None, evidence_kind='official_download',
               source_published_date=None, release_page_evidence=None):
        collected = timestamp(when)
        digest = self._archive_raw(body)
        with self.db:
            cursor = self.db.execute('''INSERT INTO attempt
                (key,collected_at,source_url,evidence_kind,raw_hash,status)
                VALUES (?,?,?,?,?,'pending')''',
                (key, collected, source_url or DEFINITIONS[key].download_url, evidence_kind, digest))
            attempt_id = cursor.lastrowid
        try:
            candidate = parse(key, body, when.astimezone(timezone.utc).date())
            if key.startswith('house_price_'):
                if source_published_date is None:
                    raise ValidationError('UK HPI release date missing from source receipt')
                try:
                    datetime.strptime(source_published_date, '%Y-%m-%d')
                except (TypeError, ValueError) as exc:
                    raise ValidationError('Invalid UK HPI release date') from exc
                if source_published_date > when.date().isoformat():
                    raise ValidationError('Future UK HPI release date')
                release_month = source_published_date[:7]
                edition = re.search(r'/Average-prices-(\d{4}-\d{2})\.csv(?:\?|$)', source_url or '')
                if not edition:
                    raise ValidationError('UK HPI source URL is not a dated Average price CSV edition')
                latest_period = max(item.period for item in candidate.observations)
                if latest_period > release_month or latest_period > edition.group(1):
                    raise ValidationError('UK HPI reference period is later than its source release')
                if latest_period != edition.group(1):
                    raise ValidationError('UK HPI latest reference period does not match its source URL edition')
                if not isinstance(release_page_evidence, dict):
                    raise ValidationError('UK HPI release page evidence missing from source receipt')
                page_body = release_page_evidence.get('body')
                page_url = release_page_evidence.get('url')
                retrieved_at = release_page_evidence.get('retrieved_at')
                page_kind = release_page_evidence.get('evidence_kind')
                if not isinstance(page_body, bytes):
                    raise ValidationError('Invalid UK HPI release page bytes')
                if len(page_body) > MAX_SOURCE_PAGE_BYTES:
                    raise ValidationError('UK HPI release page exceeds size limit')
                if page_kind not in ('official_download', 'recorded_fixture'):
                    raise ValidationError('Invalid UK HPI release page evidence kind')
                if evidence_kind == 'recorded_fixture' and page_kind != 'recorded_fixture':
                    raise ValidationError('Fixture source requires labelled fixture release page evidence')
                if not isinstance(page_url, str) or not re.fullmatch(
                    r'https://www\.gov\.uk/government/statistical-data-sets/uk-house-price-index-data-downloads-[a-z]+-[0-9]{4}(?:--[0-9]+)?',
                    page_url,
                ):
                    raise ValidationError('Unexpected UK HPI release page URL')
                try:
                    page_time = datetime.fromisoformat(retrieved_at.replace('Z', '+00:00'))
                except (AttributeError, TypeError, ValueError) as exc:
                    raise ValidationError('Invalid UK HPI release page retrieval time') from exc
                if page_time.tzinfo is None or page_time.utcoffset() is None:
                    raise ValidationError('Invalid UK HPI release page retrieval time')
                if page_kind == 'official_download' and page_time.astimezone(timezone.utc) > when.astimezone(timezone.utc):
                    raise ValidationError('Future UK HPI release page retrieval time')
                try:
                    page_digest = self._archive_raw(page_body)
                except OSError as exc:
                    raise ValidationError('UK HPI release page archival failed') from exc
                page_published, page_csv_url = parse_hpi_release_page(page_body)
                release_receipt = {
                    'schema_version': 1,
                    'attempt_id': attempt_id,
                    'metric_key': key,
                    'source_csv_url': source_url,
                    'source_csv_sha256': digest,
                    'source_published_date': source_published_date,
                    'release_page_url': page_url,
                    'release_page_sha256': page_digest,
                    'release_page_retrieved_at': timestamp(page_time),
                    'release_page_evidence_kind': page_kind,
                    'parsed_published_date': page_published,
                    'parsed_csv_url': page_csv_url,
                }
                try:
                    self._write_hpi_evidence_receipt(attempt_id, release_receipt)
                except OSError as exc:
                    raise ValidationError('UK HPI source receipt archival failed') from exc
                if page_published != source_published_date:
                    raise ValidationError('UK HPI release page publication date disagrees with source receipt')
                if page_csv_url != source_url:
                    raise ValidationError('UK HPI release page CSV link disagrees with source URL')
                candidate = replace(candidate, published_date=source_published_date)
            if key.startswith('private_rent_') and evidence_kind == 'official_download':
                edition = re.search(r'(?:%2F|/)([0-9]{1,2}[a-z]+[0-9]{4})(?:%2F|/)', source_url or '')
                released = candidate.published_date
                month = datetime.strptime(released, '%Y-%m-%d').strftime('%B').lower()
                expected_edition = f'{int(released[8:])}{month}{released[:4]}'
                if not edition or edition.group(1) != expected_edition:
                    raise ValidationError('PIPR workbook URL and cover release date disagree')
            semantic_hash = hashlib.sha256(encode(candidate.semantic_content())).hexdigest()
            payload = asdict(candidate)
            # Keep the historical core snapshot wire shape byte-for-byte; only
            # qualified rolling-window observations carry reference metadata.
            for observation in payload['observations']:
                if observation['reference'] is None:
                    del observation['reference']
            vintage = candidate.published_date or candidate.observations[-1].period
            previous = self.latest(key)
            if previous and vintage >= previous['vintage']:
                old_periods = {o['period'] for o in json.loads(previous['payload'])['observations']}
                if not old_periods.issubset({o.period for o in candidate.observations}):
                    raise ValidationError('Source history lost reference periods; review required')
            with self.db:
                existing = self.db.execute('SELECT id FROM snapshot WHERE key=? AND semantic_hash=?',
                                           (key, semantic_hash)).fetchone()
                if existing:
                    snapshot_id = existing['id']
                else:
                    cursor = self.db.execute('''INSERT INTO snapshot
                        (key,attempt_id,vintage,semantic_hash,payload) VALUES (?,?,?,?,?)''',
                        (key, attempt_id, vintage, semantic_hash, encode(payload).decode()))
                    snapshot_id = cursor.lastrowid
                    self.db.executemany('INSERT INTO observation VALUES (?,?,?,?,?)', [
                        (snapshot_id, o.period, o.value, o.status, o.row) for o in candidate.observations])
                self.db.execute('INSERT INTO receipt VALUES (?,?)', (attempt_id, snapshot_id))
                self.db.execute("UPDATE attempt SET status='accepted' WHERE id=?", (attempt_id,))
            return snapshot_id
        except (ValueError, sqlite3.Error) as exc:
            with self.db:
                self.db.execute("UPDATE attempt SET status='rejected',error=? WHERE id=?",
                                (str(exc), attempt_id))
            raise

    def revisions(self, previous_id, current_id):
        rows = self.db.execute('SELECT id,key FROM snapshot WHERE id IN (?,?)',
                               (previous_id, current_id)).fetchall()
        if len(rows) != 2 or rows[0]['key'] != rows[1]['key']:
            raise ValueError('Revisions require two snapshots of the same metric')
        values = {}
        for snapshot_id in (previous_id, current_id):
            values[snapshot_id] = dict(self.db.execute(
                'SELECT period,value FROM observation WHERE snapshot_id=?', (snapshot_id,)))
        return {period: format(Decimal(value) - Decimal(values[previous_id][period]), 'f')
                for period, value in values[current_id].items()
                if value is not None and values[previous_id].get(period) is not None
                and Decimal(value) != Decimal(values[previous_id][period])}

    def backup(self, destination):
        """A consistent SQLite backup, including committed WAL contents."""
        with sqlite3.connect(destination) as target:
            self.db.backup(target)
