import json
import time

import pytest

from finstats import summary_worker as worker


URL = "https://www.ons.gov.uk/releases/example"


def bundle(value="2.5", period="2026-08"):
    return {
        "evidence_kind": "official_download",
        "release": {"source": "ons", "id": "ons:example", "published_date": "2026-09-15",
                    "source_url": URL},
        "metrics": {"cpi_inflation": {
            "definition": {"unit": "percent", "title": "CPI inflation", "comparison": "year_on_year"},
            "reference_window": "year_on_year",
            "source_url": URL,
            "observations": [{"period": period, "value": value}],
            "previous_observations": [{"period": "2026-07", "value": "2.4"}],
            "revisions": [],
        }},
        "official_text": {"text": "Inflation release", "source_url": URL},
    }


def setup_worker(tmp_path, monkeypatch, candidate):
    state = tmp_path / "private-state"
    output = tmp_path / "public"
    (output).mkdir(mode=0o755)
    monkeypatch.setenv("FINSTATS_AI_ENABLED", "true")
    monkeypatch.setenv("FINSTATS_AI_STATE_DIR", str(state))
    monkeypatch.setenv("FINSTATS_AI_DAILY_ATTEMPTS", "4")
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {
                            "candidates": [] if candidate["evidence_identity"] in seen_identities else [candidate],
                            "unsupported": [{"reason": "meeting_date_only"}],
                        })
    return state, output


def make_candidate(identity="a" * 64, value="2.5", period="2026-08"):
    return {"evidence_identity": identity, "evidence": bundle(value, period)}


def claim(value="2.5", period="2026-08", **overrides):
    result = {"metric_key": "cpi_inflation", "unit": "percent", "period": period,
              "reference_window": "year_on_year", "value": value,
              "previous_value": None, "provenance": "current_observation"}
    result.update(overrides)
    return result


def answer(*claims, citations=None, **extra):
    result = {"claims": list(claims), "citations": [URL] if citations is None else citations}
    result.update(extra)
    return result


def association_bundle():
    evidence = bundle()
    evidence["metrics"].update({
        "unemployment": {
            "definition": {"unit": "percent", "title": "Unemployment rate", "comparison": "three_month_average"},
            "reference_window": "three_month_average", "source_url": URL,
            "observations": [{"period": "2026-08", "value": "4.8"}],
            "previous_observations": [{"period": "2026-07", "value": "4.7"}],
            "revisions": [],
        },
        "regular_pay_nominal_growth": {
            "definition": {"unit": "percent", "title": "Regular pay growth", "comparison": "three_month_average"},
            "reference_window": "three_month_average", "source_url": URL,
            "observations": [{"period": "2026-08", "value": "3.7"}],
            "previous_observations": [{"period": "2026-07", "value": "3.6"}],
            "revisions": [],
        },
        "household_energy": {
            "definition": {"unit": "GBP_per_year", "title": "Annual energy bill", "comparison": "previous_comparable_period"},
            "reference_window": "previous_comparable_period", "source_url": URL,
            "observations": [{"period": "2026-Q3", "value": "1755"}],
            "previous_observations": [{"period": "2026-Q2", "value": "1690"}],
            "revisions": [],
        },
    })
    return evidence


def invoke(output, state, infer=None, **kwargs):
    return worker.process_summaries(object(), state_dir=state, output_dir=output,
                                    infer=infer, enabled=kwargs.pop("enabled", True), **kwargs)


def test_disabled_and_harmless_refetch_make_no_inference_call(tmp_path, monkeypatch):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    calls = []
    assert invoke(output, state, lambda _: calls.append(True), enabled=False)["status"] == "disabled"
    monkeypatch.delenv("FINSTATS_AI_ENABLED")
    assert invoke(output, state, lambda _: calls.append(True))["status"] == "disabled"
    assert not calls
    assert not (output / "summary-manifest.json").exists()


def test_fixture_evidence_never_reaches_inference(tmp_path, monkeypatch):
    candidate = make_candidate()
    candidate["evidence"]["evidence_kind"] = "recorded_fixture"
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    result = invoke(output, state, lambda _: pytest.fail("fixture must be rejected"))
    assert result["reason"] == "fixture_evidence"
    assert not (output / "summary-manifest.json").exists()


def test_valid_summary_is_immutable_and_refetch_is_deduplicated(tmp_path, monkeypatch):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    calls = []
    result = invoke(output, state, lambda evidence: calls.append(evidence) or answer(claim()))
    assert result["status"] == "published"
    manifest = json.loads((output / "summary-manifest.json").read_text())
    assert manifest["summaries"]["ons:ons:example"]["reference_periods"] == ["2026-08"]
    version = output / manifest["summaries"]["ons:ons:example"]["version"]
    before = version.read_bytes()
    assert invoke(output, state, lambda _: pytest.fail("duplicate release called inference"))["status"] == "current"
    assert version.read_bytes() == before
    assert len(calls) == 1


@pytest.mark.parametrize("response", [
    answer(claim(value="99")),
    answer(claim(period="2026-99")),
    answer(claim(), citations=["https://evil.example/x"]),
    answer(claim(), extra=1),
])
def test_malformed_numbers_periods_and_citations_fail_closed(tmp_path, monkeypatch, response):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    result = invoke(output, state, lambda _: response)
    assert result["status"] == "stale"
    assert result["reason"] == "invalid_summary"
    assert not (output / "summary-manifest.json").exists()
    assert json.loads((output / "summary-status.json").read_text())["status"] == "stale"


def test_claim_values_are_bound_to_metric_unit_period_and_reference_window():
    evidence = association_bundle()
    mixed = answer(
        claim(metric_key="regular_pay_nominal_growth", value="3.7",
              reference_window="three_month_average"),
        claim(metric_key="unemployment", unit="percent", value="4.8",
              reference_window="three_month_average"),
        claim(metric_key="household_energy", unit="GBP_per_year", period="2026-Q3",
              reference_window="previous_comparable_period", value="1755"),
    )
    rendered = worker.validate_summary(mixed, evidence)["summary"]
    assert "Regular pay nominal growth (2026-08; three_month_average): 3.7 %" in rendered
    assert "Unemployment (2026-08; three_month_average): 4.8 %" in rendered
    assert "Household energy (2026-Q3; previous_comparable_period): 1755 GBP/year" in rendered

    with pytest.raises(ValueError, match="does not match"):
        worker.validate_summary(answer(claim(metric_key="unemployment", value="3.7",
                                             reference_window="three_month_average")), evidence)
    with pytest.raises(ValueError, match="does not match"):
        worker.validate_summary(answer(claim(metric_key="household_energy", unit="percent",
                                             period="2026-Q3", reference_window="previous_comparable_period",
                                             value="1755")), evidence)
    with pytest.raises(ValueError, match="does not match"):
        worker.validate_summary(answer(claim(metric_key="unemployment", value="4.8",
                                             period="2026-07", reference_window="three_month_average")), evidence)
    with pytest.raises(ValueError, match="does not match"):
        worker.validate_summary(answer(claim(metric_key="unemployment", value="4.8",
                                             reference_window="year_on_year")), evidence)


def test_revision_claim_provenance_is_distinct_from_current_or_previous_observation():
    evidence = bundle()
    evidence["metrics"]["cpi_inflation"]["revisions"] = [
        {"period": "2026-07", "previous": "2.3", "current": "2.4"}
    ]
    revision = claim(value="2.4", period="2026-07", provenance="revision", previous_value="2.3")
    rendered = worker.validate_summary(answer(revision), evidence)["summary"]
    assert "was revised from 2.3 to 2.4 %" in rendered
    wrong_new_observation = claim(value="2.4", period="2026-07", provenance="current_observation")
    with pytest.raises(ValueError, match="does not match"):
        worker.validate_summary(answer(wrong_new_observation), evidence)


def test_model_cannot_supply_unvalidated_numeric_prose():
    with pytest.raises(ValueError, match="exactly claims and citations"):
        worker.validate_summary({**answer(claim()), "summary": "Unemployment was 3.7%."}, bundle())


def test_admission_is_charged_once_and_disabled_budget_does_not_break_metrics(tmp_path, monkeypatch):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    monkeypatch.setenv("FINSTATS_AI_DAILY_ATTEMPTS", "1")
    first = invoke(output, state, lambda _: answer(claim()))
    assert first["status"] == "published"
    correction = make_candidate("b" * 64, "2.7", "2026-09")
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {"candidates": [correction]})
    failed = invoke(output, state, lambda _: pytest.fail("daily admission limit bypassed"))
    assert failed == {"status": "stale", "processed": 0, "reason": "admission_or_lock"}
    manifest = json.loads((output / "summary-manifest.json").read_text())
    assert manifest["summaries"]["ons:ons:example"]["reference_periods"] == ["2026-08"]


def test_timeout_and_lock_never_replace_true_prior_period(tmp_path, monkeypatch):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    invoke(output, state, lambda _: answer(claim()))
    previous = (output / "summary-manifest.json").read_bytes()
    correction = make_candidate("c" * 64, "2.7", "2026-09")
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {"candidates": [correction]})
    timed = invoke(output, state, lambda _: time.sleep(2), timeout_seconds=1)
    assert timed["reason"] == "timeout"
    assert (output / "summary-manifest.json").read_bytes() == previous
    with worker._worker_lock(state):
        locked = invoke(output, state, lambda _: pytest.fail("lock should prevent inference"))
    assert locked["reason"] == "admission_or_lock"
    assert (output / "summary-manifest.json").read_bytes() == previous


def test_correction_gets_new_version_and_failed_correction_preserves_manifest(tmp_path, monkeypatch):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    valid = answer(claim())
    invoke(output, state, lambda _: valid)
    old_manifest = json.loads((output / "summary-manifest.json").read_text())
    correction = make_candidate("d" * 64, "2.7", "2026-09")
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {"candidates": [correction]})
    invalid = invoke(output, state, lambda _: valid)
    assert invalid["reason"] == "invalid_summary"
    assert json.loads((output / "summary-manifest.json").read_text()) == old_manifest
    corrected = invoke(output, state, lambda _: answer(claim(value="2.7", period="2026-09")))
    assert corrected["status"] == "published"
    new_manifest = json.loads((output / "summary-manifest.json").read_text())
    assert new_manifest["summaries"]["ons:ons:example"]["reference_periods"] == ["2026-09"]
    assert len(list((output / "summary-versions").rglob("*.json"))) == 2


def test_manifest_failure_recovers_staged_version_without_new_inference(tmp_path, monkeypatch):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    ticks = iter([f"2026-10-23T01:03:{second:02d}Z" for second in range(20)])
    monkeypatch.setattr(worker, "_now", lambda: next(ticks))
    invoke(output, state, lambda _: answer(claim()))
    previous = (output / "summary-manifest.json").read_bytes()
    correction = make_candidate("e" * 64, "2.7", "2026-09")
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {"candidates": [correction]})
    atomic_write = worker.atomic_write
    def fail_manifest(path, body, mode=0o600):
        if path.name == "summary-manifest.json":
            raise OSError("injected replacement failure")
        atomic_write(path, body, mode)
    monkeypatch.setattr(worker, "atomic_write", fail_manifest)
    calls = []
    result = invoke(output, state, lambda _: calls.append(True) or answer(claim(value="2.7", period="2026-09")))
    assert result["status"] == "stale"
    assert (output / "summary-manifest.json").read_bytes() == previous
    charged_before_recovery = json.loads((state / "attempts.json").read_text())["attempts"]
    version_path = output / "summary-versions" / __import__("hashlib").sha256(
        b"ons:ons:example").hexdigest() / f"2026-09-15-{'e' * 64}.json"
    staged_bytes = version_path.read_bytes()
    staged_generated_at = json.loads(staged_bytes)["generated_at"]
    assert staged_generated_at == "2026-10-23T01:03:02Z"
    retry_generated_at = "2026-10-23T01:03:04Z"
    assert retry_generated_at != staged_generated_at
    monkeypatch.setattr(worker, "atomic_write", atomic_write)
    retried = invoke(output, state, lambda _: calls.append(True) or answer(claim(value="2.7", period="2026-09")))
    assert retried["status"] == "published"
    assert retried["recovered"] is True
    assert len(calls) == 1
    assert json.loads((state / "attempts.json").read_text())["attempts"] == charged_before_recovery
    assert version_path.read_bytes() == staged_bytes
    assert json.loads((output / "summary-manifest.json").read_text())[
        "summaries"]["ons:ons:example"]["generated_at"] == staged_generated_at


def test_activated_manifest_reconciles_missing_seen_identity_without_inference(tmp_path, monkeypatch):
    original = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, original)
    invoke(output, state, lambda _: answer(claim()))
    prior = (output / "summary-manifest.json").read_bytes()
    correction = make_candidate("f" * 64, "2.7", "2026-09")
    calls = []
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {
                            "candidates": [] if correction["evidence_identity"] in seen_identities else [correction]
                        })
    atomic_write = worker.atomic_write
    def fail_seen(path, body, mode=0o600):
        if path.name == "summary-identities.json":
            raise OSError("injected identity ledger failure")
        atomic_write(path, body, mode)
    monkeypatch.setattr(worker, "atomic_write", fail_seen)
    first = invoke(output, state, lambda _: calls.append(True) or answer(claim(value="2.7", period="2026-09")))
    assert first == {"status": "published", "processed": 1,
                     "reason": "identity_reconciliation_pending"}
    committed_manifest = (output / "summary-manifest.json").read_bytes()
    assert committed_manifest != prior
    charged_before_reconciliation = json.loads((state / "attempts.json").read_text())["attempts"]
    monkeypatch.setattr(worker, "atomic_write", atomic_write)
    second = invoke(output, state, lambda _: pytest.fail("activated identity must reconcile without inference"))
    assert second["status"] == "current"
    assert len(calls) == 1
    assert json.loads((state / "attempts.json").read_text())["attempts"] == charged_before_reconciliation
    assert (output / "summary-manifest.json").read_bytes() == committed_manifest
    assert correction["evidence_identity"] in json.loads(
        (state / "summary-identities.json").read_text())["identities"]


def test_manifest_rollback_reactivates_processed_version_without_attempt_or_inference(tmp_path, monkeypatch):
    original = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, original)
    invoke(output, state, lambda _: answer(claim()))
    original_manifest = (output / "summary-manifest.json").read_bytes()
    correction = make_candidate("9" * 64, "2.7", "2026-09")
    calls = []
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {
                            "candidates": [] if correction["evidence_identity"] in seen_identities else [correction]
                        })
    corrected = invoke(output, state, lambda _: calls.append(True) or answer(
        claim(value="2.7", period="2026-09")))
    assert corrected["status"] == "published"
    corrected_manifest = (output / "summary-manifest.json").read_bytes()
    manifest_entry = json.loads(corrected_manifest)["summaries"]["ons:ons:example"]
    version_path = output / manifest_entry["version"]
    version_bytes = version_path.read_bytes()
    attempts_before = json.loads((state / "attempts.json").read_text())["attempts"]
    assert calls == [True]

    # Simulate operator rollback of only the public pointer; private ledger and
    # immutable correction version remain intact.
    (output / "summary-manifest.json").write_bytes(original_manifest)
    recovered = invoke(output, state, lambda _: pytest.fail("rollback recovery must not infer"), enabled=False)
    assert recovered["status"] == "published" and recovered["recovered"] is True
    assert (output / "summary-manifest.json").read_bytes() == corrected_manifest
    assert version_path.read_bytes() == version_bytes
    assert json.loads((state / "attempts.json").read_text())["attempts"] == attempts_before


@pytest.mark.parametrize("damage", ["missing", "corrupt"])
def test_processed_ledger_with_missing_or_corrupt_version_fails_for_operator(tmp_path, monkeypatch, damage):
    candidate = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, candidate)
    invoke(output, state, lambda _: answer(claim()))
    entry = json.loads((output / "summary-manifest.json").read_text())[
        "summaries"]["ons:ons:example"]
    version = output / entry["version"]
    if damage == "missing":
        version.unlink()
    else:
        version.write_text("{corrupt")
    attempts_before = json.loads((state / "attempts.json").read_text())["attempts"]
    result = invoke(output, state, lambda _: pytest.fail("corrupt processed version must not call inference"))
    assert result["reason"] == "operator_review_required"
    assert json.loads((output / "summary-status.json").read_text())["reason"] == "operator_review_required"
    assert json.loads((state / "attempts.json").read_text())["attempts"] == attempts_before


def test_version_write_failure_preserves_prior_manifest(tmp_path, monkeypatch):
    original = make_candidate()
    state, output = setup_worker(tmp_path, monkeypatch, original)
    invoke(output, state, lambda _: answer(claim()))
    previous = (output / "summary-manifest.json").read_bytes()
    correction = make_candidate("1" * 64, "2.7", "2026-09")
    monkeypatch.setattr(worker, "discover_published_release_evidence",
                        lambda store, seen_identities=(): {"candidates": [correction]})
    atomic_write = worker.atomic_write
    def fail_version(path, body, mode=0o600):
        if path.name.endswith("1" * 64 + ".json"):
            raise OSError("injected version write failure")
        atomic_write(path, body, mode)
    monkeypatch.setattr(worker, "atomic_write", fail_version)
    failed = invoke(output, state, lambda _: answer(claim(value="2.7", period="2026-09")))
    assert failed["status"] == "stale"
    assert (output / "summary-manifest.json").read_bytes() == previous
