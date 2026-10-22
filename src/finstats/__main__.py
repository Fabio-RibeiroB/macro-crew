"""Explicit shadow-only CLI. Never writes the legacy production report files."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
from http.client import HTTPException
import json
from pathlib import Path
import sqlite3
import sys

from finstats.publication import publish
from finstats.events import collect_events
from finstats.sources import DEFINITIONS, FUEL_SOURCE_URL, fetch, fixture_file, parse_fuel_release_page, recorded_hpi_release_evidence
from finstats.storage import Store, timestamp, utc_now


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


def collect(directory, transport=fetch, clock=utc_now, fixtures=None, event_collector=collect_events):
    failures = []
    shared_downloads = {}
    with collector_lock(Path(directory)):
        store = Store(directory)
        try:
            for key in DEFINITIONS:
                body = None
                when = clock()
                release_page_evidence = None
                try:
                    if fixtures:
                        body = (Path(fixtures) / fixture_file(key)).read_bytes()
                        kind = 'recorded_fixture'
                        url = f'fixture:{fixture_file(key)}'
                        source_published_date = None
                        if key.startswith('house_price_'):
                            receipt = json.loads((Path(fixtures) / 'receipts.json').read_text()).get(fixture_file(key), {})
                            source_published_date = receipt.get('source_published_date')
                            url = receipt.get('originalURL', url)
                            if source_published_date:
                                release_page_evidence = recorded_hpi_release_evidence(
                                    url, source_published_date, timestamp(when))
                        if key in {'petrol_price', 'diesel_price'}:
                            page_body = (Path(fixtures) / 'desnz_weekly_road_fuel_prices_release_2026-10-20.html').read_bytes()
                            source_published_date, url = parse_fuel_release_page(page_body)
                            release_page_evidence = {
                                'body': page_body, 'url': FUEL_SOURCE_URL,
                                'retrieved_at': timestamp(when), 'evidence_kind': 'recorded_fixture',
                            }
                    else:
                        if transport is fetch and key.startswith('private_rent_'):
                            fetched = shared_downloads.get('pipr')
                            if isinstance(fetched, Exception):
                                raise fetched
                            if fetched is None:
                                try:
                                    fetched = transport(key)
                                except (ValueError, OSError, HTTPException, sqlite3.Error) as exc:
                                    shared_downloads['pipr'] = exc
                                    raise
                                shared_downloads['pipr'] = fetched
                        elif transport is fetch and (key.startswith('house_price_') or key in {'petrol_price', 'diesel_price'} or key.startswith('gilt_')):
                            if key in {'petrol_price', 'diesel_price'}:
                                cache_key = 'fuel'
                            elif key.startswith('house_price_'):
                                cache_key = 'hpi'
                            else:
                                cache_key = 'gilt_yields'
                            fetched = shared_downloads.get(cache_key)
                            if isinstance(fetched, Exception):
                                raise fetched
                            if fetched is None:
                                try:
                                    fetched = transport(key)
                                except (ValueError, OSError, HTTPException, sqlite3.Error) as exc:
                                    shared_downloads[cache_key] = exc
                                    raise
                                shared_downloads[cache_key] = fetched
                        else:
                            fetched = transport(key)
                        if isinstance(fetched, tuple):
                            body, url, *metadata = fetched
                            source_published_date = metadata[0] if metadata else None
                            release_page_evidence = metadata[1] if len(metadata) > 1 else None
                        else:
                            body, url = fetched, DEFINITIONS[key].download_url
                            source_published_date = None
                        kind = 'official_download'
                    when = clock()
                    store.ingest(key, body, when, source_url=url, evidence_kind=kind,
                                 source_published_date=source_published_date,
                                 release_page_evidence=release_page_evidence)
                except (ValueError, OSError, HTTPException, sqlite3.Error) as exc:
                    failures.append(key)
                    if isinstance(exc, sqlite3.Error):
                        # A failed statement must not leak a transaction into
                        # another metric. If rollback or failure recording also
                        # fails, the shared store is unusable: stop before export.
                        store.db.rollback()
                    if body is None or not isinstance(exc, ValueError):
                        store.failed(key, when, type(exc).__name__,
                                     evidence_kind='recorded_fixture' if fixtures else 'official_download')
                    print(json.dumps({'metric': key, 'status': 'failed',
                                      'error_type': type(exc).__name__}), file=sys.stderr)
            manifest = publish(store, clock())
            try:
                event_result = (event_collector(directory, clock=clock)
                                if fixtures is None and (transport is fetch or event_collector is not collect_events)
                                else {'failed_sources': []})
                event_failures = event_result.get('failed_sources', [])
                unqualified_events = event_result.get('unqualified_sources', [])
            except Exception as exc:
                # Event-state damage must not interrupt verified metric publication.
                event_failures = ['event_state']
                unqualified_events = []
                print(json.dumps({'event_status': 'failed',
                                  'error_type': type(exc).__name__}), file=sys.stderr)
            return {'generation_id': manifest['generation_id'], 'failed_metrics': failures,
                    'failed_event_sources': event_failures,
                    'unqualified_event_sources': unqualified_events,
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
    if directory == project or project in directory.parents:
        parser.error('Choose a private shadow data directory outside the project tree')
    try:
        result = collect(directory, fixtures=args.fixtures_dir)
    except (OSError, RuntimeError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({'status': 'failed', 'error_type': type(exc).__name__}), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 1 if (result['failed_metrics'] or result.get('failed_event_sources')
                 or result.get('unqualified_event_sources')) else 0


if __name__ == '__main__':
    raise SystemExit(main())
