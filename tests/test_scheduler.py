from datetime import date

import scheduler


def test_enrich_with_official_dates_overrides_economic_indicator_schedule(monkeypatch):
    snapshot_dates = {
        "interest_rate": {
            "current_date": "2026-02-05",
            "next_publication_date": "2026-03-19",
            "schedule_source": "snapshot",
        },
        "financial_stability_report": {
            "current_date": "2025-12-15",
            "next_publication_date": "2026-06-15",
            "schedule_source": "snapshot",
        },
    }

    monkeypatch.setattr(
        scheduler,
        "fetch_official_release_schedule",
        lambda: {
            "interest_rate": {
                "next_publication_date": "2026-03-20",
                "source": "https://www.bankofengland.co.uk",
            }
        },
    )

    enriched = scheduler.enrich_with_official_dates(snapshot_dates)

    assert enriched["interest_rate"]["next_publication_date"] == "2026-03-20"
    assert enriched["interest_rate"]["schedule_source"] == "official"
    assert enriched["financial_stability_report"]["next_publication_date"] == "2026-06-15"


def test_should_force_weekly_refresh_for_sunday():
    assert scheduler.should_force_weekly_refresh(date(2026, 3, 15)) is True
    assert scheduler.should_force_weekly_refresh(date(2026, 3, 14)) is False


def test_is_snapshot_stale_uses_metadata_age():
    report = {"metadata": {"last_updated": "2026-03-01T12:00:00Z"}}

    assert scheduler.is_snapshot_stale(report, date(2026, 3, 14)) is True
    assert scheduler.is_snapshot_stale(report, date(2026, 3, 5)) is False


def test_is_due_or_overdue_uses_enriched_dates():
    info = {
        "current_date": "2026-02-05",
        "next_publication_date": "2026-03-19",
        "schedule_source": "official",
    }

    assert scheduler.is_due_or_overdue(info, "2026-03-18") is False
    assert scheduler.is_due_or_overdue(info, "2026-03-19") is True
