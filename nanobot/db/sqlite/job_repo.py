"""SQLite implementation of JobRepository.

State only ever moves forward, and the transitions are guarded in SQL rather than
read-then-written: ``start`` only fires on a queued row and ``finish`` only on one
that is not finished yet, so a late timeout cannot overwrite a result that already
arrived.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import aiosqlite

_UNFINISHED = ("queued", "running")


class SQLiteJobRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def create(
        self, user_id: str, *, job_id: str, kind: str, agent_id: str = "",
        label: str = "", origin_channel: str = "", origin_chat_id: str = "",
        params: dict[str, Any] | None = None, timeout_s: int = 1800,
    ) -> dict[str, Any]:
        await self._db.execute(
            """INSERT INTO jobs
                   (user_id, agent_id, job_id, kind, label, state,
                    origin_channel, origin_chat_id, params, timeout_s, created_at)
               VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)""",
            (user_id, agent_id, job_id, kind, label, origin_channel, origin_chat_id,
             json.dumps(params or {}, ensure_ascii=False), int(timeout_s),
             datetime.now().isoformat()),
        )
        await self._db.commit()
        row = await self.get(user_id, job_id)
        return row or {}

    async def start(
        self, user_id: str, job_id: str, *, pid: int | None = None,
        log_path: str = "",
    ) -> bool:
        cursor = await self._db.execute(
            """UPDATE jobs
                  SET state = 'running', started_at = ?,
                      pid = COALESCE(?, pid),
                      log_path = CASE WHEN ? != '' THEN ? ELSE log_path END
                WHERE user_id = ? AND job_id = ? AND state = 'queued'""",
            (datetime.now().isoformat(), pid, log_path, log_path, user_id, job_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def attach_process(
        self, user_id: str, job_id: str, *, pid: int, log_path: str = "",
    ) -> bool:
        cursor = await self._db.execute(
            """UPDATE jobs
                  SET pid = ?,
                      log_path = CASE WHEN ? != '' THEN ? ELSE log_path END
                WHERE user_id = ? AND job_id = ?""",
            (int(pid), log_path, log_path, user_id, job_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def finish(
        self, user_id: str, job_id: str, *, state: str, result: str = "",
        error: str = "",
    ) -> bool:
        placeholders = ", ".join("?" for _ in _UNFINISHED)
        cursor = await self._db.execute(
            f"""UPDATE jobs
                   SET state = ?, result = ?, error = ?, finished_at = ?
                 WHERE user_id = ? AND job_id = ? AND state IN ({placeholders})""",
            (state, result, error, datetime.now().isoformat(), user_id, job_id,
             *_UNFINISHED),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def get(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM jobs WHERE user_id = ? AND job_id = ?", (user_id, job_id),
        )
        row = await cursor.fetchone()
        return self._row(row) if row else None

    async def list_jobs(
        self, user_id: str, *, state: str | None = None, limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM jobs WHERE user_id = ?"
        params: list[Any] = [user_id]
        if state:
            query += " AND state = ?"
            params.append(state)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = await self._db.execute(query, params)
        return [self._row(row) for row in await cursor.fetchall()]

    async def list_unfinished(self) -> list[dict[str, Any]]:
        placeholders = ", ".join("?" for _ in _UNFINISHED)
        cursor = await self._db.execute(
            f"SELECT * FROM jobs WHERE state IN ({placeholders}) ORDER BY created_at",
            _UNFINISHED,
        )
        return [self._row(row) for row in await cursor.fetchall()]

    @staticmethod
    def _row(row: Any) -> dict[str, Any]:
        item = dict(row)
        try:
            item["params"] = json.loads(item.get("params") or "{}")
        except (ValueError, TypeError):
            item["params"] = {}
        return item
