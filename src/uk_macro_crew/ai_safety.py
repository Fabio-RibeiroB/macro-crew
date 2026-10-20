"""Local admission controls for paid CLI jobs, independent of provider billing."""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
from functools import wraps
import json
import os
from pathlib import Path

from finstats.storage import atomic_write, encode


def bounded_int(name, default, maximum):
    value = int(os.environ.get(name, str(default)))
    if not 1 <= value <= maximum:
        raise ValueError(f'{name} must be between 1 and {maximum}')
    return value


@contextmanager
def admitted_run():
    # Fail closed before constructing agents or making any paid request.
    if os.environ.get('FINSTATS_AI_ENABLED', '').lower() != 'true':
        raise RuntimeError('AI jobs are disabled; explicitly set FINSTATS_AI_ENABLED=true')
    limit = bounded_int('FINSTATS_AI_DAILY_ATTEMPTS', 1, 4)
    directory = Path(os.environ.get('FINSTATS_AI_STATE_DIR',
                     str(Path.home() / '.local/state/finstats-ai'))).expanduser()
    project = Path(__file__).resolve().parents[2]
    resolved = directory.resolve()
    if (project == resolved or project in resolved.parents
            or any(p in {'public_html', 'www', 'htdocs'} for p in resolved.parts)):
        raise ValueError('AI state must be outside the repository and web roots')
    if directory.is_symlink():
        raise ValueError('AI state directory must not be a symlink')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
        raise ValueError('AI state must be owned by the job user with mode 0700')
    fd = os.open(directory / 'run.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError('Another AI job is already running') from exc
        ledger = directory / 'attempts.json'
        if ledger.is_symlink():
            raise ValueError('AI ledger must not be a symlink')
        day = datetime.now(timezone.utc).date().isoformat()
        previous = json.loads(ledger.read_text()) if ledger.exists() else {}
        count = previous.get('attempts', 0) if previous.get('day') == day else 0
        if type(count) is not int or count < 0:
            raise ValueError('Invalid AI admission ledger; operator review required')
        if count >= limit:
            raise RuntimeError('Daily AI attempt limit reached; statistics continue independently')
        # Charge attempts before execution, including failed/killed jobs. Never auto-refund.
        atomic_write(ledger, encode({'day': day, 'attempts': count + 1}))
        yield


def paid_job(function):
    @wraps(function)
    def guarded(*args, **kwargs):
        with admitted_run():
            return function(*args, **kwargs)
    return guarded
