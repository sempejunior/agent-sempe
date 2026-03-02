"""SQLite implementation of ClientIdentityRepository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteClientIdentityRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def lookup(self, owner_id: str, channel: str, external_id: str) -> str | None:
        cursor = await self._db.execute(
            """SELECT client_id FROM client_identities
               WHERE owner_id = ? AND channel = ? AND external_id = ?""",
            (owner_id, channel, external_id),
        )
        row = await cursor.fetchone()
        return row[0] if row else None

    async def create(self, identity: dict[str, Any]) -> int:
        now = datetime.now().isoformat()
        cursor = await self._db.execute(
            """INSERT INTO client_identities
               (client_id, owner_id, channel, external_id, display_name, verified, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                identity["client_id"],
                identity["owner_id"],
                identity["channel"],
                identity["external_id"],
                identity.get("display_name", ""),
                identity.get("verified", 1),
                now,
            ),
        )
        await self._db.commit()
        return cursor.lastrowid or 0

    async def delete(self, identity_id: int, client_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM client_identities WHERE id = ? AND client_id = ?",
            (identity_id, client_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def list_by_client(self, client_id: str) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            "SELECT * FROM client_identities WHERE client_id = ? ORDER BY created_at",
            (client_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def reassign(self, from_client_id: str, to_client_id: str) -> int:
        cursor = await self._db.execute(
            "UPDATE client_identities SET client_id = ? WHERE client_id = ?",
            (to_client_id, from_client_id),
        )
        await self._db.commit()
        return cursor.rowcount
