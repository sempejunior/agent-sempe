"""SQLite implementation of DeliverableRepository.

Records that a page was published, not the page itself: the HTML lives under
``<workspace>/reports/<token>.html`` and the token remains the access control.
"""

from __future__ import annotations

from typing import Any

import aiosqlite


class SQLiteDeliverableRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def record(
        self, user_id: str, *, kind: str, title: str, url: str, token: str,
        agent_id: str = "", origin_channel: str = "", origin_chat_id: str = "",
    ) -> dict[str, Any] | None:
        await self._db.execute(
            """INSERT INTO deliverables
                   (user_id, agent_id, kind, title, url, token,
                    origin_channel, origin_chat_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(token) DO NOTHING""",
            (user_id, agent_id, kind, title, url, token,
             origin_channel, origin_chat_id),
        )
        await self._db.commit()
        cursor = await self._db.execute(
            "SELECT * FROM deliverables WHERE token = ?", (token,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_deliverables(
        self, user_id: str, *, limit: int = 50,
    ) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT * FROM deliverables WHERE user_id = ?
                ORDER BY created_at DESC, id DESC LIMIT ?""",
            (user_id, limit),
        )
        return [dict(row) for row in await cursor.fetchall()]
