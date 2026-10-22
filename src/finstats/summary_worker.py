"""Private, fail-closed worker for evidence-grounded public release summaries.

There is deliberately no provider client here. An inference callable must be
injected by a later, separately authorised runtime; it receives data only and
has no browser, network, shell or filesystem capabilities from this module.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import fcntl
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
MAX_SUMMARY_CHARS = 1200
DEFAULT_INFERENCE_TIMEOUT_SECONDS = 60
_NUMBER = re.compile(r"(?<![\w.])[+-]?(?:\d+(?:,\d{3})*|\d*)(?:\.\d+)?%?(?![\w.])")


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


def _evidence_values(bundle: dict) -> tuple[set[Decimal], set[str], set[str]]:
    numbers: set[Decimal] = set()
    periods: set[str] = {bundle["release"]["published_date"]}
    citations: set[str] = set()
    for metric in bundle["metrics"].values():
        if metric.get("previous_published_date"):
            periods.add(metric["previous_published_date"])
        for url in (metric.get("source_url"), (metric.get("previous_provenance") or {}).get("source_url")):
            if url:
                citations.add(url)
        for group in (metric.get("observations", []), metric.get("previous_observations", [])):
            for observation in group:
                periods.add(observation["period"])
                if observation.get("value") is not None:
                    try:
                        numbers.add(Decimal(str(observation["value"])))
                    except InvalidOperation:
                        raise ValueError("Evidence contains an invalid numeric value")
        for revision in metric.get("revisions", []):
            periods.add(revision["period"])
            for key in ("previous", "current"):
                if revision.get(key) is not None:
                    numbers.add(Decimal(str(revision[key])))
    if bundle["release"].get("source_url"):
        citations.add(bundle["release"]["source_url"])
    official_text = bundle.get("official_text")
    if isinstance(official_text, dict) and official_text.get("source_url"):
        citations.add(official_text["source_url"])
    return numbers, periods, citations


def validate_summary(raw: object, bundle: dict) -> dict:
    """Accept only the exact small public schema and evidence-supported claims."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise ValueError("Summary is not valid JSON") from exc
    if not isinstance(raw, dict) or set(raw) != {"summary", "period", "citations"}:
        raise ValueError("Summary must contain exactly summary, period and citations")
    summary, period, citations = raw["summary"], raw["period"], raw["citations"]
    if (not isinstance(summary, str) or not summary.strip() or len(summary) > MAX_SUMMARY_CHARS
            or "<" in summary or ">" in summary):
        raise ValueError("Summary text is empty, oversized or contains markup")
    if not isinstance(period, str):
        raise ValueError("Summary period is invalid")
    allowed_numbers, allowed_periods, allowed_citations = _evidence_values(bundle)
    if period not in allowed_periods:
        raise ValueError("Summary period is not present in the supplied evidence")
    if not isinstance(citations, list) or not citations or len(citations) > 8:
        raise ValueError("Summary citations are missing or exceed the limit")
    if any(not isinstance(url, str) or url not in allowed_citations for url in citations):
        raise ValueError("Summary cites a source outside the supplied evidence")
    if len(set(citations)) != len(citations):
        raise ValueError("Summary citations contain duplicates")
    for token in _NUMBER.findall(summary):
        if token in {"", "+", "-"}:
            continue
        try:
            value = Decimal(token.replace(",", "").rstrip("%"))
        except InvalidOperation as exc:
            raise ValueError("Summary contains an invalid numeric claim") from exc
        if value not in allowed_numbers:
            raise ValueError("Summary contains a number absent from the supplied evidence")
    return {"summary": summary.strip(), "period": period, "citations": citations}


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
    if infer is None or enabled is not True or os.environ.get("FINSTATS_AI_ENABLED", "").lower() != "true":
        _status(status_path, "disabled", "owner_activation_required")
        return {"status": "disabled", "processed": 0}

    try:
        with _worker_lock(state):
            seen_path = state / "summary-identities.json"
            seen = _read_seen(seen_path)
            result = discover_published_release_evidence(store, seen_identities=seen)
            # Discovery itself is capped before any inference call; remaining candidates
            # are rediscovered on the next invocation from retained release identities.
            candidates = result["candidates"][:max_queue]
            if not candidates:
                _status(status_path, "current", "no_new_qualifying_release")
                return {"status": "current", "processed": 0,
                        "unsupported": result.get("unsupported", [])}
            candidate = candidates[0]
            bundle = candidate["evidence"]
            if bundle.get("evidence_kind") != "official_download":
                _status(status_path, "stale", "fixture_evidence")
                return {"status": "stale", "processed": 0, "reason": "fixture_evidence"}
            from uk_macro_crew.ai_safety import admitted_run
            with admitted_run(), _inference_deadline(timeout_seconds):
                summary = validate_summary(infer(bundle), bundle)
            evidence_id = candidate["evidence_identity"]
            release = bundle["release"]
            release_key = f"{release['source']}:{release['id']}"
            filename = f"{release['published_date']}-{evidence_id}.json"
            release_folder = __import__("hashlib").sha256(release_key.encode()).hexdigest()
            version_dir = output / "summary-versions" / release_folder
            version_dir.mkdir(parents=True, exist_ok=True)
            version_path = version_dir / filename
            generated_at = _now()
            version = {"schema_version": SCHEMA_VERSION, "release": release,
                       "generated_at": generated_at,
                       "evidence_identity": evidence_id, "summary": summary}
            encoded_version = encode(version)
            if version_path.exists():
                # A prior run may have written this immutable version but failed
                # before replacing the manifest. Reuse identical bytes on retry.
                if version_path.is_symlink() or version_path.read_bytes() != encoded_version:
                    raise ValueError("Immutable summary version conflicts with existing content")
            else:
                atomic_write(version_path, encoded_version, 0o644)
            manifest = {"schema_version": SCHEMA_VERSION, "updated_at": _now(), "summaries": {}}
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text())
                if (not isinstance(manifest, dict) or manifest.get("schema_version") != SCHEMA_VERSION
                        or not isinstance(manifest.get("summaries"), dict)):
                    raise ValueError("Invalid public summary manifest")
            manifest["summaries"][release_key] = {
                "published_date": release["published_date"], "period": summary["period"],
                "generated_at": generated_at, "evidence_identity": evidence_id,
                "version": str(version_path.relative_to(output)),
            }
            manifest["updated_at"] = generated_at
            atomic_write(manifest_path, encode(manifest), 0o644)
            seen.append(evidence_id)
            atomic_write(seen_path, encode({"schema_version": SCHEMA_VERSION,
                                            "identities": seen}), 0o600)
            _status(status_path, "current")
            return {"status": "published", "processed": 1, "version": str(version_path)}
    except Exception as exc:
        # A failed correction never changes the prior public manifest/version.
        reason = ("timeout" if isinstance(exc, TimeoutError) else
                  "admission_or_lock" if isinstance(exc, RuntimeError) else
                  "invalid_summary" if isinstance(exc, ValueError) else "inference_failed")
        _status(status_path, "stale", reason)
        return {"status": "stale", "processed": 0, "reason": reason}
