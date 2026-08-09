"""SQLite implementation of SessionRepository and MessageRepository."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import aiosqlite


def _row_to_dict(row: aiosqlite.Row) -> dict[str, Any]:
    d = dict(row)
    if "metadata" in d and isinstance(d["metadata"], str):
        d["metadata"] = json.loads(d["metadata"])
    return d


class SQLiteSessionRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def get(self, user_id: str, session_key: str, agent_id: str | None = None) -> dict[str, Any] | None:
        if agent_id:
            cursor = await self._db.execute(
                "SELECT * FROM sessions WHERE user_id = ? AND agent_id = ? AND session_key = ?",
                (user_id, agent_id, session_key),
            )
        else:
            cursor = await self._db.execute(
                "SELECT * FROM sessions WHERE user_id = ? AND session_key = ?",
                (user_id, session_key),
            )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def get_by_id(self, session_id: int) -> dict[str, Any] | None:
        cursor = await self._db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def save(self, session: dict[str, Any]) -> int:
        """Upsert session. Returns the row id."""
        user_id = session["user_id"]
        session_key = session["session_key"]
        agent_id = session.get("agent_id")
        client_id = session.get("client_id")
        now = datetime.now().isoformat()
        metadata = session.get("metadata", {})
        if not isinstance(metadata, str):
            metadata = json.dumps(metadata)

        await self._db.execute(
            """INSERT INTO sessions (user_id, agent_id, session_key, client_id, last_consolidated,
                                     message_count, status, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, session_key)
               DO UPDATE SET
                   agent_id = COALESCE(excluded.agent_id, agent_id),
                   client_id = COALESCE(excluded.client_id, client_id),
                   last_consolidated = excluded.last_consolidated,
                   message_count = excluded.message_count,
                   status = excluded.status,
                   metadata = excluded.metadata,
                   updated_at = excluded.updated_at""",
            (
                user_id,
                agent_id,
                session_key,
                client_id,
                session.get("last_consolidated", 0),
                session.get("message_count", 0),
                session.get("status", "active"),
                metadata,
                session.get("created_at", now),
                now,
            ),
        )
        await self._db.commit()

        cur2 = await self._db.execute(
            "SELECT id FROM sessions WHERE user_id = ? AND session_key = ?",
            (user_id, session_key),
        )
        row = await cur2.fetchone()
        return row[0] if row else 0

    async def list_sessions(
        self, user_id: str, status: str = "active", client_id: str | None = None,
        agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if client_id:
            agent_clause = "AND agent_id = ?" if agent_id else ""
            params: tuple[Any, ...] = (user_id, client_id, agent_id, status) if agent_id else (user_id, client_id, status)
            cursor = await self._db.execute(
                f"""SELECT id, user_id, agent_id, session_key, client_id, message_count,
                          status, created_at, updated_at
                   FROM sessions
                   WHERE user_id = ? AND client_id = ? {agent_clause} AND status = ?
                   ORDER BY updated_at DESC""",
                params,
            )
        else:
            agent_clause = "AND agent_id = ?" if agent_id else ""
            params = (user_id, agent_id, status) if agent_id else (user_id, status)
            cursor = await self._db.execute(
                f"""SELECT id, user_id, agent_id, session_key, message_count,
                          status, created_at, updated_at
                   FROM sessions
                   WHERE user_id = ? {agent_clause} AND status = ?
                   ORDER BY updated_at DESC""",
                params,
            )
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]

    async def delete(self, user_id: str, session_key: str, agent_id: str | None = None) -> bool:
        if agent_id:
            cursor = await self._db.execute(
                "DELETE FROM sessions WHERE user_id = ? AND agent_id = ? AND session_key = ?",
                (user_id, agent_id, session_key),
            )
        else:
            cursor = await self._db.execute(
                "DELETE FROM sessions WHERE user_id = ? AND session_key = ?",
                (user_id, session_key),
            )
        await self._db.commit()
        return cursor.rowcount > 0

    async def update_status(self, user_id: str, session_key: str, status: str) -> bool:
        cursor = await self._db.execute(
            "UPDATE sessions SET status = ?, updated_at = ? WHERE user_id = ? AND session_key = ?",
            (status, datetime.now().isoformat(), user_id, session_key),
        )
        await self._db.commit()
        return cursor.rowcount > 0


class SQLiteMessageRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def get_messages(
        self, session_id: int, *, offset: int = 0, limit: int = 5000,
    ) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT * FROM messages
               WHERE session_id = ?
               ORDER BY seq ASC
               LIMIT ? OFFSET ?""",
            (session_id, limit, offset),
        )
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if d.get("tool_calls") and isinstance(d["tool_calls"], str):
                d["tool_calls"] = json.loads(d["tool_calls"])
            result.append(d)
        return result

    async def append(self, session_id: int, user_id: str, message: dict[str, Any]) -> int:
        seq = await self.count(session_id)
        tool_calls = message.get("tool_calls")
        if tool_calls and not isinstance(tool_calls, str):
            tool_calls = json.dumps(tool_calls)

        agent_id = message.get("agent_id")
        if agent_id is None:
            session = await self._db.execute("SELECT agent_id FROM sessions WHERE id = ?", (session_id,))
            row = await session.fetchone()
            agent_id = row[0] if row else None

        cursor = await self._db.execute(
            """INSERT INTO messages
               (session_id, user_id, agent_id, role, content, tool_calls, tool_call_id, name, timestamp, seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                user_id,
                agent_id,
                message["role"],
                message.get("content"),
                tool_calls,
                message.get("tool_call_id"),
                message.get("name"),
                message.get("timestamp", datetime.now().isoformat()),
                seq,
            ),
        )
        await self._db.commit()

        await self._sync_message_count(session_id)
        await self._db.commit()
        return cursor.lastrowid or 0

    async def append_many(self, session_id: int, user_id: str, messages: list[dict[str, Any]]) -> None:
        if not messages:
            return
        base_seq = await self.count(session_id)
        cur = await self._db.execute("SELECT agent_id FROM sessions WHERE id = ?", (session_id,))
        session_row = await cur.fetchone()
        session_agent_id = session_row[0] if session_row else None
        rows = []
        for i, msg in enumerate(messages):
            tool_calls = msg.get("tool_calls")
            if tool_calls and not isinstance(tool_calls, str):
                tool_calls = json.dumps(tool_calls)
            rows.append((
                session_id,
                user_id,
                msg.get("agent_id", session_agent_id),
                msg["role"],
                msg.get("content"),
                tool_calls,
                msg.get("tool_call_id"),
                msg.get("name"),
                msg.get("timestamp", datetime.now().isoformat()),
                base_seq + i,
            ))

        await self._db.executemany(
            """INSERT INTO messages
               (session_id, user_id, agent_id, role, content, tool_calls, tool_call_id, name, timestamp, seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        await self._sync_message_count(session_id)
        await self._db.commit()

    async def _sync_message_count(self, session_id: int) -> None:
        """Recompute message_count from the actual message rows."""
        await self._db.execute(
            """UPDATE sessions
               SET message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?),
                   updated_at = ?
               WHERE id = ?""",
            (session_id, datetime.now().isoformat(), session_id),
        )

    async def count(self, session_id: int) -> int:
        cursor = await self._db.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        return row[0] if row else 0

    async def first_asked(self, session_ids: list[int]) -> dict[int, str]:
        """The first thing a person actually asked, per session.

        Messages a machine wrote are excluded: a conversation resumed by a job
        or by an answered question starts with a ``[sistema]`` prompt, and
        naming the conversation after it hides what the person came for.
        """
        if not session_ids:
            return {}
        placeholders = ",".join("?" for _ in session_ids)
        cursor = await self._db.execute(
            f"""SELECT session_id, content FROM messages
                 WHERE id IN (
                     SELECT MIN(id) FROM messages
                      WHERE session_id IN ({placeholders})
                        AND role = 'user'
                        AND content IS NOT NULL AND content != ''
                        AND content NOT LIKE '[sistema]%'
                      GROUP BY session_id
                 )""",
            session_ids,
        )
        return {row["session_id"]: row["content"] for row in await cursor.fetchall()}

    async def delete_all(self, session_id: int) -> int:
        cursor = await self._db.execute(
            "DELETE FROM messages WHERE session_id = ?", (session_id,)
        )
        await self._db.execute(
            "UPDATE sessions SET message_count = 0, last_consolidated = 0, updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), session_id),
        )
        await self._db.commit()
        return cursor.rowcount
