"""Deliver only verified public JSON; private DB/raw evidence stay outside the web root."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit

from finstats.__main__ import collect
from finstats.sources import DEFINITIONS
from finstats.storage import atomic_write, encode

PUBLIC_FIELDS = (
    'collection_status', 'last_attempt_at', 'last_successful_check_at', 'evidence_kind',
    'validation_status', 'snapshot_id', 'source_receipt_id', 'source_published_date',
    'publication_time_precision', 'source_published_at', 'next_release_date',
    'release_status', 'retrieved_at', 'source_download_url', 'source_sha256',
    'parser_version', 'vintage_ordering', 'snapshot_evidence_kind',
)


def deliver(state_dir, output_dir):
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
        if metric['definition'] != asdict(definition):
            raise ValueError('Source definition mismatch')
        member = {name: metric[name] for name in PUBLIC_FIELDS if name in metric}
        member['definition'] = asdict(definition)
        if metric['validation_status'] == 'unavailable':
            member.update(latest=None, history=[])
        elif metric['validation_status'] == 'verified':
            if metric['snapshot_evidence_kind'] != 'official_download':
                raise ValueError('Recorded fixtures cannot become public official data')
            url = urlsplit(metric['source_download_url'])
            if url.scheme != 'https' or url.hostname != urlsplit(definition.download_url).hostname:
                raise ValueError('Unexpected official download URL')
            observations = metric['history']
            if not observations or observations[-1] != metric['latest'] or metric['latest']['value'] is None:
                raise ValueError('Card and history mismatch')
            last = metric['latest']['period']
            year = int(last[:4]) - 5
            cutoff = str(year) + last[4:]
            # Five-year browser window; all source observations/vintages stay in SQLite.
            history = [{field: o[field] for field in ('period', 'value', 'status')}
                       for o in observations if o['period'] >= cutoff]
            member.update(latest=history[-1], history=history, history_window='last_5_years')
            verified += 1
        else:
            raise ValueError('Unrecognised validation status')
        public['metrics'][key] = member
    if not verified:
        raise ValueError('No verified series: keep the previously published generation')
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
        manifest = deliver(state, output)
        for root in (state / 'shadow', output):
            prune_generations(root)
        print(json.dumps({'generation_id': manifest['generation_id'], 'failed_metrics': result['failed_metrics']}))
        return 1 if result['failed_metrics'] else 0
    except Exception as exc:
        # A failed DB/collection/export leaves the previous complete public manifest.
        print(json.dumps({'status': 'failed', 'error_type': type(exc).__name__}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
