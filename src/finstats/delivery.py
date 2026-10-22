"""Deliver only verified public JSON; private DB/raw evidence stay outside the web root."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit

from finstats.__main__ import collect
from finstats.sources import DEFINITIONS, UNEMPLOYMENT_QUALITY, public_definition
from finstats.storage import atomic_write, encode
from finstats.events import public_events, prune_event_generations

PUBLIC_FIELDS = (
    'collection_status', 'last_attempt_at', 'last_successful_check_at', 'evidence_kind',
    'validation_status', 'snapshot_id', 'source_receipt_id', 'source_published_date',
    'publication_time_precision', 'source_published_at', 'next_release_date',
    'release_status', 'retrieved_at', 'source_download_url', 'source_sha256',
    'parser_version', 'vintage_ordering', 'snapshot_evidence_kind',
    'quality_note', 'quality_source_url', 'upcoming_period',
)


def deliver(state_dir, output_dir, event_failure_sink=None, event_unqualified_sink=None):
    state = Path(state_dir).resolve()
    output = Path(output_dir).resolve()
    if state == output or state in output.parents or output in state.parents:
        raise ValueError('Public output and private state directories must be separate')
    source = state / 'shadow'
    manifest = json.loads((source / 'current.json').read_text())
    generation = manifest['generation_id']
    if not re.fullmatch('[a-f0-9]{32}', generation):
        raise ValueError('Invalid generation identity')
    relative = f'generations/{generation}/data.json'
    if manifest['data_url'] != relative:
        raise ValueError('Unexpected generation path')
    body = (source / relative).read_bytes()
    if hashlib.sha256(body).hexdigest() != manifest['sha256']:
        raise ValueError('Source generation integrity check failed')
    data = json.loads(body)
    if data['schema_version'] != 1 or data['generation_id'] != generation:
        raise ValueError('Mismatched source generation')
    public = {'schema_version': 1, 'generation_id': generation,
              'published_at': data['published_at'], 'mode': 'official', 'metrics': {}}
    verified = 0
    for key, definition in DEFINITIONS.items():
        metric = data['metrics'][key]
        if metric['definition'] != public_definition(key):
            raise ValueError('Source definition mismatch')
        if key == 'unemployment' and metric['validation_status'] == 'verified' and any(
                metric.get(field) != expected for field, expected in UNEMPLOYMENT_QUALITY.items()):
            raise ValueError('Unemployment quality evidence mismatch')
        member = {name: metric[name] for name in PUBLIC_FIELDS if name in metric}
        member['definition'] = public_definition(key)
        if metric['validation_status'] == 'unavailable':
            member.update(latest=None, history=[])
        elif metric['validation_status'] == 'verified':
            if metric['snapshot_evidence_kind'] != 'official_download':
                raise ValueError('Recorded fixtures cannot become public official data')
            url = urlsplit(metric['source_download_url'])
            approved_host = url.hostname == urlsplit(definition.download_url).hostname
            approved_host |= key.startswith('house_price_') and url.hostname == 'publicdata.landregistry.gov.uk'
            approved_host |= key in {'petrol_price', 'diesel_price'} and url.hostname == 'assets.publishing.service.gov.uk'
            approved_host |= key.startswith('gilt_') and url.hostname == 'www.bankofengland.co.uk'
            approved_host |= key == 'household_energy' and url.hostname == 'www.ofgem.gov.uk'
            if url.scheme != 'https' or not approved_host:
                raise ValueError('Unexpected official download URL')
            if key.startswith('gilt_') and metric['source_download_url'] != definition.download_url:
                raise ValueError('Unexpected BoE gilt download URL')
            if key == 'household_energy' and metric['source_download_url'] != definition.download_url:
                raise ValueError('Unexpected Ofgem source page URL')
            if key.startswith('private_rent_') and not re.fullmatch(
                    r'/file\?uri=(?:%2F|/)economy(?:%2F|/)inflationandpriceindices(?:%2F|/)datasets(?:%2F|/)priceindexofprivaterentsukmonthlypricestatistics(?:%2F|/)[0-9]{1,2}[a-z]+[0-9]{4}(?:%2F|/)priceindexofprivaterentsukmonthlypricestatistics\.xlsx',
                    url.path + ('?' + url.query if url.query else '')):
                raise ValueError('Unexpected PIPR workbook edition URL')
            if key.startswith('house_price_') and not re.fullmatch(
                    r'/market-trend-data/house-price-index-data/Average-prices-[0-9]{4}-[0-9]{2}\.csv', url.path):
                raise ValueError('Unexpected UK HPI source CSV URL')
            if key in {'petrol_price', 'diesel_price'} and (
                    url.hostname != 'assets.publishing.service.gov.uk' or
                    not re.fullmatch(r'/media/[a-f0-9]+/CSV__2018_-__\.csv', url.path)):
                raise ValueError('Unexpected DESNZ weekly fuel CSV URL')
            if key in {'petrol_price', 'diesel_price'} and (
                    metric['source_published_date'] is None or
                    metric['source_published_date'] > metric['retrieved_at'][:10]):
                raise ValueError('Missing or future DESNZ source publication date')
            if key.startswith('house_price_') and (metric['source_published_date'] is None or metric['source_published_date'] > metric['retrieved_at'][:10]):
                raise ValueError('Missing or future UK HPI source release date')
            observations = metric['history']
            if not observations or observations[-1] != metric['latest'] or metric['latest']['value'] is None:
                raise ValueError('Card and history mismatch')
            last = metric['latest']['period']
            year = int(last[:4]) - 5
            cutoff = str(year) + last[4:]
            # Five-year browser window; all source observations/vintages stay in SQLite.
            history = [{field: o[field] for field in ('period', 'value', 'status')}
                       | ({'reference': o['reference']} if o.get('reference') else {})
                       for o in observations if o['period'] >= cutoff]
            member.update(latest=history[-1], history=history, history_window='last_5_years')
            verified += 1
        else:
            raise ValueError('Unrecognised validation status')
        public['metrics'][key] = member
    if not verified:
        raise ValueError('No verified series: keep the previously published generation')
    # Event failures are isolated from the metrics publication path. The old
    # event manifest remains active unless its immutable replacement is complete.
    event_failures = event_failure_sink if event_failure_sink is not None else []
    try:
        events = public_events(state)
        if events is not None and event_unqualified_sink is not None:
            event_unqualified_sink.extend(name for name,provider in events['providers'].items()
                                          if provider.get('status')=='unqualified')
    except Exception as exc:
        events = None
        event_failures.append('event_validation')
    output.mkdir(parents=True, exist_ok=True, mode=0o755)
    for directory in (output, output / 'generations', output / 'generations' / generation):
        directory.mkdir(exist_ok=True)
        directory.chmod(0o755)
    public_body = encode(public)
    # Set readable permissions before atomic activation; private writes stay 0600.
    atomic_write(output / relative, public_body, mode=0o644)
    public_manifest = {'schema_version': 1, 'generation_id': generation,
                       'published_at': public['published_at'], 'data_url': relative,
                       'sha256': hashlib.sha256(public_body).hexdigest()}
    # Events use a parallel additive manifest so the strict metric reader and its
    # checksummed generation contract remain unchanged until the UI adopts v1.
    if events is not None:
        try:
            event_body = encode(events)
            event_hash = hashlib.sha256(event_body).hexdigest()
            event_url = f'event-generations/{event_hash}.json'
            event_root = output / 'event-generations'
            event_root.mkdir(exist_ok=True, mode=0o755)
            event_root.chmod(0o755)
            atomic_write(event_root / f'{event_hash}.json', event_body, mode=0o644)
            atomic_write(output / 'events-manifest.json', encode({
                'schema_version': 1, 'mode': 'official', 'data_url': event_url,
                'sha256': event_hash,
            }), mode=0o644)
        except Exception as exc:
            event_failures.append('event_publication')
    atomic_write(output / 'current.json', encode(public_manifest), mode=0o644)
    return public_manifest



def prune_generations(root, retain_days=14):
    """Bound disposable exports; never remove source evidence or active data."""
    root = Path(root)
    manifest = json.loads((root / 'current.json').read_text())
    active = manifest['generation_id']
    cutoff = time.time() - retain_days * 86400
    for directory in (root / 'generations').iterdir():
        if (directory.is_symlink() or not directory.is_dir()
                or not re.fullmatch('[a-f0-9]{32}', directory.name) or directory.name == active):
            continue
        payload = directory / 'data.json'
        # Unexpected files require operator review, never recursive deletion.
        if payload.is_symlink() or set(directory.iterdir()) != {payload}:
            continue
        if payload.stat().st_mtime < cutoff:
            payload.unlink()
            directory.rmdir()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Collect and deliver official public statistics')
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--export-only', action='store_true', help='Deliver an already collected generation')
    args = parser.parse_args(argv)
    try:
        # Reject unsafe output before collection mutates state.
        state, output = args.state_dir.resolve(), args.output_dir.resolve()
        if state == output or state in output.parents or output in state.parents:
            raise ValueError('Private state and public output must be separate')
        result = {'failed_metrics': []} if args.export_only else collect(state)
        event_failures, unqualified_events = [], []
        manifest = deliver(state, output, event_failures, unqualified_events)
        for root in (state / 'shadow', output):
            prune_generations(root)
        prune_event_generations(output)
        failures = list(result.get('failed_event_sources', [])) + event_failures
        unqualified_events = list(result.get('unqualified_event_sources', [])) + unqualified_events
        print(json.dumps({'generation_id': manifest['generation_id'], 'failed_metrics': result['failed_metrics'],
                          'failed_event_sources': failures,'unqualified_event_sources':unqualified_events}))
        return 1 if result['failed_metrics'] or failures or unqualified_events else 0
    except Exception as exc:
        # A failed DB/collection/export leaves the previous complete public manifest.
        print(json.dumps({'status': 'failed', 'error_type': type(exc).__name__}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
