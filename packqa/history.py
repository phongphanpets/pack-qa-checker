"""Persistent validation history for the local Pack QA API."""

from __future__ import annotations

import json
import sqlite3
from hashlib import sha256
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class HistoryStore:
    """Store complete Pilot sessions and searchable summary metadata."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def save(self, session: dict[str, Any]) -> dict[str, Any]:
        if session.get("kind") != "pack-qa-pilot-session":
            raise ValueError("history session must be a Pack QA Pilot session")
        entry = _metadata(session)
        payload = json.dumps(session, ensure_ascii=False, separators=(",", ":"))
        entry["id"] = _fingerprint(session)
        entry["created_at"] = datetime.now(UTC).isoformat()
        with self._connect() as connection:
            _write_entry(
                connection,
                entry["id"],
                entry["created_at"],
                entry,
                payload,
                update_existing=True,
            )
        return entry

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        safe_limit = max(1, min(limit, 100))
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, created_at, title, bundle_count, pack_mode,
                       checks, pass_count, fail_count, warn_count,
                       unverifiable_count, evidence_count
                FROM validation_history
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [_row_metadata(row) for row in rows]

    def get(self, entry_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT session_json FROM validation_history WHERE id = ?",
                (entry_id,),
            ).fetchone()
        return json.loads(row["session_json"]) if row else None

    def delete(self, entry_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM validation_history WHERE id = ?",
                (entry_id,),
            )
        return cursor.rowcount > 0

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS validation_history (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    title TEXT NOT NULL,
                    bundle_count INTEGER NOT NULL,
                    pack_mode TEXT NOT NULL,
                    checks INTEGER NOT NULL,
                    pass_count INTEGER NOT NULL,
                    fail_count INTEGER NOT NULL,
                    warn_count INTEGER NOT NULL,
                    unverifiable_count INTEGER NOT NULL,
                    evidence_count INTEGER NOT NULL,
                    session_json TEXT NOT NULL
                )
                """
            )
            _compact_duplicates(connection)
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS validation_history_created_idx
                ON validation_history (created_at DESC)
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection


def _metadata(session: dict[str, Any]) -> dict[str, Any]:
    report = session.get("report")
    summary = report.get("summary", {}) if isinstance(report, dict) else {}
    spec_bundles = session.get("spec_bundles")
    bundles = spec_bundles if isinstance(spec_bundles, list) else []
    title = _title(session, bundles)
    evidence = session.get("evidence")
    evidence_count = 0
    if isinstance(evidence, dict):
        evidence_count += int(bool(evidence.get("spec")))
        evidence_count += int(bool(evidence.get("aztek")))
        for key in ("website", "receipt"):
            values = evidence.get(key)
            if isinstance(values, list):
                evidence_count += len(values)
    return {
        "title": title,
        "bundle_count": _integer(summary.get("bundles"), len(bundles)),
        "pack_mode": str(session.get("pack_mode") or "excel"),
        "checks": _integer(summary.get("checks")),
        "PASS": _integer(summary.get("PASS")),
        "FAIL": _integer(summary.get("FAIL")),
        "WARN": _integer(summary.get("WARN")),
        "UNVERIFIABLE": _integer(summary.get("UNVERIFIABLE")),
        "evidence_count": evidence_count,
    }


def _title(session: dict[str, Any], bundles: list[Any]) -> str:
    if bundles and isinstance(bundles[0], dict):
        name = bundles[0].get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()
    pack_data = session.get("pack_data")
    if isinstance(pack_data, dict):
        values = pack_data.get("bundles")
        if isinstance(values, list) and values and isinstance(values[0], dict):
            spec = values[0].get("spec")
            if isinstance(spec, dict):
                name = spec.get("name")
                if isinstance(name, dict):
                    name = name.get("value")
                if isinstance(name, str) and name.strip():
                    return name.strip()
    return "งานตรวจ Pack QA"


def _integer(value: Any, fallback: int = 0) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else fallback


def _row_metadata(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "title": row["title"],
        "bundle_count": row["bundle_count"],
        "pack_mode": row["pack_mode"],
        "checks": row["checks"],
        "PASS": row["pass_count"],
        "FAIL": row["fail_count"],
        "WARN": row["warn_count"],
        "UNVERIFIABLE": row["unverifiable_count"],
        "evidence_count": row["evidence_count"],
    }


def _fingerprint(session: dict[str, Any]) -> str:
    stable = _without_volatile_timestamps(session)
    payload = json.dumps(
        stable,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(payload.encode("utf-8")).hexdigest()[:32]


def _without_volatile_timestamps(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_volatile_timestamps(item)
            for key, item in value.items()
            if key not in {"saved_at", "generated_at", "exported_at"}
        }
    if isinstance(value, list):
        return [_without_volatile_timestamps(item) for item in value]
    return value


def _compact_duplicates(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        """
        SELECT id, created_at, session_json
        FROM validation_history
        ORDER BY created_at DESC
        """
    ).fetchall()
    latest: dict[str, tuple[str, dict[str, Any], str]] = {}
    changed = False
    for row in rows:
        try:
            session = json.loads(row["session_json"])
        except (json.JSONDecodeError, TypeError):
            continue
        fingerprint = _fingerprint(session)
        if fingerprint in latest:
            changed = True
            continue
        latest[fingerprint] = (
            row["created_at"],
            session,
            row["session_json"],
        )
        if row["id"] != fingerprint:
            changed = True
    if not changed:
        return
    connection.execute("DELETE FROM validation_history")
    for fingerprint, (created_at, session, payload) in latest.items():
        _write_entry(
            connection,
            fingerprint,
            created_at,
            _metadata(session),
            payload,
            update_existing=False,
        )


def _write_entry(
    connection: sqlite3.Connection,
    entry_id: str,
    created_at: str,
    entry: dict[str, Any],
    payload: str,
    *,
    update_existing: bool,
) -> None:
    conflict = (
        """
        ON CONFLICT(id) DO UPDATE SET
            created_at = excluded.created_at,
            session_json = excluded.session_json
        """
        if update_existing
        else ""
    )
    connection.execute(
        f"""
        INSERT INTO validation_history (
            id, created_at, title, bundle_count, pack_mode,
            checks, pass_count, fail_count, warn_count,
            unverifiable_count, evidence_count, session_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        {conflict}
        """,
        (
            entry_id,
            created_at,
            entry["title"],
            entry["bundle_count"],
            entry["pack_mode"],
            entry["checks"],
            entry["PASS"],
            entry["FAIL"],
            entry["WARN"],
            entry["UNVERIFIABLE"],
            entry["evidence_count"],
            payload,
        ),
    )
