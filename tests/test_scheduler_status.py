"""Public ai_status.json written by scheduler.py (all subprocess calls are mocked)."""
import json
import subprocess
from types import SimpleNamespace

import pytest

import scheduler

SECRET_TEXT = "sk-proj-SHOULDNEVERAPPEAR https://api.openai.com/v1/x Traceback File"


def _result(returncode=1, stderr="", stdout=""):
    return SimpleNamespace(returncode=returncode, stderr=stderr, stdout=stdout)


@pytest.mark.parametrize(
    "stderr, kind",
    [
        ("openai.RateLimitError: Error code: 429 - {'code': 'insufficient_quota'}", "credit"),
        ("You exceeded your current quota, please check your plan and billing details", "credit"),
        ("Exa API error: status code 402 payment required", "credit"),
        ("Exa: you are out of credits", "credit"),
        ("openai.AuthenticationError: Error code: 401 - invalid_api_key", "auth"),
        ("Incorrect API key provided", "auth"),
        ("openai.RateLimitError: Error code: 429 - Rate limit reached for gpt", "rate_limit"),
        ("httpx.ReadTimeout: the read operation timed out", "timeout"),
        ("ERROR: Failed to save JSON report: schema validation failed: x", "validation"),
        ("Daily AI attempt limit reached", "other"),
        ("something unexpected", "other"),
        ("", "other"),
    ],
)
def test_classify_failure_kinds(stderr, kind):
    assert scheduler.classify_failure(_result(stderr=stderr)) == kind


def test_classify_failure_timeout_flag_stdout_and_bare_numbers():
    assert scheduler.classify_failure(timed_out=True) == "timeout"
    assert scheduler.classify_failure(_result(stdout="insufficient_quota")) == "credit"
    assert scheduler.classify_failure(_result(stderr="processed 4010 and 4020 rows")) == "other"


@pytest.fixture
def env(tmp_path, monkeypatch):
    dist, public = tmp_path / "dist", tmp_path / "public"
    dist.mkdir()
    public.mkdir()
    for name in ("research_report.json", "history_report.json"):
        (tmp_path / name).write_text("{}")
    monkeypatch.setattr(scheduler, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(scheduler, "REPORT_FILE", tmp_path / "research_report.json")
    monkeypatch.setattr(scheduler, "HISTORY_FILE", tmp_path / "history_report.json")
    monkeypatch.setattr(scheduler, "DIST_DIR", dist)
    monkeypatch.setattr(scheduler, "PUBLIC_DIR", public)
    monkeypatch.setattr(scheduler, "setup_logging", lambda: None)
    monkeypatch.setattr(scheduler, "load_report", lambda: {})
    monkeypatch.setattr(scheduler, "MAX_CREW_ATTEMPTS", 1)
    monkeypatch.setattr(
        scheduler,
        "enrich_with_official_dates",
        lambda d: {"x": {"current_date": "", "next_publication_date": "2000-01-01"}},
    )
    return SimpleNamespace(dist=dist, public=public)


def _status(env, where="public"):
    return json.loads((getattr(env, where) / "ai_status.json").read_text())


def _run(monkeypatch, outcome):
    def fake(*args, **kwargs):
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr(scheduler.subprocess, "run", fake)
    try:
        scheduler.cmd_run(None)
    except SystemExit:
        pass


def test_success_writes_ok_status_to_dist_and_public(env, monkeypatch):
    _run(monkeypatch, _result(0, stdout="done"))
    for where in ("dist", "public"):
        status = _status(env, where)
        assert status["schema_version"] == 1
        assert status["outcome"] == "ok"
        assert status["failure_kind"] is None
        assert status["last_success_at"] == status["last_attempt_at"]
        assert status["last_attempt_at"].endswith("Z")
    assert not list(env.public.glob(".ai_status.*"))


@pytest.mark.parametrize(
    "stderr, kind",
    [
        ("insufficient_quota", "credit"),
        ("Error code: 401 invalid_api_key", "auth"),
        ("RateLimitError 429 rate limit", "rate_limit"),
        ("schema validation failed", "validation"),
        ("weird", "other"),
    ],
)
def test_failed_crew_writes_failed_status_without_raw_text(env, monkeypatch, stderr, kind):
    _run(monkeypatch, _result(1, f"{stderr} {SECRET_TEXT}", SECRET_TEXT))
    status = _status(env)
    assert status["outcome"] == "failed"
    assert status["failure_kind"] == kind
    assert set(status) == {"schema_version", "last_attempt_at", "outcome", "failure_kind", "last_success_at"}
    raw = (env.public / "ai_status.json").read_text()
    assert "sk-proj" not in raw and "http" not in raw and "Traceback" not in raw


def test_timeout_and_launch_errors_are_recorded(env, monkeypatch):
    _run(monkeypatch, subprocess.TimeoutExpired(cmd="x", timeout=1))
    assert _status(env)["failure_kind"] == "timeout"
    _run(monkeypatch, FileNotFoundError("uv"))
    assert _status(env)["failure_kind"] == "other"


def test_failure_keeps_last_success_and_later_success_replaces_it(env, monkeypatch):
    monkeypatch.setattr(scheduler, "_utc_now", lambda: "2026-11-10T17:00:00Z")
    _run(monkeypatch, _result(0))
    monkeypatch.setattr(scheduler, "_utc_now", lambda: "2026-11-11T17:00:00Z")
    _run(monkeypatch, _result(1, "insufficient_quota"))
    status = _status(env)
    assert status["last_attempt_at"] == "2026-11-11T17:00:00Z"
    assert status["last_success_at"] == "2026-11-10T17:00:00Z"
    monkeypatch.setattr(scheduler, "_utc_now", lambda: "2026-11-12T17:00:00Z")
    _run(monkeypatch, _result(0))
    assert _status(env)["last_success_at"] == "2026-11-12T17:00:00Z"


def test_no_publications_due_leaves_status_untouched(env, monkeypatch):
    (env.public / "ai_status.json").write_text('{"keep": true}')
    monkeypatch.setattr(scheduler, "enrich_with_official_dates", lambda d: {})
    monkeypatch.setattr(scheduler, "should_force_weekly_refresh", lambda d: False)
    monkeypatch.setattr(scheduler, "is_snapshot_stale", lambda r, d: False)
    monkeypatch.setattr(scheduler.subprocess, "run", lambda *a, **k: pytest.fail("crew must not run"))
    scheduler.cmd_run(None)
    assert json.loads((env.public / "ai_status.json").read_text()) == {"keep": True}
    assert not (env.dist / "ai_status.json").exists()


def test_status_write_failure_in_one_directory_does_not_raise(env):
    status = scheduler.write_ai_status(
        "failed", "credit", now="2026-11-11T17:00:00Z", dest_dirs=[env.public / "missing", env.dist]
    )
    assert status["failure_kind"] == "credit"
    assert (env.dist / "ai_status.json").exists()
