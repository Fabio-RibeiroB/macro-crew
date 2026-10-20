"""Append-only evidence and source vintages. No dependency on AI or public JSON."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile

from finstats.sources import DEFINITIONS, ValidationError, parse


def utc_now():
    return datetime.now(timezone.utc)


def timestamp(value):
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError('A timezone-aware collection time is required')
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def atomic_write(path: Path, body: bytes):
    """Same-filesystem replacement; the old file survives incomplete writes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
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
        if version not in (0, 1):
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
            PRAGMA user_version=1;
        ''')
        with self.db:
            for key, definition in DEFINITIONS.items():
                content = encode(asdict(definition)).decode()
                existing = self.db.execute('SELECT content FROM definition WHERE key=?', (key,)).fetchone()
                if existing and existing['content'] != content:
                    raise ValueError('Metric definition changed: explicit migration required')
                self.db.execute('INSERT OR IGNORE INTO definition VALUES (?,?)', (key, content))

    def close(self):
        self.db.close()

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
        row = self.db.execute('''SELECT s.*, a.collected_at, a.raw_hash,
            a.source_url, a.evidence_kind FROM snapshot s JOIN attempt a ON a.id=s.attempt_id
            WHERE s.key=?''' + cutoff + ' ORDER BY s.vintage DESC,s.id DESC LIMIT 1', params).fetchone()
        return dict(row) if row else None

    def ingest(self, key, body, when, source_url=None, evidence_kind='official_download'):
        collected = timestamp(when)
        digest = hashlib.sha256(body).hexdigest()
        raw_path = self.directory / 'raw' / (digest + '.bin')
        if not raw_path.exists():
            atomic_write(raw_path, body)
        elif hashlib.sha256(raw_path.read_bytes()).hexdigest() != digest:
            raise OSError('Archived source evidence failed integrity check')
        with self.db:
            cursor = self.db.execute('''INSERT INTO attempt
                (key,collected_at,source_url,evidence_kind,raw_hash,status)
                VALUES (?,?,?,?,?,'pending')''',
                (key, collected, source_url or DEFINITIONS[key].download_url, evidence_kind, digest))
            attempt_id = cursor.lastrowid
        try:
            candidate = parse(key, body, when.astimezone(timezone.utc).date())
            semantic_hash = hashlib.sha256(encode(candidate.semantic_content())).hexdigest()
            payload = asdict(candidate)
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
