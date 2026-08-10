import http.client
import json
import threading
from pathlib import Path

import yaml

from packqa.web_api import make_server

ROOT = Path(__file__).resolve().parents[1]


def history_session() -> dict:
    return {
        "kind": "pack-qa-pilot-session",
        "schema_version": 1,
        "app_version": "Pilot RC1",
        "saved_at": "2026-07-27T04:09:06+00:00",
        "pack_mode": "excel",
        "pack_data": None,
        "spec_bundles": [{"bundle_id": 7002, "name": "History Pack"}],
        "website_observations": [],
        "report": {
            "summary": {
                "bundles": 1,
                "checks": 1,
                "PASS": 1,
                "FAIL": 0,
                "WARN": 0,
                "UNVERIFIABLE": 0,
            }
        },
        "evidence": {
            "spec": None,
            "website": [],
            "aztek": None,
            "receipt": [],
        },
        "diagnostics": {},
    }


def test_local_api_reports_health_for_the_launcher() -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "GET",
            "/api/health",
            headers={"Origin": "http://localhost:3000"},
        )
        response = connection.getresponse()
        payload = json.loads(response.read())

        assert response.status == 200
        assert payload == {
            "status": "ok",
            "app": "pack-qa",
            "stage": "pilot",
        }
        assert response.getheader("Access-Control-Allow-Origin") == (
            "http://localhost:3000"
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_local_api_validates_uploaded_yaml_text() -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        payload = json.dumps(
            {
                "pack_yaml": (
                    ROOT / "fixtures" / "dao_225.real.yaml"
                ).read_text("utf-8"),
                "website_ocr_yaml": (
                    ROOT / "fixtures" / "dao_225.website_ocr.yaml"
                ).read_text("utf-8"),
            }
        )
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "POST",
            "/api/validate",
            body=payload,
            headers={
                "Content-Type": "application/json",
                "Origin": "http://localhost:3000",
            },
        )
        response = connection.getresponse()
        report = json.loads(response.read())

        assert response.status == 200
        assert response.getheader("Access-Control-Allow-Origin") == (
            "http://localhost:3000"
        )
        assert report["summary"]["PASS"] == 13
        assert report["summary"]["FAIL"] == 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_local_api_rejects_missing_pack_yaml() -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "POST",
            "/api/validate",
            body="{}",
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        payload = json.loads(response.read())

        assert response.status == 400
        assert payload["error"] == "pack_yaml or pack_data is required"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_local_api_inspects_spec_for_image_mapping() -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        payload = json.dumps(
            {
                "pack_yaml": (
                    ROOT / "fixtures" / "dao_225.real.yaml"
                ).read_text("utf-8")
            }
        )
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "POST",
            "/api/inspect",
            body=payload,
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        result = json.loads(response.read())

        assert response.status == 200
        assert result["bundles"] == [
            {
                "bundle_id": 113711,
                "name": "เสว Sun : จุ่มเจเนต (ลด 40 %)",
                "seed_point": 590,
                "gsp_earn": 590,
                "purchase_limit": 10,
                "is_permanent": False,
                "items": [
                    {
                        "item_id": "Web-Currency",
                        "name": "Fellow Coin",
                        "amount": 1,
                    },
                    {
                        "item_id": "1315001",
                        "name": "Fellow Ticket",
                        "amount": 1,
                    },
                    {
                        "item_id": "Currency",
                        "name": "Gold",
                        "amount": 10,
                    },
                ],
            }
        ]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_local_api_accepts_reviewed_website_observation_json() -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        observation_document = yaml.safe_load(
            (
                ROOT / "fixtures" / "dao_225.website_ocr.yaml"
            ).read_text("utf-8")
        )
        payload = json.dumps(
            {
                "pack_yaml": (
                    ROOT / "fixtures" / "dao_225.real.yaml"
                ).read_text("utf-8"),
                "website_observations": observation_document["bundles"],
            }
        )
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "POST",
            "/api/validate",
            body=payload,
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        report = json.loads(response.read())

        assert response.status == 200
        assert report["summary"]["PASS"] == 13
        assert report["summary"]["FAIL"] == 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_local_api_accepts_pack_form_document() -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        payload = json.dumps(
            {
                "pack_data": {
                    "bundles": [
                        {
                            "bundle_id": 7001,
                            "spec": {
                                "name": "Form Pack",
                                "seed_point": 100,
                                "gsp_earn": 100,
                                "purchase_limit": 1,
                                "start_date": "2026-07-24",
                                "end_date": "2026-07-31",
                                "reset_type": "none",
                                "items": [
                                    {
                                        "item_id": "ITEM-1",
                                        "name": "Potion",
                                        "amount": 2,
                                    }
                                ],
                            },
                            "receipt": {
                                "items": [{"item_id": "ITEM-1"}]
                            },
                        }
                    ]
                }
            }
        )
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "POST",
            "/api/inspect",
            body=payload,
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        result = json.loads(response.read())

        assert response.status == 200
        assert result["bundles"][0]["bundle_id"] == 7001
        assert result["bundles"][0]["items"][0]["item_id"] == "ITEM-1"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_local_api_saves_lists_opens_and_deletes_history(tmp_path) -> None:
    server = make_server(
        "127.0.0.1",
        0,
        rules_path=ROOT / "pack_rules.yaml",
        history_path=tmp_path / "history.sqlite3",
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=5,
        )
        connection.request(
            "POST",
            "/api/history",
            body=json.dumps({"session": history_session()}),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        created = json.loads(response.read())
        assert response.status == 201
        entry_id = created["entry"]["id"]

        connection.request("GET", "/api/history")
        response = connection.getresponse()
        listed = json.loads(response.read())
        assert response.status == 200
        assert listed["entries"][0]["id"] == entry_id

        connection.request("GET", f"/api/history/{entry_id}")
        response = connection.getresponse()
        opened = json.loads(response.read())
        assert response.status == 200
        assert opened["session"]["kind"] == "pack-qa-pilot-session"

        connection.request("DELETE", f"/api/history/{entry_id}")
        response = connection.getresponse()
        assert response.status == 200
        assert json.loads(response.read()) == {"deleted": True}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
