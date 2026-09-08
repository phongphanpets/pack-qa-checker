"""Local request intake, lifecycle history, and Discord webhook notification."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


STATUSES = (
    "NEW",
    "AI_PROCESSING",
    "REVIEW",
    "READY_TO_IMPORT",
    "IMPORTED",
    "FAILED",
)


class RequestStore:
    """Persist request metadata separately from Pack QA validation sessions."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        request_type = _choice(payload.get("request_type"), {"WEB_SHOP", "ITEM_CODE"}, "request_type")
        webshop_type = _choice(payload.get("webshop_type"), {"NORMAL", "RANDOM", None}, "webshop_type")
        if request_type == "WEB_SHOP" and webshop_type is None:
            raise ValueError("webshop_type is required for WEB_SHOP")
        title = _text(payload.get("title"), "title")
        source_text = str(payload.get("source_text") or "")
        fixed_rewards = bool(payload.get("fixed_rewards"))
        now = _now()
        entry = {
            "id": uuid.uuid4().hex[:12].upper(),
            "created_at": now,
            "updated_at": now,
            "title": title,
            "request_type": request_type,
            "webshop_type": webshop_type,
            "fixed_rewards": fixed_rewards,
            "status": "NEW",
            "requester": str(payload.get("requester") or "GP"),
            "source_text": source_text,
            "payload": payload.get("payload") if isinstance(payload.get("payload"), dict) else {},
            "notification_status": "PENDING",
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO import_requests (
                  id, created_at, updated_at, title, request_type, webshop_type,
                  fixed_rewards, status, requester, source_text, payload_json,
                  notification_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry["id"], entry["created_at"], entry["updated_at"], entry["title"],
                    entry["request_type"], entry["webshop_type"], int(entry["fixed_rewards"]),
                    entry["status"], entry["requester"], entry["source_text"],
                    json.dumps(entry["payload"], ensure_ascii=False), entry["notification_status"],
                ),
            )
        return entry

    def list(self, limit: int = 100) -> list[dict[str, Any]]:
        safe_limit = max(1, min(limit, 200))
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT id, created_at, updated_at, title, request_type, webshop_type,
                   fixed_rewards, status, requester, source_text, payload_json,
                   notification_status FROM import_requests ORDER BY updated_at DESC LIMIT ?""",
                (safe_limit,),
            ).fetchall()
        return [_row(row, include_source=False) for row in rows]

    def get(self, request_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM import_requests WHERE id = ?", (request_id,)
            ).fetchone()
        return _row(row, include_source=True) if row else None

    def update_status(self, request_id: str, status: str) -> dict[str, Any] | None:
        if status not in STATUSES:
            raise ValueError("invalid request status")
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE import_requests SET status = ?, updated_at = ? WHERE id = ?",
                (status, _now(), request_id),
            )
        return self.get(request_id) if cursor.rowcount else None

    def mark_notification(self, request_id: str, status: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE import_requests SET notification_status = ?, updated_at = ? WHERE id = ?",
                (status, _now(), request_id),
            )

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS import_requests (
                  id TEXT PRIMARY KEY,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  title TEXT NOT NULL,
                  request_type TEXT NOT NULL,
                  webshop_type TEXT,
                  fixed_rewards INTEGER NOT NULL DEFAULT 0,
                  status TEXT NOT NULL,
                  requester TEXT NOT NULL,
                  source_text TEXT NOT NULL DEFAULT '',
                  payload_json TEXT NOT NULL DEFAULT '{}',
                  notification_status TEXT NOT NULL DEFAULT 'PENDING'
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS import_requests_updated_idx ON import_requests (updated_at DESC)"
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection


def notify_discord(entry: dict[str, Any], *, event: str) -> str:
    """Send non-sensitive lifecycle metadata when a webhook is configured."""
    webhook_url = os.environ.get("PACK_QA_DISCORD_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return "NOT_CONFIGURED"
    content = (
        f"**{event}**\n"
        f"`{entry['id']}` · {entry['title']}\n"
        f"Type: {entry['request_type']} · Status: {entry['status']}"
    )
    request = Request(
        webhook_url,
        data=json.dumps({"content": content}, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            return "SENT" if 200 <= response.status < 300 else "FAILED"
    except (URLError, OSError):
        return "FAILED"


def _row(row: sqlite3.Row, *, include_source: bool) -> dict[str, Any]:
    value = {
        "id": row["id"], "created_at": row["created_at"], "updated_at": row["updated_at"],
        "title": row["title"], "request_type": row["request_type"],
        "webshop_type": row["webshop_type"], "fixed_rewards": bool(row["fixed_rewards"]),
        "status": row["status"], "requester": row["requester"],
        "payload": json.loads(row["payload_json"]), "notification_status": row["notification_status"],
    }
    if include_source:
        value["source_text"] = row["source_text"]
    return value


def _choice(value: Any, choices: set[str | None], name: str) -> str | None:
    normalized = str(value).strip().upper() if value is not None else None
    if normalized not in choices:
        raise ValueError(f"invalid {name}")
    return normalized


def _text(value: Any, name: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise ValueError(f"{name} is required")
    return result[:200]


def _now() -> str:
    return datetime.now(UTC).isoformat()
