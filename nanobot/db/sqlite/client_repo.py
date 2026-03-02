"""SQLite implementation of ClientRepository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite

ALLOWED_UPDATE_FIELDS = frozenset({
    "display_name", "metadata", "status", "total_interactions",
    "first_seen", "last_seen", "updated_at",
})


class SQLiteClientRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def get(self, client_id: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM clients WHERE client_id = ?", (client_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def create(self, client: dict[str, Any]) -> str:
        client_id = client["client_id"]
        now = datetime.now().isoformat()
        await self._db.execute(
            """INSERT INTO clients
               (client_id, owner_id, display_name, metadata, first_seen, last_seen,
                total_interactions, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                client_id,
                client["owner_id"],
                client.get("display_name", ""),
                client.get("metadata", "{}"),
                client.get("first_seen", now),
                client.get("last_seen", now),
                client.get("total_interactions", 0),
                client.get("status", "active"),
                now,
                now,
            ),
        )
        await self._db.commit()
        return client_id

    async def update(self, client_id: str, fields: dict[str, Any]) -> bool:
        if not fields:
            return False
        invalid = set(fields) - ALLOWED_UPDATE_FIELDS
        if invalid:
            raise ValueError(f"Invalid update fields: {invalid}")
        fields["updated_at"] = datetime.now().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [client_id]
        cursor = await self._db.execute(
            f"UPDATE clients SET {set_clause} WHERE client_id = ?",
            values,
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def delete(self, client_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM clients WHERE client_id = ?", (client_id,)
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def list_by_owner(
        self, owner_id: str, *, status: str | None = None,
        query: str | None = None, limit: int = 50, offset: int = 0,
        sort: str = "last_seen",
    ) -> list[dict[str, Any]]:
        conditions = ["owner_id = ?"]
        params: list[Any] = [owner_id]

        if status:
            conditions.append("status = ?")
            params.append(status)

        if query:
            conditions.append("(display_name LIKE ? OR metadata LIKE ?)")
            pattern = f"%{query}%"
            params.extend([pattern, pattern])

        sort_map = {
            "last_seen": "last_seen DESC",
            "recent": "last_seen DESC",
            "first_seen": "first_seen ASC",
            "interactions": "total_interactions DESC",
        }
        order = sort_map.get(sort, "last_seen DESC")

        where = " AND ".join(conditions)
        params.extend([limit, offset])
        cursor = await self._db.execute(
            f"""SELECT * FROM clients WHERE {where}
                ORDER BY {order} LIMIT ? OFFSET ?""",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def count_by_owner(
        self, owner_id: str, *, status: str | None = None, query: str | None = None,
    ) -> int:
        conditions = ["owner_id = ?"]
        params: list[Any] = [owner_id]
        if status:
            conditions.append("status = ?")
            params.append(status)
        if query:
            conditions.append("(display_name LIKE ? OR metadata LIKE ?)")
            pattern = f"%{query}%"
            params.extend([pattern, pattern])
        where = " AND ".join(conditions)
        cursor = await self._db.execute(
            f"SELECT COUNT(*) FROM clients WHERE {where}", params,
        )
        row = await cursor.fetchone()
        return row[0] if row else 0

    async def touch(self, client_id: str) -> None:
        now = datetime.now().isoformat()
        await self._db.execute(
            """UPDATE clients
               SET last_seen = ?, total_interactions = total_interactions + 1, updated_at = ?
               WHERE client_id = ?""",
            (now, now, client_id),
        )
        await self._db.commit()
