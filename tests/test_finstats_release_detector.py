from datetime import datetime, timezone, timedelta
from decimal import Decimal
import json

import pytest

from finstats.release_detector import (
    MATERIAL_THRESHOLD_PROPOSALS,
    build_evidence,
    canonical_official_text,
    discover_published_release_evidence,
    qualifies,
    release_evidence_identity,
    semantic_fingerprint,
)
from finstats.storage import Store
from finstats.summary_worker import validate_summary
from tests.test_finstats_sources import fixture


WHEN = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
EVENT_WHEN = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)
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
    first = canonical_official_text("<nav>Home</nav><main><h1>Release</h1><p>Inflation was 3.5%.</p></main><footer>Legal</footer>")
    second = canonical_official_text(
        '<header>New branding</header><main class="content"><h1> Release </h1>\n<p>Inflation&nbsp;was 3.5%.</p>'
        "<script>tracking()</script></main><nav>Different links</nav>"
    )
    assert first == second
    assert semantic_fingerprint({"text": first}) == semantic_fingerprint({"text": second})
    assert canonical_official_text("<main><p>Inflation was 3.6%.</p></main>") != first
    nested = canonical_official_text(
        "<main><article><header><h1>Release title A</h1></header>"
        "<p>Body text</p></article></main>"
    )
    nested_title_correction = canonical_official_text(
        "<main><article><header><h1>Release title B</h1></header>"
        "<p>Body text</p></article></main>"
    )
    assert nested == "Release title A Body text"
    assert semantic_fingerprint({"text": nested}) != semantic_fingerprint(
        {"text": nested_title_correction}
    )
    with pytest.raises(ValueError, match="unambiguous"):
        canonical_official_text("<div><p>Unscoped page content</p></div>")
    for malformed in (
        "<main><p>First</p></main><article><p>Second</p></article>",
        "<main><p>Unclosed publication scope</p>",
        "<main><article><p>Mismatched scope</p></main></article>",
    ):
        with pytest.raises(ValueError, match="unambiguous"):
            canonical_official_text(malformed)
    assert canonical_official_text("bounded plain text") == "bounded plain text"


def test_latest_requested_kind_and_prior_comparison_keep_fixture_provenance_consistent(store):
    body = fixture("gdp")
    official_id = store.ingest("gdp", body, WHEN, evidence_kind="official_download")
    store.ingest("gdp", body, WHEN + timedelta(hours=1), evidence_kind="recorded_fixture")
    evidence = build_evidence(store, release={**RELEASE, "evidence_kind": "official_download"},
                              metric_keys=["gdp"])
    metric = evidence["metrics"]["gdp"]
    assert metric["snapshot_id"] == official_id
    assert evidence["evidence_kind"] == "official_download"
    assert metric["previous_provenance"] is None
    fixture_evidence = build_evidence(store, release=RELEASE, metric_keys=["gdp"])
    assert fixture_evidence["evidence_kind"] == "recorded_fixture"
    assert fixture_evidence["metrics"]["gdp"]["source_receipt_id"] != metric["source_receipt_id"]


def test_repeat_fetch_and_export_generation_metadata_do_not_change_identity(store):
    first_id = store.ingest("gdp", fixture("gdp"), WHEN, evidence_kind="recorded_fixture")
    first = build_evidence(store, release=RELEASE, metric_keys=["gdp"],
                           official_text="<main><p>Growth was 0.1%.</p></main>", text_source_url=RELEASE["source_url"])
    store.ingest("gdp", fixture("gdp"), WHEN + timedelta(hours=1), evidence_kind="recorded_fixture")
    second = build_evidence(store, release={**RELEASE, "checked_at": "later",
                                           "generation_id": "unrelated-export"}, metric_keys=["gdp"],
                            official_text="<main><p>Growth was 0.1%.</p></main>", text_source_url=RELEASE["source_url"])
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


def test_real_pay_and_unemployment_windows_validate_through_summary_claims(store):
    keys = ["regular_pay_nominal_growth", "unemployment"]
    for key in keys:
        store.ingest(key, fixture(key), WHEN, evidence_kind="official_download")
    evidence = build_evidence(
        store, release={**RELEASE, "evidence_kind": "official_download"}, metric_keys=keys)
    claims = []
    for key in keys:
        metric = evidence["metrics"][key]
        observation = metric["observations"][-1]
        claims.append({
            "metric_key": key,
            "unit": metric["definition"]["unit"],
            "period": observation["period"],
            "reference_window": observation["reference"],
            "value": observation["value"],
            "previous_value": None,
            "provenance": "current_observation",
        })
    summary = validate_summary({
        "claims": claims,
        "citations": list(dict.fromkeys(evidence["metrics"][key]["source_url"] for key in keys)),
    }, evidence)
    assert all(claim["reference_window"] == {
        "kind": "rolling_months", "start_month": "2026-06", "end_month": "2026-08",
    } for claim in summary["claims"])
    assert "rolling months 2026-06 to 2026-08" in summary["summary"]
    assert all(evidence["metrics"][key]["observations"][-1]["value"] in summary["summary"]
               for key in keys)


def test_corrected_number_and_corrected_official_text_create_distinct_dated_identity(store):
    body = fixture("gdp")
    store.ingest("gdp", body, WHEN, evidence_kind="recorded_fixture")
    before = build_evidence(store, release=RELEASE, metric_keys=["gdp"], official_text="<main><p>Growth 0.1%.</p></main>", text_source_url=RELEASE["source_url"])
    corrected = body.replace(b'"2026 AUG","0.1"', b'"2026 AUG","0.2"')
    store.ingest("gdp", corrected, WHEN + timedelta(hours=1), evidence_kind="recorded_fixture")
    corrected_evidence = build_evidence(store, release=RELEASE, metric_keys=["gdp"], official_text="<main><p>Growth 0.2%.</p></main>", text_source_url=RELEASE["source_url"])
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
    with pytest.raises(ValueError, match="exactly match"):
        build_evidence(store, release={**RELEASE, "source_url":
                                      "https://www.ons.gov.uk/releases/gdp-monthly-estimate-october-2026"},
                       metric_keys=["gdp"],
                       official_text="<main><p>GDP wording</p></main>",
                       text_source_url="https://www.ons.gov.uk/releases/consumer-price-inflation-october-2026")
    unqualified_url = "https://www.ons.gov.uk/other/unreviewed-path"
    with pytest.raises(ValueError, match="qualified official paths"):
        build_evidence(store, release={**RELEASE, "source_url": unqualified_url},
                       metric_keys=["gdp"], official_text="<main><p>text</p></main>",
                       text_source_url=unqualified_url)
    with pytest.raises(ValueError, match="evidence limit"):
        build_evidence(store, release=RELEASE, metric_keys=["gdp"],
                       official_text="x" * 64_001, text_source_url=RELEASE["source_url"])


def _published_ons_capture():
    releases = [
        {"uri": "/releases/gdp-monthly-estimate-october-2026", "description": {
            "title": "GDP monthly estimate, UK: October 2026",
            "release_date": "2026-10-22T08:30:00Z", "published": True}},
        {"uri": "/releases/consumer-price-inflation-october-2026", "description": {
            "title": "Consumer price inflation, UK: October 2026",
            "release_date": "2026-10-22T08:30:00Z", "published": True}},
    ]
    return json.dumps({"breakdown": {"total": len(releases)}, "releases": releases}).encode()


def _mocked_gdp_official_download():
    # In-memory test response, never written to a fixture or public generation.
    return (b'"Title","Gross Value Added - Monthly (period on period growth) :CVM SA"\n'
            b'"CDID","ECYX"\n"Source dataset ID","MGDP"\n"PreUnit",""\n'
            b'"Unit",""\n"Release date","22-10-2026"\n'
            b'"Next release","12 November 2026"\n"Important notes",""\n'
            b'"2026 AUG","0.1"\n')


def test_existing_event_producer_contract_builds_only_date_matched_linked_metric_candidates(tmp_path):
    from finstats.events import collect_events

    store = Store(tmp_path)
    try:
        store.ingest("gdp", _mocked_gdp_official_download(), EVENT_WHEN)

        def mock_official_fetch(url):
            if url.startswith("https://api.beta.ons.gov.uk/"):
                return _published_ons_capture()
            if url == "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates":
                return b"<p>2026 confirmed dates</p><p>Thursday 5 November</p>"
            raise OSError("unneeded event source in this bounded test")

        result = collect_events(tmp_path, clock=lambda: EVENT_WHEN, fetch=mock_official_fetch)
        assert result["schedule"]["mode"] == "official"
        detected = discover_published_release_evidence(store)
        assert len(detected["candidates"]) == 1
        candidate = detected["candidates"][0]
        assert candidate["release"]["id"] == "ons:/releases/gdp-monthly-estimate-october-2026"
        assert candidate["release"]["published_date"] == "2026-10-22"
        assert candidate["metric_keys"] == ["gdp"]
        assert candidate["evidence"]["metrics"].keys() == {"gdp"}
        assert detected["unsupported"] == [{
            "source": "boe_mpc",
            "reason": "event_contract_contains_meeting_dates_not_published_policy_release_identities",
        }]
        # The published CPI event has the same date, but cannot inherit the GDP
        # observation through caller-supplied metric keys.
        assert any(item.get("event_id") == "ons:/releases/consumer-price-inflation-october-2026"
                   and item["reason"] == "no_accepted_official_metric_for_event_publication_date"
                   for item in detected["rejected"])
        repeated = discover_published_release_evidence(
            store, seen_identities=[candidate["evidence_identity"]])
        assert repeated["candidates"] == []
        assert any(item["reason"] == "duplicate_evidence_identity" for item in repeated["rejected"])
    finally:
        store.close()


def test_existing_event_adapter_skips_scheduled_and_rejects_wrong_family(tmp_path):
    from finstats.events import collect_events

    store = Store(tmp_path)
    try:
        store.ingest("gdp", _mocked_gdp_official_download(), EVENT_WHEN)

        def mock_official_fetch(url):
            if url.startswith("https://api.beta.ons.gov.uk/"):
                return _published_ons_capture()
            raise OSError("unneeded event source in this bounded test")

        collect_events(tmp_path, clock=lambda: EVENT_WHEN, fetch=mock_official_fetch)
        state_path = tmp_path / "events.json"
        state = json.loads(state_path.read_text())
        gdp_event = next(event for event in state["providers"]["ons"]["events"]
                         if event["id"] == "ons:/releases/gdp-monthly-estimate-october-2026")
        gdp_event["status"] = "scheduled"
        state_path.write_text(json.dumps(state))
        scheduled = discover_published_release_evidence(store)
        assert scheduled["candidates"] == []
        assert any(item["reason"] == "event_not_published" for item in scheduled["rejected"])

        gdp_event["status"] = "published"
        gdp_event["linked_indicators"] = ["uk.cpi.annual_rate"]
        state_path.write_text(json.dumps(state))
        with pytest.raises(ValueError, match="invalid ONS indicator links"):
            discover_published_release_evidence(store)
    finally:
        store.close()
