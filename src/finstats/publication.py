"""Consistent immutable shadow exports; a single manifest activates a generation."""
from __future__ import annotations

from dataclasses import asdict
import hashlib
import json
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

from finstats.sources import DEFINITIONS
from finstats.storage import atomic_write, encode, timestamp


def health(store, when):
    result = {}
    for key in DEFINITIONS:
        last = store.db.execute('SELECT * FROM attempt WHERE key=? ORDER BY id DESC LIMIT 1',
                                (key,)).fetchone()
        successful = store.db.execute("""SELECT collected_at FROM attempt
            WHERE key=? AND status='accepted' AND evidence_kind='official_download'
            ORDER BY id DESC LIMIT 1""", (key,)).fetchone()
        result[key] = {
            'collection_status': ('ok' if last['status'] == 'accepted' else 'degraded') if last else 'unavailable',
            'last_attempt_at': last['collected_at'] if last else None,
            'last_successful_check_at': successful['collected_at'] if successful else None,
            'evidence_kind': last['evidence_kind'] if last else None,
            # Detailed errors remain private in SQLite; public output uses a safe status.
        }
    return {'schema_version': 1, 'checked_at': timestamp(when), 'metrics': result}


def publish(store, when):
    generation = uuid4().hex
    output = {'schema_version': 1, 'generation_id': generation,
              'published_at': timestamp(when), 'mode': 'shadow', 'metrics': {}}
    # A single read transaction selects health, figures and histories consistently.
    store.db.execute('BEGIN')
    try:
        health_data = health(store, when)
        for key, definition in DEFINITIONS.items():
            selected = store.latest(key)
            member = {'definition': asdict(definition), **health_data['metrics'][key]}
            if selected is None:
                member.update({'validation_status': 'unavailable', 'latest': None, 'history': []})
            else:
                payload = json.loads(selected['payload'])
                local_date = when.astimezone(ZoneInfo('Europe/London')).date().isoformat()
                next_release = payload['next_release']
                member.update({
                    'validation_status': 'verified',
                    'snapshot_id': selected['id'],
                    'source_published_date': payload['published_date'],
                    'publication_time_precision': 'date' if payload['published_date'] else 'unknown',
                    'source_published_at': None,
                    'next_release_date': next_release,
                    'release_status': ('delayed' if next_release < local_date else 'awaiting_next_release')
                                      if next_release else 'unknown',
                    'retrieved_at': selected['collected_at'],
                    'source_download_url': selected['source_url'],
                    'source_sha256': selected['raw_hash'],
                    'parser_version': payload['parser_version'],
                    'vintage_ordering': 'source_date_then_first_seen',
                    'snapshot_evidence_kind': selected['evidence_kind'],
                    'latest': payload['observations'][-1],
                    'history': payload['observations'],
                })
            output['metrics'][key] = member
    finally:
        store.db.rollback()  # End read transaction, including if selection failed.
    root = store.directory / 'shadow'
    relative_path = f'generations/{generation}/data.json'
    body = encode(output)
    # Health can move independently even when numerical activation fails.
    atomic_write(root / 'health.json', encode(health_data))
    atomic_write(root / relative_path, body)
    manifest = {'schema_version': 1, 'generation_id': generation,
                'published_at': timestamp(when), 'data_url': relative_path,
                'sha256': hashlib.sha256(body).hexdigest()}
    atomic_write(root / 'current.json', encode(manifest))
    return manifest
