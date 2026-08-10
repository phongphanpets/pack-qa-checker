"""Local-only HTTP API for the Phase 1 intranet interface."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from packqa.adapters import (
    apply_website_observations,
    load_bundles_document,
    load_bundles_text,
    load_website_observations_text,
)
from packqa.adapters.website_ocr import WebsiteObservation
from packqa.reporting import build_report
from packqa.rules import RuleEngine
from packqa.history import HistoryStore

_MAX_REQUEST_BYTES = 32 * 1024 * 1024
_LOCAL_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}


def make_server(
    host: str = "127.0.0.1",
    port: int = 8765,
    *,
    rules_path: str | Path = "pack_rules.yaml",
    history_path: str | Path = "data/packqa_history.sqlite3",
) -> ThreadingHTTPServer:
    engine = RuleEngine.from_yaml(rules_path)
    history = HistoryStore(history_path)

    class ValidationHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/health":
                self._json(
                    200,
                    {
                        "status": "ok",
                        "app": "pack-qa",
                        "stage": "pilot",
                    },
                )
                return
            if parsed.path == "/api/history":
                raw_limit = parse_qs(parsed.query).get("limit", ["50"])[0]
                try:
                    limit = int(raw_limit)
                except ValueError:
                    limit = 50
                self._json(200, {"entries": history.list(limit)})
                return
            entry_id = _history_id(parsed.path)
            if entry_id:
                session = history.get(entry_id)
                if session is None:
                    self._json(404, {"error": "History entry not found"})
                else:
                    self._json(200, {"session": session})
                return
            self._json(404, {"error": "Not found"})

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._cors_headers()
            self.send_header(
                "Access-Control-Allow-Methods",
                "GET, POST, DELETE, OPTIONS",
            )
            self.send_header(
                "Access-Control-Allow-Headers", "Content-Type"
            )
            self.end_headers()

        def do_POST(self) -> None:
            if self.path == "/api/history":
                try:
                    payload = self._payload()
                    session = payload.get("session")
                    if not isinstance(session, dict):
                        raise ValueError("session is required")
                    self._json(201, {"entry": history.save(session)})
                except (json.JSONDecodeError, TypeError, ValueError) as error:
                    self._json(400, {"error": str(error)})
                return
            if self.path not in {"/api/inspect", "/api/validate"}:
                self._json(404, {"error": "Not found"})
                return

            try:
                payload = self._payload()
                pack_yaml = payload.get("pack_yaml")
                pack_data = payload.get("pack_data")
                if isinstance(pack_yaml, str) and pack_yaml.strip():
                    bundles = load_bundles_text(
                        pack_yaml,
                        source_name="uploaded pack YAML",
                    )
                elif isinstance(pack_data, dict):
                    bundles = load_bundles_document(
                        pack_data,
                        source_name="web form",
                    )
                else:
                    raise ValueError("pack_yaml or pack_data is required")
                if self.path == "/api/inspect":
                    self._json(
                        200,
                        {
                            "bundles": [
                                _spec_snapshot(bundle) for bundle in bundles
                            ]
                        },
                    )
                    return

                website_yaml = payload.get("website_ocr_yaml")
                if isinstance(website_yaml, str) and website_yaml.strip():
                    bundles = apply_website_observations(
                        bundles,
                        load_website_observations_text(
                            website_yaml,
                            source_name="uploaded Website OCR YAML",
                        ),
                    )
                website_json = payload.get("website_observations")
                if website_json is not None:
                    bundles = apply_website_observations(
                        bundles,
                        _website_observations_from_json(website_json),
                    )
                report = build_report(engine, bundles)
                self._json(200, report.model_dump(mode="json"))
            except (
                json.JSONDecodeError,
                TypeError,
                ValueError,
            ) as error:
                self._json(400, {"error": str(error)})

        def do_DELETE(self) -> None:
            entry_id = _history_id(urlparse(self.path).path)
            if not entry_id:
                self._json(404, {"error": "Not found"})
                return
            if history.delete(entry_id):
                self._json(200, {"deleted": True})
            else:
                self._json(404, {"error": "History entry not found"})

        def _payload(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > _MAX_REQUEST_BYTES:
                raise ValueError("Request must be between 1 byte and 8 MB")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Request body must be a JSON object")
            return payload

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(
                payload,
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(status)
            self._cors_headers()
            self.send_header(
                "Content-Type",
                "application/json; charset=utf-8",
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _cors_headers(self) -> None:
            origin = self.headers.get("Origin")
            if origin in _LOCAL_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

    return ThreadingHTTPServer((host, port), ValidationHandler)


def _spec_snapshot(bundle: Any) -> dict[str, Any]:
    spec = bundle.spec
    return {
        "bundle_id": bundle.bundle_id,
        "name": spec.name.value,
        "seed_point": spec.seed_point.value,
        "gsp_earn": spec.gsp_earn.value,
        "purchase_limit": spec.purchase_limit.value,
        "is_permanent": (
            spec.is_permanent.value
            if spec.is_permanent and spec.is_permanent.is_verifiable
            else False
        ),
        "items": [
            {
                "item_id": item.item_id.value,
                "name": item.name.value,
                "amount": item.amount.value,
            }
            for item in spec.items
        ],
    }


def _history_id(path: str) -> str | None:
    prefix = "/api/history/"
    if not path.startswith(prefix):
        return None
    value = path[len(prefix):]
    return value if value and "/" not in value else None


def _website_observations_from_json(
    raw: Any,
) -> dict[int, WebsiteObservation]:
    if not isinstance(raw, list):
        raise ValueError("website_observations must be a list")

    observations: dict[int, WebsiteObservation] = {}
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(
                f"website_observations[{index}] must be an object"
            )
        try:
            bundle_id = int(item["bundle_id"])
            observation = WebsiteObservation.model_validate(item["website"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(
                f"invalid website_observations[{index}]"
            ) from error
        if bundle_id in observations:
            raise ValueError(f"duplicate Website bundle_id {bundle_id}")
        observations[bundle_id] = observation
    return observations


def serve(
    host: str = "127.0.0.1",
    port: int = 8765,
    *,
    rules_path: str | Path = "pack_rules.yaml",
) -> None:
    server = make_server(host, port, rules_path=rules_path)
    print(f"Pack QA local API listening on http://{host}:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
