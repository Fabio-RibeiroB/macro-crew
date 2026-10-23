"""Private, fail-closed worker for evidence-grounded public release summaries.

There is deliberately no provider client here. An inference callable must be
injected by a later, separately authorised runtime; it receives data only and
has no browser, network, shell or filesystem capabilities from this module.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import signal
from typing import Callable

from finstats.release_detector import discover_published_release_evidence
from finstats.storage import Store, atomic_write, encode

SCHEMA_VERSION = 1
MAX_QUEUE = 8
MAX_CLAIMS = 8
MAX_SUMMARY_CHARS = 1200
DEFAULT_INFERENCE_TIMEOUT_SECONDS = 60


class OperatorReviewRequired(ValueError):
    """Private processed identity no longer has a trustworthy immutable version."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _safe_private_dir(path: Path) -> Path:
    path = path.expanduser()
    if path.is_symlink():
        raise ValueError("AI state directory must not be a symlink")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    resolved = path.resolve()
    project = Path(__file__).resolve().parents[2]
    if project == resolved or project in resolved.parents or any(
            part in {"public_html", "www", "htdocs"} for part in resolved.parts):
        raise ValueError("AI state must be outside the repository and web roots")
    if path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise ValueError("AI state must be owned by the job user with mode 0700")
    return resolved


@contextmanager
def _worker_lock(state: Path):
    fd = os.open(state / "summary-worker.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("Another summary worker is already running") from exc
        yield


def _read_seen(path: Path) -> list[str]:
    if path.is_symlink():
        raise ValueError("AI identity ledger must not be a symlink")
    if not path.exists():
        return []
    value = json.loads(path.read_text())
    if (not isinstance(value, dict) or set(value) != {"schema_version", "identities"}
            or value["schema_version"] != SCHEMA_VERSION
            or not isinstance(value["identities"], list)
            or any(not isinstance(item, str) or not re.fullmatch(r"[0-9a-f]{64}", item)
                   for item in value["identities"])):
        raise ValueError("Invalid summary identity ledger; operator review required")
    return value["identities"]


def _reference_window(metric: dict, observation: dict) -> str:
    return observation.get("reference") or metric.get("reference_window") or metric["definition"]["comparison"]


def _available_claims(bundle: dict) -> tuple[set[tuple], set[str]]:
    allowed: set[tuple] = set()
    citations: set[str] = set()
    for metric_key, metric in bundle["metrics"].items():
        unit = metric["definition"]["unit"]
        for observation in metric.get("observations", []):
            if observation.get("status", "observed") == "observed" and isinstance(observation.get("value"), str):
                allowed.add((metric_key, unit, observation["period"],
                             _reference_window(metric, observation), observation["value"], None,
                             "current_observation"))
        for observation in metric.get("previous_observations", []):
            if observation.get("status", "observed") == "observed" and isinstance(observation.get("value"), str):
                allowed.add((metric_key, unit, observation["period"],
                             _reference_window(metric, observation), observation["value"], None,
                             "previous_observation"))
        current_by_period = {item["period"]: item for item in metric.get("observations", [])}
        for revision in metric.get("revisions", []):
            current = current_by_period.get(revision["period"], {})
            reference = _reference_window(metric, current) if current else metric.get("reference_window")
            if (isinstance(revision.get("previous"), str)
                    and isinstance(revision.get("current"), str)
                    and reference):
                allowed.add((metric_key, unit, revision["period"], reference,
                             revision["current"], revision["previous"], "revision"))
        for url in (metric.get("source_url"), (metric.get("previous_provenance") or {}).get("source_url")):
            if url:
                citations.add(url)
    if bundle["release"].get("source_url"):
        citations.add(bundle["release"]["source_url"])
    official_text = bundle.get("official_text")
    if isinstance(official_text, dict) and official_text.get("source_url"):
        citations.add(official_text["source_url"])
    return allowed, citations


def _claim_tuple(claim: dict) -> tuple:
    required = {"metric_key", "unit", "period", "reference_window", "value", "previous_value", "provenance"}
    if (not isinstance(claim, dict) or set(claim) != required
            or not all(isinstance(claim[key], str) and claim[key] for key in
                       ("metric_key", "unit", "period", "reference_window", "value", "provenance"))
            or (claim["previous_value"] is not None and not isinstance(claim["previous_value"], str))
            or claim["provenance"] not in {"current_observation", "previous_observation", "revision"}):
        raise ValueError("Summary claim has an invalid structure")
    return (claim["metric_key"], claim["unit"], claim["period"], claim["reference_window"],
            claim["value"], claim["previous_value"], claim["provenance"])


def _render_claims(claims: list[dict]) -> str:
    sentences = []
    for claim in claims:
        metric = claim["metric_key"].replace("_", " ").capitalize()
        context = f"{metric} ({claim['period']}; {claim['reference_window']})"
        unit = {"percent": "%", "GBP": "GBP", "GBP_per_month": "GBP/month",
                "GBP_per_year": "GBP/year", "pence_per_litre": "pence/litre"}.get(
                    claim["unit"], claim["unit"])
        if claim["provenance"] == "revision":
            sentences.append(f"{context} was revised from {claim['previous_value']} to {claim['value']} {unit}.")
        elif claim["provenance"] == "previous_observation":
            sentences.append(f"Previous {context}: {claim['value']} {unit}.")
        else:
            sentences.append(f"{context}: {claim['value']} {unit}.")
    rendered = " ".join(sentences)
    if not rendered or len(rendered) > MAX_SUMMARY_CHARS:
        raise ValueError("Rendered summary is empty or exceeds the size limit")
    return rendered


def _claim_reference_periods(summary: dict) -> list[str]:
    return list(dict.fromkeys(claim["period"] for claim in summary["claims"]))


def validate_summary(raw: object, bundle: dict) -> dict:
    """Validate exact evidence tuples, then render all numeric sentences locally."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise ValueError("Summary is not valid JSON") from exc
    if not isinstance(raw, dict) or set(raw) != {"claims", "citations"}:
        raise ValueError("Summary must contain exactly claims and citations")
    claims, citations = raw["claims"], raw["citations"]
    if not isinstance(claims, list) or not 1 <= len(claims) <= MAX_CLAIMS:
        raise ValueError("Summary claims are missing or exceed the limit")
    allowed_claims, allowed_citations = _available_claims(bundle)
    seen_claims = set()
    for claim in claims:
        normalized = _claim_tuple(claim)
        if normalized not in allowed_claims:
            raise ValueError("Summary claim does not match a metric, unit, period, value and provenance")
        if normalized in seen_claims:
            raise ValueError("Summary claims contain duplicates")
        seen_claims.add(normalized)
    if not isinstance(citations, list) or not citations or len(citations) > 8:
        raise ValueError("Summary citations are missing or exceed the limit")
    if any(not isinstance(url, str) or url not in allowed_citations for url in citations):
        raise ValueError("Summary cites a source outside the supplied evidence")
    if len(set(citations)) != len(citations):
        raise ValueError("Summary citations contain duplicates")
    return {"summary": _render_claims(claims), "claims": claims, "citations": citations}


def _public_files(output: Path):
    output.mkdir(parents=True, exist_ok=True)
    if output.is_symlink():
        raise ValueError("Summary output directory must not be a symlink")
    return output / "summary-manifest.json", output / "summary-status.json"


@contextmanager
def _inference_deadline(seconds: int):
    if type(seconds) is not int or not 1 <= seconds <= 60:
        raise ValueError("inference timeout must be between 1 and 60 seconds")
    if not hasattr(signal, "setitimer"):
        raise RuntimeError("bounded inference requires a signal-capable worker runtime")
    previous = signal.getsignal(signal.SIGALRM)
    previous_timer = signal.getitimer(signal.ITIMER_REAL)
    if previous_timer[0] > 0:
        raise RuntimeError("summary worker cannot run inside another timed operation")
    def expired(_signum, _frame):
        raise TimeoutError("summary inference timed out")
    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def _status(path: Path, status: str, reason: str | None = None):
    # No prompts, source text, exception details or private evidence enter public status.
    payload = {"schema_version": SCHEMA_VERSION, "status": status, "updated_at": _now()}
    if reason:
        payload["reason"] = reason
    atomic_write(path, encode(payload), 0o644)


def _read_manifest(path: Path, output: Path) -> dict:
    if path.is_symlink():
        raise ValueError("Summary manifest must not be a symlink")
    value = json.loads(path.read_text())
    if (not isinstance(value, dict) or set(value) != {"schema_version", "updated_at", "summaries"}
            or value["schema_version"] != SCHEMA_VERSION
            or not isinstance(value["updated_at"], str)
            or not isinstance(value["summaries"], dict)):
        raise ValueError("Invalid public summary manifest")
    for release_key, entry in value["summaries"].items():
        if (not isinstance(release_key, str) or not isinstance(entry, dict)
                or set(entry) != {"published_date", "reference_periods", "generated_at",
                                  "evidence_identity", "version"}
                or not isinstance(entry["evidence_identity"], str)
                or not re.fullmatch(r"[0-9a-f]{64}", entry["evidence_identity"])
                or not all(isinstance(entry[key], str) for key in
                           ("published_date", "generated_at", "version"))
                or not isinstance(entry["reference_periods"], list)
                or any(not isinstance(period, str) for period in entry["reference_periods"])):
            raise ValueError("Invalid summary entry in public manifest")
        relative = Path(entry["version"])
        if relative.is_absolute() or ".." in relative.parts or not relative.parts:
            raise ValueError("Summary version path escapes output directory")
        version_path = output / relative
        cursor = output
        for part in relative.parts:
            cursor = cursor / part
            if cursor.is_symlink():
                raise ValueError("Summary version path must not contain symlinks")
        resolved_output = output.resolve()
        resolved_version = version_path.resolve(strict=True)
        if resolved_output not in resolved_version.parents:
            raise ValueError("Summary version path escapes output directory")
        version = _read_version(version_path)
        release = version["release"]
        if (f"{release['source']}:{release['id']}" != release_key
                or version["evidence_identity"] != entry["evidence_identity"]
                or release["published_date"] != entry["published_date"]
                or version["generated_at"] != entry["generated_at"]
                or list(dict.fromkeys(claim["period"] for claim in version["summary"]["claims"]))
                != entry["reference_periods"]):
            raise ValueError("Summary manifest and immutable version disagree")
    return value


def _read_version(path: Path) -> dict:
    if path.is_symlink():
        raise ValueError("Summary version must not be a symlink")
    value = json.loads(path.read_text())
    if (not isinstance(value, dict) or set(value) != {
            "schema_version", "release", "generated_at", "evidence_identity", "summary"}
            or value["schema_version"] != SCHEMA_VERSION
            or not isinstance(value["release"], dict)
            or not isinstance(value["generated_at"], str)
            or not isinstance(value["evidence_identity"], str)
            or not re.fullmatch(r"[0-9a-f]{64}", value["evidence_identity"])
            or not isinstance(value["summary"], dict)
            or set(value["summary"]) != {"summary", "claims", "citations"}
            or not isinstance(value["summary"]["summary"], str)
            or not isinstance(value["summary"]["claims"], list)
            or not isinstance(value["summary"]["citations"], list)):
        raise ValueError("Invalid immutable summary version")
    if (not 1 <= len(value["summary"]["claims"]) <= MAX_CLAIMS
            or not 1 <= len(value["summary"]["citations"]) <= 8
            or any(not isinstance(url, str) or not url for url in value["summary"]["citations"])
            or len(set(value["summary"]["citations"])) != len(value["summary"]["citations"])):
        raise ValueError("Invalid immutable summary claims or citations")
    try:
        for claim in value["summary"]["claims"]:
            _claim_tuple(claim)
        if _render_claims(value["summary"]["claims"]) != value["summary"]["summary"]:
            raise ValueError("Summary prose does not match structured claims")
    except (KeyError, TypeError) as exc:
        raise ValueError("Invalid immutable summary claim") from exc
    return value


def _validate_seen_versions(output: Path, identities: list[str]):
    versions = output / "summary-versions"
    if versions.is_symlink():
        raise OperatorReviewRequired("Processed immutable versions directory is unsafe")
    for identity in identities:
        matches = []
        if versions.exists():
            for folder in versions.iterdir():
                if folder.is_symlink() or not folder.is_dir():
                    continue
                matches.extend(folder.glob(f"*-{identity}.json"))
        if len(matches) != 1:
            raise OperatorReviewRequired("Processed identity has no unique immutable version")
        try:
            version = _read_version(matches[0])
            expected, _ = _version_location(output, version["release"], identity)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise OperatorReviewRequired("Processed immutable version is missing or corrupt") from exc
        if (version["evidence_identity"] != identity
                or expected.resolve() != matches[0].resolve()):
            raise OperatorReviewRequired("Processed immutable version is missing or corrupt")


def _write_seen(path: Path, identities: list[str]):
    atomic_write(path, encode({"schema_version": SCHEMA_VERSION,
                               "identities": list(dict.fromkeys(identities))}), 0o600)


def _version_location(output: Path, release: dict, evidence_id: str) -> tuple[Path, str]:
    release_key = f"{release['source']}:{release['id']}"
    folder = sha256(release_key.encode()).hexdigest()
    relative = Path("summary-versions") / folder / f"{release['published_date']}-{evidence_id}.json"
    return output / relative, str(relative)


def _activate_version(manifest_path: Path, output: Path, version: dict, version_relative: str):
    release = version["release"]
    release_key = f"{release['source']}:{release['id']}"
    manifest = _read_manifest(manifest_path, output) if manifest_path.exists() else {
        "schema_version": SCHEMA_VERSION, "updated_at": version["generated_at"], "summaries": {}}
    manifest["summaries"][release_key] = {
        "published_date": release["published_date"],
        "reference_periods": list(dict.fromkeys(
            claim["period"] for claim in version["summary"]["claims"])),
        "generated_at": version["generated_at"],
        "evidence_identity": version["evidence_identity"],
        "version": version_relative,
    }
    manifest["updated_at"] = version["generated_at"]
    atomic_write(manifest_path, encode(manifest), 0o644)


def process_summaries(
    store: Store, *, state_dir: str | Path, output_dir: str | Path,
    infer: Callable[[dict], object] | None = None, enabled: bool = False,
    max_queue: int = MAX_QUEUE, timeout_seconds: int = DEFAULT_INFERENCE_TIMEOUT_SECONDS,
) -> dict:
    """Process at most one admitted candidate; all figures/events publish elsewhere."""
    if type(max_queue) is not int or not 1 <= max_queue <= MAX_QUEUE:
        raise ValueError(f"max_queue must be between 1 and {MAX_QUEUE}")
    state = _safe_private_dir(Path(state_dir))
    output = Path(output_dir).expanduser()
    manifest_path, status_path = _public_files(output)
    inference_enabled = (infer is not None and enabled is True
                         and os.environ.get("FINSTATS_AI_ENABLED", "").lower() == "true")

    committed = False
    try:
        with _worker_lock(state):
            seen_path = state / "summary-identities.json"
            seen = _read_seen(seen_path)
            _validate_seen_versions(output, seen)
            activated = []
            # The manifest is the publication commit point. Reconcile it into the
            # private dedupe ledger before discovery or admission; a ledger write
            # failure must never make an already published identity call inference.
            if manifest_path.exists():
                manifest = _read_manifest(manifest_path, output)
                activated = [entry["evidence_identity"]
                             for entry in manifest["summaries"].values()]
                reconciled = list(dict.fromkeys([*seen, *activated]))
                if reconciled != seen:
                    try:
                        _write_seen(seen_path, reconciled)
                    except OSError:
                        _status(status_path, "current", "identity_reconciliation_pending")
                        return {"status": "current", "processed": 0,
                                "reason": "identity_reconciliation_pending"}
                    seen = reconciled
            # Discovery deduplicates only against identities currently activated
            # publicly. The private ledger records paid work; it must not suppress
            # a retained valid version after an operator rolls the manifest back.
            result = discover_published_release_evidence(store, seen_identities=activated)
            candidates = result["candidates"][:max_queue]
            if not candidates:
                status = "current" if inference_enabled else "disabled"
                reason = "no_new_qualifying_release" if inference_enabled else "owner_activation_required"
                _status(status_path, status, reason)
                return {"status": status, "processed": 0,
                        "unsupported": result.get("unsupported", [])}
            candidate = candidates[0]
            bundle = candidate["evidence"]
            if bundle.get("evidence_kind") != "official_download":
                _status(status_path, "stale", "fixture_evidence")
                return {"status": "stale", "processed": 0, "reason": "fixture_evidence"}
            evidence_id = candidate["evidence_identity"]
            if not isinstance(evidence_id, str) or not re.fullmatch(r"[0-9a-f]{64}", evidence_id):
                raise ValueError("Invalid release evidence identity")
            release = bundle["release"]
            version_path, version_relative = _version_location(output, release, evidence_id)
            if evidence_id in seen and not version_path.exists():
                raise OperatorReviewRequired("Processed identity has no matching immutable version")
            if version_path.exists():
                # Recover a committed immutable stage without another admitted call.
                staged = _read_version(version_path)
                staged_response = {"claims": staged["summary"]["claims"],
                                   "citations": staged["summary"]["citations"]}
                if (staged["evidence_identity"] != evidence_id
                        or staged["release"] != release
                        or validate_summary(staged_response, bundle) != staged["summary"]):
                    raise ValueError("Staged summary does not match current release evidence")
                _activate_version(manifest_path, output, staged, version_relative)
                committed = True
                try:
                    _write_seen(seen_path, [*seen, evidence_id])
                except OSError:
                    _status(status_path, "current", "identity_reconciliation_pending")
                    return {"status": "published", "processed": 1,
                            "reason": "identity_reconciliation_pending"}
                _status(status_path, "current")
                return {"status": "published", "processed": 1, "version": str(version_path),
                        "recovered": True}
            if not inference_enabled:
                _status(status_path, "disabled", "owner_activation_required")
                return {"status": "disabled", "processed": 0}
            from uk_macro_crew.ai_safety import admitted_run
            with admitted_run(), _inference_deadline(timeout_seconds):
                summary = validate_summary(infer(bundle), bundle)
            version_dir = version_path.parent
            version_dir.mkdir(parents=True, exist_ok=True)
            generated_at = _now()
            version = {"schema_version": SCHEMA_VERSION, "release": release,
                       "generated_at": generated_at,
                       "evidence_identity": evidence_id, "summary": summary}
            encoded_version = encode(version)
            atomic_write(version_path, encoded_version, 0o644)
            _activate_version(manifest_path, output, version, version_relative)
            committed = True
            # Manifest replacement is the commit point. A ledger failure is
            # reconciled on the next invocation and must not report uncommitted data.
            try:
                _write_seen(seen_path, [*seen, evidence_id])
            except OSError:
                _status(status_path, "current", "identity_reconciliation_pending")
                return {"status": "published", "processed": 1,
                        "reason": "identity_reconciliation_pending"}
            _status(status_path, "current")
            return {"status": "published", "processed": 1, "version": str(version_path)}
    except Exception as exc:
        # Before manifest replacement, failures preserve its prior bytes. If the
        # replacement committed, identity reconciliation is handled separately.
        if committed:
            try:
                _status(status_path, "current", "identity_reconciliation_pending")
            except OSError:
                pass
            return {"status": "published", "processed": 1,
                    "reason": "identity_reconciliation_pending"}
        reason = ("timeout" if isinstance(exc, TimeoutError) else
                  "operator_review_required" if isinstance(exc, OperatorReviewRequired) else
                  "admission_or_lock" if isinstance(exc, RuntimeError) else
                  "invalid_summary" if isinstance(exc, ValueError) else "inference_failed")
        _status(status_path, "stale", reason)
        return {"status": "stale", "processed": 0, "reason": reason}
