"""SQLite implementation of WorkItemRepository.

Claiming leans on the UNIQUE index over ``(user_id, source, external_id)``: the
insert either wins or conflicts, which is what makes two routines running at the
same time unable to work the same demand. Nothing here trusts a read-then-write.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite

_TERMINAL_STATES = ("done", "skipped")


class SQLiteWorkItemRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def claim(
        self, user_id: str, *, source: str, external_id: str, agent_id: str = "",
        title: str = "", stale_after_s: int = 3600,
    ) -> dict[str, Any]:
        now = datetime.now().isoformat()
        cursor = await self._db.execute(
            """INSERT INTO work_items
                   (user_id, agent_id, source, external_id, title, state,
                    claimed_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'claimed', ?, ?)
               ON CONFLICT(user_id, source, external_id) DO NOTHING""",
            (user_id, agent_id, source, external_id, title, now, now),
        )
        await self._db.commit()
        if cursor.rowcount:
            row = await self.get(user_id, source=source, external_id=external_id)
            return {**(row or {}), "claimed": True, "reason": "novo"}

        existing = await self.get(user_id, source=source, external_id=external_id)
        if not existing:
            return {"claimed": False, "reason": "conflito irrecuperável"}
        if existing["state"] in _TERMINAL_STATES:
            return {**existing, "claimed": False, "reason": f"já está {existing['state']}"}
        if existing["state"] == "claimed" and not self._is_stale(existing, stale_after_s):
            return {**existing, "claimed": False,
                    "reason": "outra execução está trabalhando neste item"}

        await self._db.execute(
            """UPDATE work_items
                  SET state = 'claimed', agent_id = ?, claimed_at = ?, updated_at = ?,
                      attempts = attempts + 1
                WHERE user_id = ? AND source = ? AND external_id = ?""",
            (agent_id or existing["agent_id"], now, now, user_id, source, external_id),
        )
        await self._db.commit()
        row = await self.get(user_id, source=source, external_id=external_id)
        previous = "tentativa anterior falhou" if existing["state"] == "failed" \
            else "claim anterior expirou"
        return {**(row or {}), "claimed": True, "reason": previous}

    async def complete(
        self, user_id: str, *, source: str, external_id: str, pr_url: str,
        branch: str = "", note: str = "",
    ) -> bool:
        if not pr_url.strip():
            return False
        return await self._set_state(
            user_id, source, external_id, "done",
            pr_url=pr_url, branch=branch, note=note,
        )

    async def fail(
        self, user_id: str, *, source: str, external_id: str, note: str,
    ) -> bool:
        return await self._set_state(user_id, source, external_id, "failed", note=note)

    async def get(
        self, user_id: str, *, source: str, external_id: str,
    ) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            """SELECT * FROM work_items
                WHERE user_id = ? AND source = ? AND external_id = ?""",
            (user_id, source, external_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_items(
        self, user_id: str, *, state: str | None = None, limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM work_items WHERE user_id = ?"
        params: list[Any] = [user_id]
        if state:
            query += " AND state = ?"
            params.append(state)
        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        cursor = await self._db.execute(query, params)
        return [dict(row) for row in await cursor.fetchall()]

    async def _set_state(
        self, user_id: str, source: str, external_id: str, state: str, *,
        pr_url: str = "", branch: str = "", note: str = "",
    ) -> bool:
        cursor = await self._db.execute(
            """UPDATE work_items
                  SET state = ?, updated_at = ?,
                      pr_url = CASE WHEN ? != '' THEN ? ELSE pr_url END,
                      branch = CASE WHEN ? != '' THEN ? ELSE branch END,
                      note = ?
                WHERE user_id = ? AND source = ? AND external_id = ?""",
            (state, datetime.now().isoformat(), pr_url, pr_url, branch, branch,
             note, user_id, source, external_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    @staticmethod
    def _is_stale(row: dict[str, Any], stale_after_s: int) -> bool:
        try:
            claimed = datetime.fromisoformat(row["claimed_at"])
        except (TypeError, ValueError):
            return True
        return (datetime.now() - claimed).total_seconds() > stale_after_s
