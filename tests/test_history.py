from packqa.history import HistoryStore
from copy import deepcopy


def pilot_session() -> dict:
    return {
        "kind": "pack-qa-pilot-session",
        "schema_version": 1,
        "app_version": "Pilot RC1",
        "saved_at": "2026-07-27T04:09:06+00:00",
        "pack_mode": "excel",
        "pack_data": None,
        "spec_bundles": [
            {
                "bundle_id": 7002,
                "name": "มือใหม่ : ใบทหาร 140",
                "items": [],
            }
        ],
        "website_observations": [],
        "report": {
            "summary": {
                "bundles": 1,
                "checks": 9,
                "PASS": 8,
                "FAIL": 0,
                "WARN": 0,
                "UNVERIFIABLE": 1,
            }
        },
        "evidence": {
            "spec": {"name": "req.png", "data_url": "data:image/png;base64,AA=="},
            "website": [
                {"name": "web.png", "data_url": "data:image/png;base64,AA=="}
            ],
            "aztek": None,
            "receipt": [],
        },
        "diagnostics": {},
    }


def test_history_store_round_trip_and_delete(tmp_path) -> None:
    store = HistoryStore(tmp_path / "history.sqlite3")
    session = pilot_session()

    entry = store.save(session)
    entries = store.list()

    assert len(entries) == 1
    assert entries[0]["id"] == entry["id"]
    assert entries[0]["title"] == "มือใหม่ : ใบทหาร 140"
    assert entries[0]["UNVERIFIABLE"] == 1
    assert entries[0]["evidence_count"] == 2
    assert store.get(entry["id"]) == session
    duplicate = store.save(session)
    assert duplicate["id"] == entry["id"]
    assert len(store.list()) == 1
    rerun = deepcopy(session)
    rerun["saved_at"] = "2026-07-27T05:30:55+00:00"
    rerun["report"]["generated_at"] = "2026-07-27T05:30:55+00:00"
    assert store.save(rerun)["id"] == entry["id"]
    assert len(store.list()) == 1
    changed = deepcopy(rerun)
    changed["evidence"]["receipt"] = [
        {"name": "receipt.png", "data_url": "data:image/png;base64,BB=="}
    ]
    assert store.save(changed)["id"] != entry["id"]
    assert len(store.list()) == 2
    assert store.delete(entry["id"]) is True
    assert store.get(entry["id"]) is None
    assert store.delete(entry["id"]) is False


def test_history_rejects_non_pack_qa_payload(tmp_path) -> None:
    store = HistoryStore(tmp_path / "history.sqlite3")

    try:
        store.save({"kind": "other"})
    except ValueError as error:
        assert "Pack QA Pilot session" in str(error)
    else:
        raise AssertionError("invalid history payload was accepted")
