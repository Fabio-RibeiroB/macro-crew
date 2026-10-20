"""Explicit shadow-only CLI. Never writes the legacy production report files."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
from pathlib import Path
import sqlite3
import sys

from finstats.publication import publish
from finstats.sources import DEFINITIONS, fetch
from finstats.storage import Store, utc_now


@contextmanager
def collector_lock(directory):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (directory / 'collector.lock').open('a') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError('Another shadow collector holds the data-directory lock') from exc
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def collect(directory, transport=fetch, clock=utc_now, fixtures=None):
    failures = []
    with collector_lock(Path(directory)):
        store = Store(directory)
        try:
            for key in DEFINITIONS:
                body = None
                when = clock()
                try:
                    if fixtures:
                        body = (Path(fixtures) / f'{key}.csv').read_bytes()
                        kind = 'recorded_fixture'
                        url = f'fixture:{key}.csv'
                    else:
                        body = transport(key)
                        kind = 'official_download'
                        url = DEFINITIONS[key].download_url
                    when = clock()
                    store.ingest(key, body, when, source_url=url, evidence_kind=kind)
                except (ValueError, OSError) as exc:
                    failures.append(key)
                    if body is None or not isinstance(exc, ValueError):
                        store.failed(key, when, type(exc).__name__,
                                     evidence_kind='recorded_fixture' if fixtures else 'official_download')
                    print(json.dumps({'metric': key, 'status': 'failed',
                                      'error_type': type(exc).__name__}), file=sys.stderr)
            manifest = publish(store, clock())
            return {'generation_id': manifest['generation_id'], 'failed_metrics': failures,
                    'manifest': str(Path(directory) / 'shadow' / 'current.json')}
        finally:
            store.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Collect official statistics into isolated shadow data')
    parser.add_argument('--data-dir', required=True, type=Path,
                        help='Private local directory outside production web roots')
    parser.add_argument('--fixtures-dir', type=Path, help='Offline replay; output explicitly labelled recorded_fixture')
    args = parser.parse_args(argv)
    directory = args.data_dir.resolve()
    project = Path(__file__).resolve().parents[2]
    forbidden = (project, project / 'public', project / 'dist')
    if directory == project or any(path == directory or path in directory.parents for path in forbidden[1:]):
        parser.error('Choose a private shadow data directory outside public/, dist/ and the project root')
    try:
        result = collect(directory, fixtures=args.fixtures_dir)
    except (OSError, RuntimeError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({'status': 'failed', 'error_type': type(exc).__name__}), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 1 if result['failed_metrics'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
