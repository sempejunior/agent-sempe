"""SQLite implementation of ChannelBindingRepository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteChannelBindingRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def resolve_user(self, channel: str, sender_id: str) -> str | None:
        cursor = await self._db.execute(
            "SELECT user_id FROM channel_bindings WHERE channel = ? AND sender_id = ?",
            (channel, sender_id),
        )
        row = await cursor.fetchone()
        return row[0] if row else None

    async def resolve_agent(self, channel: str, sender_id: str) -> dict[str, str] | None:
        cursor = await self._db.execute(
            """SELECT user_id, agent_id FROM channel_bindings
               WHERE channel = ? AND sender_id = ?
               ORDER BY created_at DESC LIMIT 1""",
            (channel, sender_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def bind(self, user_id: str, channel: str, sender_id: str, agent_id: str | None = None) -> None:
        now = datetime.now().isoformat()
        if agent_id is None:
            cur = await self._db.execute(
                "SELECT agent_id FROM agents WHERE user_id = ? AND is_default = 1 LIMIT 1",
                (user_id,),
            )
            row = await cur.fetchone()
            agent_id = row[0] if row else f"{user_id}:default"
        await self._db.execute(
            """INSERT INTO channel_bindings (user_id, agent_id, channel, sender_id, verified, created_at)
               VALUES (?, ?, ?, ?, 1, ?)
               ON CONFLICT(agent_id, channel, sender_id)
               DO UPDATE SET user_id = excluded.user_id, verified = 1""",
            (user_id, agent_id, channel, sender_id, now),
        )
        await self._db.commit()

    async def unbind(self, user_id: str, channel: str, sender_id: str, agent_id: str | None = None) -> bool:
        agent_clause = "AND agent_id = ?" if agent_id else ""
        params = (user_id, channel, sender_id, agent_id) if agent_id else (user_id, channel, sender_id)
        cursor = await self._db.execute(
            f"DELETE FROM channel_bindings WHERE user_id = ? AND channel = ? AND sender_id = ? {agent_clause}",
            params,
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def list_bindings(self, user_id: str, agent_id: str | None = None) -> list[dict[str, Any]]:
        agent_clause = "AND agent_id = ?" if agent_id else ""
        params = (user_id, agent_id) if agent_id else (user_id,)
        cursor = await self._db.execute(
            f"SELECT * FROM channel_bindings WHERE user_id = ? {agent_clause} ORDER BY channel, sender_id",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
