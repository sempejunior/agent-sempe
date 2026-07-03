"""SQLite implementation of MemoryRepository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteMemoryRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    def _agent_clause(self, agent_id: str | None) -> tuple[str, tuple[Any, ...]]:
        return (" AND agent_id = ?", (agent_id,)) if agent_id else ("", ())

    async def get_long_term(self, user_id: str, agent_id: str | None = None) -> str:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"SELECT content FROM memories WHERE user_id = ?{clause} AND type = 'long_term' LIMIT 1",
            (user_id, *extra),
        )
        row = await cursor.fetchone()
        return row[0] if row else ""

    async def save_long_term(self, user_id: str, content: str, agent_id: str | None = None) -> None:
        now = datetime.now().isoformat()
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"SELECT id FROM memories WHERE user_id = ?{clause} AND type = 'long_term' LIMIT 1",
            (user_id, *extra),
        )
        existing = await cursor.fetchone()

        if existing:
            await self._db.execute(
                "UPDATE memories SET content = ?, updated_at = ? WHERE id = ?",
                (content, now, existing[0]),
            )
        else:
            await self._db.execute(
                "INSERT INTO memories (user_id, agent_id, type, content, created_at, updated_at) VALUES (?, ?, 'long_term', ?, ?, ?)",
                (user_id, agent_id, content, now, now),
            )
        await self._db.commit()

    async def append_history(self, user_id: str, entry: str, agent_id: str | None = None) -> None:
        now = datetime.now().isoformat()
        await self._db.execute(
            "INSERT INTO memories (user_id, agent_id, type, content, created_at, updated_at) VALUES (?, ?, 'history', ?, ?, ?)",
            (user_id, agent_id, entry.rstrip(), now, now),
        )
        await self._db.commit()

    async def get_history(self, user_id: str, limit: int = 100, agent_id: str | None = None) -> list[dict[str, Any]]:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"""SELECT id, content, created_at FROM memories
               WHERE user_id = ?{clause} AND type = 'history'
               ORDER BY created_at DESC LIMIT ?""",
            (user_id, *extra, limit),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def search_history(
        self, user_id: str, query: str, limit: int = 50, agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        clause, extra = self._agent_clause(agent_id)
        try:
            cursor = await self._db.execute(
                f"""SELECT m.id, m.content, m.created_at, fts.rank AS relevance
                   FROM memories_fts fts
                   JOIN memories m ON m.id = fts.rowid
                   WHERE memories_fts MATCH ?
                     AND m.user_id = ?{clause} AND m.type = 'history'
                   ORDER BY fts.rank LIMIT ?""",
                (query, user_id, *extra, limit),
            )
            return [dict(r) for r in await cursor.fetchall()]
        except Exception:
            pattern = f"%{query}%"
            cursor = await self._db.execute(
                f"""SELECT id, content, created_at FROM memories
                   WHERE user_id = ?{clause} AND type = 'history' AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (user_id, *extra, pattern, limit),
            )
            return [dict(r) for r in await cursor.fetchall()]

    async def delete_history(self, user_id: str, entry_id: int, agent_id: str | None = None) -> bool:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"DELETE FROM memories WHERE user_id = ?{clause} AND id = ? AND type = 'history'",
            (user_id, *extra, entry_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def clear_history(self, user_id: str, agent_id: str | None = None) -> int:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"DELETE FROM memories WHERE user_id = ?{clause} AND type = 'history'",
            (user_id, *extra),
        )
        await self._db.commit()
        return cursor.rowcount
