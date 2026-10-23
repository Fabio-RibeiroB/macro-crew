"""Create test-only public summary versions with the real worker and mock evidence."""
from __future__ import annotations

import os
from pathlib import Path
import sys

ROOT = Path(sys.argv[1])
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
from finstats import summary_worker as worker  # noqa: E402

URL = "https://www.ons.gov.uk/releases/consumer-contract-test"


def make_candidate(index: int):
    period = "2026-08" if index == 0 else "2026-07"
    cpi_value = "2.5" if index == 0 else "2.4"
    unemployment_value = "4.8" if index == 0 else "4.7"
    return {
        "evidence_identity": ("a" if index == 0 else "b") * 64,
        "evidence": {
            "evidence_kind": "official_download",  # Mocked only; this artifact stays in tests.
            "release": {"source": "ons", "id": f"ons:consumer-test-{index}",
                        "published_date": "2026-09-15" if index == 0 else "2026-08-15",
                        "source_url": URL},
            "metrics": {
                "cpi": {"definition": {"unit": "percent", "comparison": "year_on_year"},
                        "reference_window": "year_on_year", "source_url": URL,
                        "observations": [{"period": period, "value": cpi_value}],
                        "previous_observations": [], "revisions": []},
                "unemployment": {"definition": {"unit": "percent", "comparison": "level"},
                                 "reference_window": "level", "source_url": URL,
                                 "observations": [{"period": period, "value": unemployment_value}],
                                 "previous_observations": [], "revisions": []},
            },
        },
    }


candidates = [make_candidate(0), make_candidate(1)]
worker.discover_published_release_evidence = lambda _store, seen_identities=(): {
    "candidates": [item for item in candidates if item["evidence_identity"] not in seen_identities],
    "unsupported": [],
}
os.environ["FINSTATS_AI_ENABLED"] = "true"
os.environ["FINSTATS_AI_DAILY_ATTEMPTS"] = "4"
os.environ["FINSTATS_AI_STATE_DIR"] = str(ROOT / "private-state")

for candidate in candidates:
    evidence = candidate["evidence"]
    period = evidence["metrics"]["cpi"]["observations"][0]["period"]
    cpi_value = evidence["metrics"]["cpi"]["observations"][0]["value"]
    unemployment_value = evidence["metrics"]["unemployment"]["observations"][0]["value"]
    claims = [
        {"metric_key": "cpi", "unit": "percent", "period": period,
         "reference_window": "year_on_year", "value": cpi_value,
         "previous_value": None, "provenance": "current_observation"},
        {"metric_key": "unemployment", "unit": "percent", "period": period,
         "reference_window": "level", "value": unemployment_value,
         "previous_value": None, "provenance": "current_observation"},
    ]
    result = worker.process_summaries(
        object(), state_dir=ROOT / "private-state", output_dir=ROOT / "data",
        infer=lambda _bundle, selected=claims: {"claims": selected, "citations": [URL]},
        enabled=True,
    )
    if result["status"] != "published":
        raise RuntimeError(f"test mock producer failed: {result}")
