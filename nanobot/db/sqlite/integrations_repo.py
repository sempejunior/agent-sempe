"""SQLite implementation of IntegrationRepository."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import aiosqlite


def _row_to_dict(row: aiosqlite.Row) -> dict[str, Any]:
    d = dict(row)
    if "config" in d and isinstance(d["config"], str):
        d["config"] = json.loads(d["config"])
    d["enabled"] = bool(d.get("enabled", 0))
    return d


class SQLiteIntegrationRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def list_integrations(
        self, user_id: str, kind: str | None = None, enabled_only: bool = False,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM user_integrations WHERE user_id = ?"
        params: list[Any] = [user_id]
        if kind:
            query += " AND kind = ?"
            params.append(kind)
        if enabled_only:
            query += " AND enabled = 1"
        query += " ORDER BY label, slug"
        cursor = await self._db.execute(query, params)
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]

    async def get_integration(self, user_id: str, slug: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM user_integrations WHERE user_id = ? AND slug = ?",
            (user_id, slug),
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def get_by_id(self, user_id: str, integration_id: int) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM user_integrations WHERE user_id = ? AND id = ?",
            (user_id, integration_id),
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def upsert(self, integration: dict[str, Any]) -> int:
        now = datetime.now().isoformat()
        existing = await self.get_integration(integration["user_id"], integration["slug"])
        config_json = json.dumps(integration.get("config", {}))
        if existing:
            await self._db.execute(
                """UPDATE user_integrations SET
                   kind = ?, system_integration_id = ?, label = ?, enabled = ?,
                   credential_id = ?, config = ?, updated_at = ?
                   WHERE user_id = ? AND slug = ?""",
                (
                    integration.get("kind", existing["kind"]),
                    integration.get("system_integration_id"),
                    integration.get("label", existing.get("label", "")),
                    1 if integration.get("enabled", True) else 0,
                    integration.get("credential_id"),
                    config_json,
                    now,
                    integration["user_id"],
                    integration["slug"],
                ),
            )
            await self._db.commit()
            return existing["id"]
        cursor = await self._db.execute(
            """INSERT INTO user_integrations
               (user_id, kind, slug, system_integration_id, label, enabled,
                credential_id, config, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                integration["user_id"],
                integration["kind"],
                integration["slug"],
                integration.get("system_integration_id"),
                integration.get("label", ""),
                1 if integration.get("enabled", True) else 0,
                integration.get("credential_id"),
                config_json,
                now,
                now,
            ),
        )
        await self._db.commit()
        return cursor.lastrowid or 0

    async def delete(self, user_id: str, slug: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM user_integrations WHERE user_id = ? AND slug = ?",
            (user_id, slug),
        )
        await self._db.commit()
        return cursor.rowcount > 0
