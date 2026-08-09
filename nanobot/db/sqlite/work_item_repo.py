"""SQLite implementation of WorkItemRepository.

Claiming leans on the UNIQUE index over ``(user_id, source, external_id)``: the
insert either wins or conflicts, which is what makes two routines running at the
same time unable to work the same demand. Nothing here trusts a read-then-write.

The claim is on the demand; the repositories it touches hang off it in
``work_item_repos``, under a UNIQUE index that enforces one branch per demand per
repository. A demand only reaches ``done`` when every repository it declared has
a pull request, so a change that needs backend and frontend cannot be closed by
whichever one finished first.
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
        origin_channel: str = "", origin_chat_id: str = "",
    ) -> dict[str, Any]:
        now = datetime.now().isoformat()
        cursor = await self._db.execute(
            """INSERT INTO work_items
                   (user_id, agent_id, source, external_id, title, state,
                    origin_channel, origin_chat_id, claimed_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?)
               ON CONFLICT(user_id, source, external_id) DO NOTHING""",
            (user_id, agent_id, source, external_id, title,
             origin_channel, origin_chat_id, now, now),
        )
        await self._db.commit()
        if cursor.rowcount:
            row = await self.get(user_id, source=source, external_id=external_id)
            return {**(row or {}), "claimed": True, "reason": "novo"}

        existing = await self.get(user_id, source=source, external_id=external_id)
        if not existing:
            return {"claimed": False, "reason": "conflito irrecuperável"}
        if existing["state"] in _TERMINAL_STATES:
            repos = await self.list_repos(user_id, source=source, external_id=external_id)
            return {**existing, "claimed": False,
                    "reason": f"já está {existing['state']}",
                    "pr_urls": [r["pr_url"] for r in repos if r["pr_url"]]}
        if existing["state"] == "waiting":
            return {**existing, "claimed": False,
                    "reason": "aguardando a resposta de uma pessoa desde "
                              f"{existing.get('updated_at', '?')}"}
        if existing["state"] == "claimed" and not self._is_stale(existing, stale_after_s):
            return {**existing, "claimed": False,
                    "reason": "outra execução está trabalhando neste item"}

        await self._db.execute(
            """UPDATE work_items
                  SET state = 'claimed', agent_id = ?, claimed_at = ?, updated_at = ?,
                      attempts = attempts + 1,
                      origin_channel = CASE WHEN origin_channel = ''
                                            THEN ? ELSE origin_channel END,
                      origin_chat_id = CASE WHEN origin_chat_id = ''
                                            THEN ? ELSE origin_chat_id END
                WHERE user_id = ? AND source = ? AND external_id = ?""",
            (agent_id or existing["agent_id"], now, now,
             origin_channel, origin_chat_id, user_id, source, external_id),
        )
        await self._db.commit()
        row = await self.get(user_id, source=source, external_id=external_id)
        previous = "tentativa anterior falhou" if existing["state"] == "failed" \
            else "claim anterior expirou"
        return {**(row or {}), "claimed": True, "reason": previous}

    async def link_repo(
        self, user_id: str, *, source: str, external_id: str, repo: str, branch: str,
    ) -> dict[str, Any]:
        item = await self.get(user_id, source=source, external_id=external_id)
        if not item:
            return {"linked": False, "reason": "demanda não está no registro"}
        cursor = await self._db.execute(
            """INSERT INTO work_item_repos (work_item_id, repo, branch)
               VALUES (?, ?, ?)
               ON CONFLICT(work_item_id, repo) DO NOTHING""",
            (item["id"], repo, branch),
        )
        await self._db.commit()
        rows = await self.list_repos(user_id, source=source, external_id=external_id)
        if cursor.rowcount:
            return {"linked": True, "repos": rows}
        existing = next((r for r in rows if r["repo"] == repo), None)
        return {"linked": False, "repos": rows,
                "reason": f"já tem o branch {(existing or {}).get('branch', '?')}"}

    async def complete_repo(
        self, user_id: str, *, source: str, external_id: str, repo: str,
        pr_url: str, note: str = "",
    ) -> dict[str, Any]:
        if not pr_url.strip():
            return {"recorded": False, "reason": "sem PR não está concluído"}
        item = await self.get(user_id, source=source, external_id=external_id)
        if not item:
            return {"recorded": False, "reason": "demanda não está no registro"}
        cursor = await self._db.execute(
            """UPDATE work_item_repos
                  SET pr_url = ?, note = ?, updated_at = ?
                WHERE work_item_id = ? AND repo = ?""",
            (pr_url.strip(), note.strip(), datetime.now().isoformat(), item["id"], repo),
        )
        await self._db.commit()
        if not cursor.rowcount:
            return {"recorded": False, "reason": "repositório não declarado"}

        rows = await self.list_repos(user_id, source=source, external_id=external_id)
        done = [r for r in rows if r["pr_url"]]
        if len(done) == len(rows):
            await self._set_state(user_id, source, external_id, "done", note=note)
        return {"recorded": True, "repos": rows,
                "closed": len(done) == len(rows), "total": len(rows),
                "with_pr": len(done)}

    async def list_repos(
        self, user_id: str, *, source: str, external_id: str,
    ) -> list[dict[str, Any]]:
        item = await self.get(user_id, source=source, external_id=external_id)
        if not item:
            return []
        cursor = await self._db.execute(
            "SELECT * FROM work_item_repos WHERE work_item_id = ? ORDER BY id",
            (item["id"],),
        )
        return [dict(row) for row in await cursor.fetchall()]

    async def fail(
        self, user_id: str, *, source: str, external_id: str, note: str,
    ) -> bool:
        return await self._set_state(user_id, source, external_id, "failed", note=note)

    async def wait(
        self, user_id: str, *, source: str, external_id: str, note: str,
    ) -> bool:
        """Park the item: it needs a person, not another attempt.

        Distinct from ``fail`` on purpose — ``claim`` refuses a parked item, so a
        routine sweeping tomorrow skips it instead of re-doing work whose whole
        problem was a missing decision.
        """
        return await self._set_state(user_id, source, external_id, "waiting", note=note)

    async def resume(
        self, user_id: str, *, source: str, external_id: str, note: str = "",
    ) -> bool:
        """Put a parked item back to work. The only way out of ``waiting``."""
        cursor = await self._db.execute(
            """UPDATE work_items
                  SET state = 'claimed', claimed_at = ?, updated_at = ?,
                      attempts = attempts + 1,
                      note = CASE WHEN ? != '' THEN ? ELSE note END
                WHERE user_id = ? AND source = ? AND external_id = ?
                  AND state = 'waiting'""",
            (datetime.now().isoformat(), datetime.now().isoformat(),
             note, note, user_id, source, external_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

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
        """The demands, each carrying the repositories it touches under ``repos``."""
        query = "SELECT * FROM work_items WHERE user_id = ?"
        params: list[Any] = [user_id]
        if state:
            query += " AND state = ?"
            params.append(state)
        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        cursor = await self._db.execute(query, params)
        items = [dict(row) for row in await cursor.fetchall()]
        if not items:
            return items

        placeholders = ",".join("?" for _ in items)
        cursor = await self._db.execute(
            f"""SELECT * FROM work_item_repos
                 WHERE work_item_id IN ({placeholders}) ORDER BY id""",
            [item["id"] for item in items],
        )
        by_item: dict[int, list[dict[str, Any]]] = {}
        for row in await cursor.fetchall():
            by_item.setdefault(row["work_item_id"], []).append(dict(row))
        return [{**item, "repos": by_item.get(item["id"], [])} for item in items]

    async def _set_state(
        self, user_id: str, source: str, external_id: str, state: str, *,
        note: str = "",
    ) -> bool:
        cursor = await self._db.execute(
            """UPDATE work_items
                  SET state = ?, updated_at = ?, note = ?
                WHERE user_id = ? AND source = ? AND external_id = ?""",
            (state, datetime.now().isoformat(), note, user_id, source, external_id),
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
