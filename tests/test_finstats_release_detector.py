from datetime import datetime, timezone, timedelta
from decimal import Decimal

import pytest

from finstats.release_detector import (
    MATERIAL_THRESHOLD_PROPOSALS,
    build_evidence,
    canonical_official_text,
    qualifies,
    release_evidence_identity,
    semantic_fingerprint,
)
from finstats.storage import Store
from tests.test_finstats_sources import fixture


WHEN = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
RELEASE = {
    "source": "ons",
    "id": "ons:/releases/consumer-price-inflation-october-2026",
    "published_date": "2026-10-21",
    "source_url": "https://www.ons.gov.uk/releases/consumer-price-inflation-october-2026",
    "release_kind": "scheduled_monthly_statistical_release",
    "evidence_kind": "recorded_fixture",
}


@pytest.fixture
def store(tmp_path):
    instance = Store(tmp_path / "private-state")
    yield instance
    instance.close()


def test_semantic_text_hash_ignores_html_whitespace_and_noncontent():
    first = canonical_official_text("<h1>Release</h1><p>Inflation was 3.5%.</p>")
    second = canonical_official_text(
        '<div class="layout"><h1> Release </h1>\n<p>Inflation&nbsp;was 3.5%.</p>'
        "<script>tracking()</script></div>"
    )
    assert first == second
    assert semantic_fingerprint({"text": first}) == semantic_fingerprint({"text": second})


def test_repeat_fetch_and_export_generation_metadata_do_not_change_identity(store):
    first_id = store.ingest("gdp", fixture("gdp"), WHEN, evidence_kind="recorded_fixture")
    first = build_evidence(store, release=RELEASE, metric_keys=["gdp"],
                           official_text="<p>Growth was 0.1%.</p>", text_source_url=RELEASE["source_url"])
    store.ingest("gdp", fixture("gdp"), WHEN + timedelta(hours=1), evidence_kind="recorded_fixture")
    second = build_evidence(store, release={**RELEASE, "checked_at": "later",
                                           "generation_id": "unrelated-export"}, metric_keys=["gdp"],
                            official_text="<p>Growth was 0.1%.</p>", text_source_url=RELEASE["source_url"])
    assert store.latest("gdp")["id"] == first_id
    assert first["semantic_fingerprint"] == second["semantic_fingerprint"]
    assert release_evidence_identity(first) == release_evidence_identity(second)
    assert first["evidence_kind"] == "recorded_fixture"
    assert first["metrics"]["gdp"]["retrieved_at"] != second["metrics"]["gdp"]["retrieved_at"]


def test_new_monthly_release_with_unchanged_values_is_explicitly_low_information(store):
    original = fixture("gdp")
    store.ingest("gdp", original, WHEN, evidence_kind="recorded_fixture")
    # A new official release date, with identical observations.
    newer = original.replace(b'15-10-2026', b'19-10-2026')
    store.ingest("gdp", newer, WHEN + timedelta(days=4), evidence_kind="recorded_fixture")
    new_release = {**RELEASE, "id": RELEASE["id"] + "-correction", "published_date": "2026-10-25",
                   "status": "published"}
    evidence = build_evidence(store, release=new_release, metric_keys=["gdp"])
    assert evidence["metrics"]["gdp"]["information_state"] == "low_information_unchanged_release"
    assert evidence["metrics"]["gdp"]["revisions"] == []
    assert qualifies({**new_release, "evidence_kind": "official_download"}, ["gdp"])["qualified"] is True
    assert qualifies({**new_release, "status": "scheduled", "evidence_kind": "official_download"},
                     ["gdp"])["qualified"] is False


def test_rolling_metric_evidence_preserves_full_reference_window(store):
    store.ingest("regular_pay_nominal_growth", fixture("regular_pay_nominal_growth"), WHEN,
                 evidence_kind="recorded_fixture")
    evidence = build_evidence(store, release=RELEASE, metric_keys=["regular_pay_nominal_growth"])
    latest = evidence["metrics"]["regular_pay_nominal_growth"]["observations"][-1]
    assert latest["reference"] == {
        "kind": "rolling_months", "start_month": "2026-06", "end_month": "2026-08",
    }


def test_corrected_number_and_corrected_official_text_create_distinct_dated_identity(store):
    body = fixture("gdp")
    store.ingest("gdp", body, WHEN, evidence_kind="recorded_fixture")
    before = build_evidence(store, release=RELEASE, metric_keys=["gdp"], official_text="<p>Growth 0.1%.</p>", text_source_url=RELEASE["source_url"])
    corrected = body.replace(b'"2026 AUG","0.1"', b'"2026 AUG","0.2"')
    store.ingest("gdp", corrected, WHEN + timedelta(hours=1), evidence_kind="recorded_fixture")
    corrected_evidence = build_evidence(store, release=RELEASE, metric_keys=["gdp"], official_text="<p>Growth 0.2%.</p>", text_source_url=RELEASE["source_url"])
    revisions = corrected_evidence["metrics"]["gdp"]["revisions"]
    assert {r["period"]: (r["previous"], r["current"]) for r in revisions}["2026-08"] == ("0.1", "0.2")
    assert corrected_evidence["metrics"]["gdp"]["previous_provenance"]["source_sha256"]
    assert release_evidence_identity(before) != release_evidence_identity(corrected_evidence)


def test_daily_rate_or_yield_observation_does_not_qualify_but_policy_identity_does():
    observation = {"source": "boe", "id": "boe:daily:2026-10-22", "release_kind": "observation"}
    decision = {"source": "boe_mpc", "id": "boe:mpc:decision:2026-11-05",
                "release_kind": "policy_decision", "status": "published"}
    assert qualifies(observation, ["bank_rate"])["reason"] == "daily_observation_only"
    assert qualifies(observation, ["gilt_10y"])["reason"] == "daily_observation_only"
    assert qualifies(decision, ["bank_rate"])["qualified"] is True


def test_material_fuel_and_yield_boundaries_are_documented_but_disabled():
    assert MATERIAL_THRESHOLD_PROPOSALS["enabled"] is False
    for metric, threshold in (("fuel", Decimal("2.00")), ("gilt_yields", Decimal("0.250"))):
        proposal = MATERIAL_THRESHOLD_PROPOSALS[metric]
        assert proposal["unit"]
        assert proposal["lookback"]
        for case in proposal["boundary_examples"]:
            qualifies_if_enabled = abs(Decimal(case["change"])) >= threshold
            assert qualifies_if_enabled is case["qualifies_if_enabled"]
    assert qualifies({"source": "desnz", "id": "fuel:week", "release_kind": "observation"},
                     ["petrol_price"])["qualified"] is False
    assert qualifies({"source": "boe", "id": "yield:day", "release_kind": "observation"},
                     ["gilt_10y"])["qualified"] is False


def test_fixture_release_never_qualifies_as_official():
    assert qualifies(RELEASE, ["gdp"]) == {
        "qualified": False, "reason": "fixture_evidence", "rules_version": 1,
    }


def test_text_input_requires_a_bounded_qualified_official_path(store):
    store.ingest("gdp", fixture("gdp"), WHEN, evidence_kind="recorded_fixture")
    with pytest.raises(ValueError, match="qualified official paths"):
        build_evidence(store, release=RELEASE, metric_keys=["gdp"],
                       official_text="<p>text</p>",
                       text_source_url="https://www.ons.gov.uk/other/unreviewed-path")
    with pytest.raises(ValueError, match="evidence limit"):
        build_evidence(store, release=RELEASE, metric_keys=["gdp"],
                       official_text="x" * 64_001, text_source_url=RELEASE["source_url"])
