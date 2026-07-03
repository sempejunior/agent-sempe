"""SQLite implementation of RetrieverRepository using FTS5."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteRetrieverRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    def _agent_clause(self, agent_id: str | None) -> tuple[str, tuple[Any, ...]]:
        return (" AND agent_id = ?", (agent_id,)) if agent_id else ("", ())

    async def ingest(
        self, user_id: str, content: str, metadata: dict[str, Any] | None = None,
        agent_id: str | None = None,
    ) -> str:
        now = datetime.now().isoformat()
        metadata_json = json.dumps(metadata or {})
        cursor = await self._db.execute(
            "INSERT INTO rag_chunks (user_id, agent_id, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, agent_id, content, metadata_json, now),
        )
        await self._db.commit()
        return str(cursor.lastrowid)

    async def search(
        self, user_id: str, query: str, *, top_k: int = 5, agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        clause, extra = self._agent_clause(agent_id)
        try:
            cursor = await self._db.execute(
                f"""SELECT c.id, c.content, c.metadata, c.created_at, fts.rank AS relevance
                   FROM rag_chunks_fts fts
                   JOIN rag_chunks c ON c.id = fts.rowid
                   WHERE rag_chunks_fts MATCH ?
                     AND c.user_id = ?{clause}
                   ORDER BY fts.rank LIMIT ?""",
                (query, user_id, *extra, top_k),
            )
            return [dict(r) for r in await cursor.fetchall()]
        except aiosqlite.OperationalError:
            pattern = f"%{query}%"
            cursor = await self._db.execute(
                f"""SELECT id, content, metadata, created_at FROM rag_chunks
                   WHERE user_id = ?{clause} AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (user_id, *extra, pattern, top_k),
            )
            return [dict(r) for r in await cursor.fetchall()]

    async def delete(self, user_id: str, chunk_id: str, agent_id: str | None = None) -> bool:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"DELETE FROM rag_chunks WHERE user_id = ?{clause} AND id = ?",
            (user_id, *extra, chunk_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def list_sources(self, user_id: str, agent_id: str | None = None) -> list[dict[str, Any]]:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"""SELECT json_extract(metadata, '$.source') AS source,
                      COUNT(*) AS chunk_count,
                      MIN(created_at) AS first_ingested
               FROM rag_chunks WHERE user_id = ?{clause}
               GROUP BY json_extract(metadata, '$.source')
               ORDER BY first_ingested DESC""",
            (user_id, *extra),
        )
        return [dict(r) for r in await cursor.fetchall()]
