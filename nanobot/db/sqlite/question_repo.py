"""SQLite implementation of QuestionRepository.

Asking leans on the partial unique index over ``(user_id, agent_id, subject_ref,
question)`` restricted to open rows: the insert either wins or conflicts, so a
routine that sweeps the same board every night cannot fill the inbox with the same
question twelve times. Nothing here trusts a read-then-write.

Answering is guarded in SQL for the same reason — only an ``open`` row can be
answered, so two people answering at once produce one answer, not two.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteQuestionRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def ask(
        self, user_id: str, *, question: str, agent_id: str = "", context: str = "",
        subject: str = "", subject_url: str = "", subject_ref: str = "",
        asked_where: str = "", origin_channel: str = "", origin_chat_id: str = "",
    ) -> dict[str, Any]:
        cursor = await self._db.execute(
            """INSERT INTO questions
                   (user_id, agent_id, question, context, subject, subject_url,
                    subject_ref, asked_where, state, origin_channel,
                    origin_chat_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
               ON CONFLICT DO NOTHING""",
            (user_id, agent_id, question, context, subject, subject_url,
             subject_ref, asked_where, origin_channel, origin_chat_id,
             datetime.now().isoformat()),
        )
        await self._db.commit()
        if cursor.rowcount:
            row = await self.get(user_id, cursor.lastrowid)
            return {**(row or {}), "created": True}

        existing = await self._find_open(user_id, agent_id, subject_ref, question)
        return {**(existing or {}), "created": False}

    async def answer(
        self, user_id: str, question_id: int, *, answer: str, answered_by: str,
    ) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            """UPDATE questions
                  SET state = 'answered', answer = ?, answered_by = ?, answered_at = ?
                WHERE user_id = ? AND id = ? AND state = 'open'""",
            (answer, answered_by, datetime.now().isoformat(), user_id, question_id),
        )
        await self._db.commit()
        if not cursor.rowcount:
            return None
        return await self.get(user_id, question_id)

    async def cancel(self, user_id: str, question_id: int) -> bool:
        cursor = await self._db.execute(
            """UPDATE questions SET state = 'cancelled', answered_at = ?
                WHERE user_id = ? AND id = ? AND state = 'open'""",
            (datetime.now().isoformat(), user_id, question_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def get(self, user_id: str, question_id: int) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM questions WHERE user_id = ? AND id = ?",
            (user_id, question_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_questions(
        self, user_id: str, *, state: str | None = "open", agent_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM questions WHERE user_id = ?"
        params: list[Any] = [user_id]
        if state:
            query += " AND state = ?"
            params.append(state)
        if agent_id:
            query += " AND agent_id = ?"
            params.append(agent_id)
        query += " ORDER BY created_at ASC LIMIT ?"
        params.append(limit)
        cursor = await self._db.execute(query, params)
        return [dict(row) for row in await cursor.fetchall()]

    async def count_open(self, user_id: str) -> int:
        cursor = await self._db.execute(
            "SELECT COUNT(*) FROM questions WHERE user_id = ? AND state = 'open'",
            (user_id,),
        )
        row = await cursor.fetchone()
        return int(row[0]) if row else 0

    async def _find_open(
        self, user_id: str, agent_id: str, subject_ref: str, question: str,
    ) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            """SELECT * FROM questions
                WHERE user_id = ? AND agent_id = ? AND subject_ref = ?
                  AND question = ? AND state = 'open'""",
            (user_id, agent_id, subject_ref, question),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
