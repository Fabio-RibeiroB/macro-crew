import json
import os

from uk_macro_crew.history import build_history_from_snapshot, get_history_filename
from uk_macro_crew.schema import validate_latest_snapshot
from uk_macro_crew.utils import get_json_filename


def migrate() -> None:
    snapshot_filename = get_json_filename()
    history_filename = get_history_filename()

    if not os.path.exists(snapshot_filename):
        raise FileNotFoundError(f"Snapshot file not found: {snapshot_filename}")

    with open(snapshot_filename, "r", encoding="utf-8") as f:
        snapshot_payload = json.load(f)

    validate_latest_snapshot(snapshot_payload)
    history_payload = build_history_from_snapshot(snapshot_payload, history_filename)

    tmp_history_filename = f"{history_filename}.tmp"
    with open(tmp_history_filename, "w", encoding="utf-8") as f:
        json.dump(history_payload, f, indent=2)
    os.replace(tmp_history_filename, history_filename)

    print(f"History migration completed: {history_filename}")


if __name__ == "__main__":
    migrate()
