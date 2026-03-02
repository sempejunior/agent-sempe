"""SQLite implementation of ClientMemoryRepository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteClientMemoryRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def get_long_term(self, client_id: str) -> str:
        cursor = await self._db.execute(
            "SELECT content FROM client_memories WHERE client_id = ? AND type = 'long_term' LIMIT 1",
            (client_id,),
        )
        row = await cursor.fetchone()
        return row[0] if row else ""

    async def save_long_term(self, client_id: str, owner_id: str, content: str) -> None:
        now = datetime.now().isoformat()
        cursor = await self._db.execute(
            "SELECT id FROM client_memories WHERE client_id = ? AND type = 'long_term' LIMIT 1",
            (client_id,),
        )
        existing = await cursor.fetchone()

        if existing:
            await self._db.execute(
                "UPDATE client_memories SET content = ?, updated_at = ? WHERE id = ?",
                (content, now, existing[0]),
            )
        else:
            await self._db.execute(
                """INSERT INTO client_memories
                   (client_id, owner_id, type, content, created_at, updated_at)
                   VALUES (?, ?, 'long_term', ?, ?, ?)""",
                (client_id, owner_id, content, now, now),
            )
        await self._db.commit()

    async def append_history(self, client_id: str, owner_id: str, entry: str) -> None:
        now = datetime.now().isoformat()
        await self._db.execute(
            """INSERT INTO client_memories
               (client_id, owner_id, type, content, created_at, updated_at)
               VALUES (?, ?, 'history', ?, ?, ?)""",
            (client_id, owner_id, entry.rstrip(), now, now),
        )
        await self._db.commit()

    async def get_history(self, client_id: str, limit: int = 100) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT id, content, created_at FROM client_memories
               WHERE client_id = ? AND type = 'history'
               ORDER BY created_at DESC LIMIT ?""",
            (client_id, limit),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def search_history(self, client_id: str, query: str, limit: int = 50) -> list[dict[str, Any]]:
        try:
            cursor = await self._db.execute(
                """SELECT m.id, m.content, m.created_at, fts.rank AS relevance
                   FROM client_memories_fts fts
                   JOIN client_memories m ON m.id = fts.rowid
                   WHERE client_memories_fts MATCH ?
                     AND m.client_id = ? AND m.type = 'history'
                   ORDER BY fts.rank LIMIT ?""",
                (query, client_id, limit),
            )
            return [dict(r) for r in await cursor.fetchall()]
        except Exception:
            pattern = f"%{query}%"
            cursor = await self._db.execute(
                """SELECT id, content, created_at FROM client_memories
                   WHERE client_id = ? AND type = 'history' AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (client_id, pattern, limit),
            )
            return [dict(r) for r in await cursor.fetchall()]

    async def delete_entry(self, entry_id: int, client_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM client_memories WHERE id = ? AND client_id = ?",
            (entry_id, client_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def clear(self, client_id: str) -> int:
        cursor = await self._db.execute(
            "DELETE FROM client_memories WHERE client_id = ?", (client_id,)
        )
        await self._db.commit()
        return cursor.rowcount

    async def reassign(self, from_client_id: str, to_client_id: str) -> int:
        cursor = await self._db.execute(
            "UPDATE client_memories SET client_id = ? WHERE client_id = ?",
            (to_client_id, from_client_id),
        )
        await self._db.commit()
        return cursor.rowcount
