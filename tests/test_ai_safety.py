from datetime import datetime, timezone
import json
import os

import pytest
from uk_macro_crew.ai_safety import admitted_run, paid_job
from uk_macro_crew.official_documents import fetch_official_text


@pytest.fixture
def ai_state(tmp_path, monkeypatch):
    path = tmp_path / 'private'
    monkeypatch.setenv('FINSTATS_AI_STATE_DIR', str(path))
    monkeypatch.setenv('FINSTATS_AI_ENABLED', 'true')
    monkeypatch.delenv('FINSTATS_AI_DAILY_ATTEMPTS', raising=False)
    return path


def test_disabled_job_never_executes(monkeypatch):
    monkeypatch.delenv('FINSTATS_AI_ENABLED', raising=False)
    calls = []
    with pytest.raises(RuntimeError, match='disabled'):
        paid_job(lambda: calls.append(True))()
    assert not calls


def test_failures_consume_attempt_and_overlapping_jobs_are_blocked(ai_state):
    with pytest.raises(ValueError, match='job failed'):
        with admitted_run():
            with pytest.raises(RuntimeError, match='already running'):
                with admitted_run():
                    pytest.fail('overlap admitted')
            raise ValueError('job failed')
    with pytest.raises(RuntimeError, match='Daily'):
        with admitted_run():
            pytest.fail('second attempt admitted')
    assert ai_state.stat().st_mode & 0o777 == 0o700
    assert (ai_state/'attempts.json').stat().st_mode & 0o777 == 0o600


def test_daily_reset_and_corruption_fail_closed(ai_state):
    ai_state.mkdir(mode=0o700)
    ledger = ai_state/'attempts.json'
    ledger.write_text(json.dumps({'day': '2000-01-01', 'attempts': 99}))
    with admitted_run(): pass
    assert json.loads(ledger.read_text())['attempts'] == 1
    ledger.write_text('{corrupt')
    with pytest.raises(ValueError):
        with admitted_run(): pytest.fail('corrupt ledger admitted')


def test_unsafe_state_and_symlinks_are_rejected(ai_state, monkeypatch, tmp_path):
    monkeypatch.setenv('FINSTATS_AI_STATE_DIR', str(tmp_path/'public_html'/'state'))
    with pytest.raises(ValueError, match='web roots'):
        with admitted_run(): pass
    ai_state.mkdir(mode=0o700)
    (tmp_path/'linked').symlink_to(ai_state)
    monkeypatch.setenv('FINSTATS_AI_STATE_DIR', str(tmp_path/'linked'))
    with pytest.raises(ValueError, match='symlink'):
        with admitted_run(): pass


@pytest.mark.parametrize('url', ['http://www.ons.gov.uk/a', 'https://127.0.0.1/a',
    'https://www.ons.gov.uk.attacker.example/a', 'file:///etc/passwd',
    'https://user:password@www.gov.uk/a', 'https://www.gov.uk:10000/a'])
def test_reader_rejects_untrusted_targets_before_network(url):
    with pytest.raises(ValueError): fetch_official_text(url)


def test_reader_rejects_redirect_and_bounds_text(monkeypatch):
    from email.message import Message
    from uk_macro_crew import official_documents as mod
    from types import SimpleNamespace
    headers=Message();headers['Content-Type']='text/html'
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, size): return b'<p>Evidence</p><script>malicious()</script>'
        @property
        def headers(self): return headers
    monkeypatch.setattr(mod,'build_opener',lambda *args: SimpleNamespace(open=lambda *args,**kwargs:Response()))
    result=fetch_official_text('https://www.ons.gov.uk/publication')
    assert 'Evidence' in result and 'malicious()' not in result
    with pytest.raises(ValueError,match='Redirect'):
        mod.NoRedirect().redirect_request(None,None,302,'',{},'https://127.0.0.1')
