"""SQLite implementation of RetrieverRepository using FTS5."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteRetrieverRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def ingest(self, user_id: str, content: str, metadata: dict[str, Any] | None = None) -> str:
        now = datetime.now().isoformat()
        metadata_json = json.dumps(metadata or {})
        cursor = await self._db.execute(
            "INSERT INTO rag_chunks (user_id, content, metadata, created_at) VALUES (?, ?, ?, ?)",
            (user_id, content, metadata_json, now),
        )
        await self._db.commit()
        return str(cursor.lastrowid)

    async def search(self, user_id: str, query: str, *, top_k: int = 5) -> list[dict[str, Any]]:
        try:
            cursor = await self._db.execute(
                """SELECT c.id, c.content, c.metadata, c.created_at, fts.rank AS relevance
                   FROM rag_chunks_fts fts
                   JOIN rag_chunks c ON c.id = fts.rowid
                   WHERE rag_chunks_fts MATCH ?
                     AND c.user_id = ?
                   ORDER BY fts.rank LIMIT ?""",
                (query, user_id, top_k),
            )
            return [dict(r) for r in await cursor.fetchall()]
        except aiosqlite.OperationalError:
            pattern = f"%{query}%"
            cursor = await self._db.execute(
                """SELECT id, content, metadata, created_at FROM rag_chunks
                   WHERE user_id = ? AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (user_id, pattern, top_k),
            )
            return [dict(r) for r in await cursor.fetchall()]

    async def delete(self, user_id: str, chunk_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM rag_chunks WHERE user_id = ? AND id = ?",
            (user_id, chunk_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def list_sources(self, user_id: str) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT json_extract(metadata, '$.source') AS source,
                      COUNT(*) AS chunk_count,
                      MIN(created_at) AS first_ingested
               FROM rag_chunks WHERE user_id = ?
               GROUP BY json_extract(metadata, '$.source')
               ORDER BY first_ingested DESC""",
            (user_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
