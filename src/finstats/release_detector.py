"""Deterministic private release evidence; deliberately not wired to publication."""
from __future__ import annotations

from dataclasses import asdict
from datetime import date
from hashlib import sha256
from html.parser import HTMLParser
import json
import re
from typing import Iterable
from urllib.parse import urlsplit

from finstats.sources import DEFINITIONS
from finstats.storage import Store, encode

RULES_VERSION = 1
EVIDENCE_VERSION = 1
MAX_OFFICIAL_TEXT_BYTES = 64_000
MAX_COMPARABLE_OBSERVATIONS = 24
MAX_EXPOSED_REVISIONS = 500
SOURCE_PATHS = {
    "ons": ("www.ons.gov.uk", re.compile(r"/releases/[a-zA-Z0-9/_-]+")),
    "boe": ("www.bankofengland.co.uk", re.compile(r"/monetary-policy/upcoming-mpc-dates")),
    "boe_mpc": ("www.bankofengland.co.uk", re.compile(r"/monetary-policy/upcoming-mpc-dates")),
    "obr": ("obr.uk", re.compile(r"/publications/")),
    "hm_treasury": ("www.gov.uk", re.compile(
        r"/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-20\d{2}-date")),
    "desnz": ("www.gov.uk", re.compile(r"/government/statistics/weekly-road-fuel-prices")),
    "desnz_fuel": ("www.gov.uk", re.compile(r"/government/statistics/weekly-road-fuel-prices")),
    "ofgem": ("www.ofgem.gov.uk", re.compile(
        r"/(?:news/changes-energy-price-cap-between-[a-z0-9-]+|energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap)")),
}

# These proposed rules are documentation for oversight only. They are not
# consulted by qualifies() and must remain disabled until the owner reviews them.
MATERIAL_THRESHOLD_PROPOSALS = {
    "version": 1,
    "enabled": False,
    "fuel": {
        "unit": "pence_per_litre",
        "lookback": "previous four distinct weekly reference observations",
        "proposal": "qualify at absolute change >= 2.0 pence/litre in either series",
        "boundary_examples": [
            {"change": "1.99", "qualifies_if_enabled": False},
            {"change": "2.00", "qualifies_if_enabled": True},
            {"change": "2.01", "qualifies_if_enabled": True},
        ],
    },
    "gilt_yields": {
        "unit": "percentage_points",
        "lookback": "previous five distinct BoE trading-day observations",
        "proposal": "qualify at absolute change >= 0.25 percentage points in any approved maturity",
        "boundary_examples": [
            {"change": "0.249", "qualifies_if_enabled": False},
            {"change": "0.250", "qualifies_if_enabled": True},
            {"change": "0.251", "qualifies_if_enabled": True},
        ],
    },
}


class _VisibleText(HTMLParser):
    """Extract visible text while discarding markup and non-content elements."""

    _DROP = {"script", "style", "noscript", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.drop_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self._DROP:
            self.drop_depth += 1

    def handle_endtag(self, tag):
        if tag.lower() in self._DROP and self.drop_depth:
            self.drop_depth -= 1

    def handle_data(self, data):
        if not self.drop_depth:
            self.parts.append(data)


def canonical_official_text(value: str | bytes) -> str:
    """Normalize bounded official text so markup/spacing churn is immaterial."""
    if isinstance(value, bytes):
        if len(value) > MAX_OFFICIAL_TEXT_BYTES:
            raise ValueError("official text exceeds the private evidence limit")
        value = value.decode("utf-8", "replace")
    if not isinstance(value, str):
        raise TypeError("official text must be text or bytes")
    if len(value.encode("utf-8")) > MAX_OFFICIAL_TEXT_BYTES:
        raise ValueError("official text exceeds the private evidence limit")
    parser = _VisibleText()
    parser.feed(value)
    parser.close()
    text = " ".join(" ".join(parser.parts).split())
    return re.sub(r"\u00a0", " ", text).strip()


def semantic_fingerprint(value: dict) -> str:
    """Hash meaningful evidence; caller excludes retrieval/generation metadata."""
    return sha256(encode(value)).hexdigest()


def _source_url_valid(source: str, value: str) -> bool:
    expected = SOURCE_PATHS.get(source)
    if not expected:
        return False
    parts = urlsplit(value)
    return (parts.scheme == "https" and parts.hostname == expected[0]
            and parts.port is None and parts.username is None and parts.password is None
            and not parts.query and not parts.fragment and expected[1].fullmatch(parts.path) is not None)


def _snapshot_observations(store: Store, snapshot_id: int) -> list[dict]:
    row = store.db.execute("SELECT payload FROM snapshot WHERE id=?", (snapshot_id,)).fetchone()
    if row is None:
        raise ValueError("accepted snapshot is missing")
    return [
        {"period": item["period"], "value": item["value"], "status": item["status"],
         **({"reference": item["reference"]} if item.get("reference") else {})}
        for item in json.loads(row["payload"])["observations"]
    ]


def _observation_fingerprint(key: str, payload: dict) -> str:
    observations = [
        {"period": item["period"], "value": item["value"], "status": item["status"],
         **({"reference": item["reference"]} if item.get("reference") else {})}
        for item in payload["observations"]
    ]
    return semantic_fingerprint({
        "definition": asdict(DEFINITIONS[key]),
        "source_published_date": payload["published_date"],
        "observations": observations,
    })


def _comparison(store: Store, key: str, current: dict) -> dict:
    rows = store.db.execute(
        "SELECT s.id,s.vintage,s.payload,a.id AS receipt_id,a.collected_at,a.source_url,a.raw_hash "
        "FROM snapshot s JOIN receipt r ON r.snapshot_id=s.id "
        "JOIN attempt a ON a.id=r.attempt_id WHERE s.key=? "
        "AND s.id<>? AND a.status='accepted' AND a.evidence_kind=? "
        "ORDER BY s.vintage DESC,a.id DESC",
        (key, current["id"], current["evidence_kind"]),
    ).fetchall()
    prior = None
    for row in rows:
        if row["vintage"] <= current["vintage"]:
            prior = dict(row)
            break
    current_observations = _snapshot_observations(store, current["id"])
    prior_observations = _snapshot_observations(store, prior["id"]) if prior else []
    old = {item["period"]: item for item in prior_observations}
    revisions = [
        {"period": item["period"], "previous": old[item["period"]]["value"],
         "current": item["value"], "previous_status": old[item["period"]]["status"],
         "current_status": item["status"]}
        for item in current_observations
        if item["period"] in old and (
            old[item["period"]]["value"] != item["value"]
            or old[item["period"]]["status"] != item["status"]
        )
    ]
    revision_fingerprint = semantic_fingerprint({"revisions": revisions})
    previous_observation_fingerprint = (
        _observation_fingerprint(key, json.loads(prior["payload"])) if prior else None)
    return {
        "previous_snapshot_id": prior["id"] if prior else None,
        "previous_observation_fingerprint": previous_observation_fingerprint,
        "previous_published_date": json.loads(prior["payload"])["published_date"] if prior else None,
        "previous_provenance": ({"source_receipt_id": prior["receipt_id"],
                                 "source_url": prior["source_url"],
                                 "source_sha256": prior["raw_hash"],
                                 "retrieved_at": prior["collected_at"]} if prior else None),
        "previous_observations": prior_observations[-MAX_COMPARABLE_OBSERVATIONS:],
        "revisions": revisions[-MAX_EXPOSED_REVISIONS:],
        "revision_count": len(revisions),
        "revisions_truncated": len(revisions) > MAX_EXPOSED_REVISIONS,
        "revision_fingerprint": revision_fingerprint,
        "added_period_count": sum(item["period"] not in old for item in current_observations),
        "observations": current_observations[-MAX_COMPARABLE_OBSERVATIONS:],
    }


def build_evidence(
    store: Store,
    *,
    release: dict,
    metric_keys: Iterable[str],
    official_text: str | bytes | None = None,
    text_source_url: str | None = None,
) -> dict:
    """Build a private evidence bundle from accepted snapshots and a known release.

    `release` is a qualified official publication/event identity supplied by the
    existing source/event contract. This function performs no discovery or I/O.
    """
    identity = release.get("id")
    published = release.get("published_date") or release.get("date")
    source = release.get("source")
    if not all(isinstance(x, str) and x for x in (identity, published, source)):
        raise ValueError("release requires source, stable identity and publication date")
    date.fromisoformat(published)
    evidence_kind = release.get("evidence_kind", "official_download")
    if evidence_kind not in {"official_download", "recorded_fixture"}:
        raise ValueError("unknown release evidence kind")
    text = canonical_official_text(official_text) if official_text is not None else None
    for candidate_url in (release.get("source_url"), text_source_url):
        if candidate_url is not None and not _source_url_valid(source, candidate_url):
            raise ValueError("release evidence URL is outside the qualified official paths")
    if text is not None and text_source_url is None:
        raise ValueError("official text requires its qualified source URL")
    metrics = {}
    for key in sorted(set(metric_keys)):
        if key not in DEFINITIONS:
            raise ValueError("unknown metric key")
        current = store.latest(key)
        if current is None or current["evidence_kind"] != evidence_kind:
            continue
        payload = json.loads(current["payload"])
        comparison = _comparison(store, key, current)
        changed = comparison["revision_count"] > 0
        added = comparison["added_period_count"] > 0
        information_state = (
            "revision_and_new_observation" if changed and added else
            "revised_values" if changed else
            "new_observation" if added else
            "low_information_unchanged_release"
        )
        metrics[key] = {
            "definition": asdict(DEFINITIONS[key]),
            "snapshot_id": current["id"],
            "source_receipt_id": current["receipt_id"],
            "source_url": current["source_url"],
            "source_sha256": current["raw_hash"],
            "retrieved_at": current["collected_at"],
            "source_published_date": payload["published_date"],
            "observation_fingerprint": _observation_fingerprint(key, payload),
            "reference_window": DEFINITIONS[key].comparison,
            **comparison,
            "information_state": information_state,
        }
    if not metrics:
        raise ValueError("release evidence has no accepted official metrics")
    semantic_metrics = {
        key: {
            "definition": value["definition"],
            "source_published_date": value["source_published_date"],
            "observation_fingerprint": value["observation_fingerprint"],
            "reference_window": value["reference_window"],
            "previous_published_date": value["previous_published_date"],
            "previous_observation_fingerprint": value["previous_observation_fingerprint"],
            "previous_observations": value["previous_observations"],
            "revisions": value["revisions"],
            "revision_count": value["revision_count"],
            "revision_fingerprint": value["revision_fingerprint"],
            "added_period_count": value["added_period_count"],
            "observations": value["observations"],
            "information_state": value["information_state"],
        }
        for key, value in metrics.items()
    }
    semantic_core = {
        "schema_version": EVIDENCE_VERSION,
        "rules_version": RULES_VERSION,
        "release": {"source": source, "id": identity, "published_date": published},
        "metrics": semantic_metrics,
        "official_text": text,
    }
    core = {
        **semantic_core,
        "evidence_kind": evidence_kind,
        "release": {"source": source, "id": identity, "published_date": published,
                    "source_url": release.get("source_url")},
        "metrics": metrics,
        "official_text": ({"text": text, "source_url": text_source_url,
                           "raw_sha256": sha256(official_text if isinstance(official_text, bytes)
                                                 else official_text.encode("utf-8")).hexdigest()}
                          if text is not None else None),
    }
    return {**core, "semantic_fingerprint": semantic_fingerprint(semantic_core)}


def qualifies(release: dict, metric_keys: Iterable[str]) -> dict:
    """Versioned deterministic qualification decision; no material thresholds."""
    source = release.get("source")
    kind = release.get("release_kind")
    keys = set(metric_keys)
    if release.get("evidence_kind", "official_download") != "official_download":
        reason = "fixture_evidence"
    elif (source == "ons" and kind == "scheduled_monthly_statistical_release"
          and (release.get("status") == "published" or release.get("published") is True)):
        reason = "qualified_monthly_release"
    elif (source in {"boe", "boe_mpc"} and kind == "policy_decision"
          and release.get("id") and (release.get("status") == "published"
                                      or release.get("published") is True)):
        reason = "qualified_policy_release"
    elif keys & {"bank_rate", "gilt_5y", "gilt_10y", "gilt_20y"} and kind != "policy_decision":
        reason = "daily_observation_only"
    elif source in {"desnz", "desnz_fuel", "boe"} and keys & {
        "petrol_price", "diesel_price", "gilt_5y", "gilt_10y", "gilt_20y"
    }:
        reason = "material_thresholds_disabled"
    else:
        reason = "not_qualified"
    return {"qualified": reason in {"qualified_monthly_release", "qualified_policy_release"},
            "reason": reason, "rules_version": RULES_VERSION}


def release_evidence_identity(bundle: dict) -> str:
    """Dated identity changes when release content, numbers or revisions change."""
    release = bundle["release"]
    return semantic_fingerprint({
        "rules_version": bundle["rules_version"],
        "source": release["source"],
        "id": release["id"],
        "published_date": release["published_date"],
        "semantic_fingerprint": bundle["semantic_fingerprint"],
    })
