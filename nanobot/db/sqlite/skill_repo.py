"""SQLite implementation of SkillRepository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import aiosqlite


class SQLiteSkillRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db
        self._conflict_target: str | None = None

    def _agent_clause(self, agent_id: str | None) -> tuple[str, tuple[Any, ...]]:
        return (" AND agent_id = ?", (agent_id,)) if agent_id else ("", ())

    async def list_skills(
        self, user_id: str, enabled_only: bool = True, agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        clause, extra = self._agent_clause(agent_id)
        if enabled_only:
            cursor = await self._db.execute(
                f"SELECT * FROM skills WHERE user_id = ?{clause} AND enabled = 1 ORDER BY name",
                (user_id, *extra),
            )
        else:
            cursor = await self._db.execute(
                f"SELECT * FROM skills WHERE user_id = ?{clause} ORDER BY name", (user_id, *extra),
            )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_skill(self, user_id: str, name: str, agent_id: str | None = None) -> dict[str, Any] | None:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"SELECT * FROM skills WHERE user_id = ?{clause} AND name = ?", (user_id, *extra, name),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def save_skill(self, user_id: str, skill: dict[str, Any], agent_id: str | None = None) -> None:
        now = datetime.now().isoformat()
        agent_id = agent_id or skill.get("agent_id")
        values = (
            user_id,
            agent_id,
            skill["name"],
            skill["content"],
            skill.get("description", ""),
            1 if skill.get("always_active") else 0,
            1 if skill.get("enabled", True) else 0,
            now,
            now,
        )
        if await self._skill_conflict_target() == "user_agent_name":
            await self._db.execute(
                """INSERT INTO skills (user_id, agent_id, name, content, description, always_active, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, agent_id, name)
                   DO UPDATE SET
                       content = excluded.content,
                       description = excluded.description,
                       always_active = excluded.always_active,
                       enabled = excluded.enabled,
                       updated_at = excluded.updated_at""",
                values,
            )
        else:
            await self._db.execute(
                """INSERT INTO skills (user_id, agent_id, name, content, description, always_active, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, name)
                   DO UPDATE SET
                       agent_id = COALESCE(excluded.agent_id, skills.agent_id),
                       content = excluded.content,
                       description = excluded.description,
                       always_active = excluded.always_active,
                       enabled = excluded.enabled,
                       updated_at = excluded.updated_at""",
                values,
            )
        await self._db.commit()

    async def _skill_conflict_target(self) -> str:
        if self._conflict_target:
            return self._conflict_target
        cursor = await self._db.execute("PRAGMA index_list(skills)")
        indexes = await cursor.fetchall()
        for index in indexes:
            is_unique = index["unique"] if hasattr(index, "keys") else index[2]
            if not is_unique:
                continue
            index_name = index["name"] if hasattr(index, "keys") else index[1]
            info_cursor = await self._db.execute(f"PRAGMA index_info({index_name})")
            columns = [
                row["name"] if hasattr(row, "keys") else row[2]
                for row in await info_cursor.fetchall()
            ]
            if columns == ["user_id", "agent_id", "name"]:
                self._conflict_target = "user_agent_name"
                return self._conflict_target
        self._conflict_target = "user_name"
        return self._conflict_target

    async def delete_skill(self, user_id: str, name: str, agent_id: str | None = None) -> bool:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"DELETE FROM skills WHERE user_id = ?{clause} AND name = ?", (user_id, *extra, name),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def count_skills(self, user_id: str, agent_id: str | None = None) -> int:
        clause, extra = self._agent_clause(agent_id)
        cursor = await self._db.execute(
            f"SELECT COUNT(*) FROM skills WHERE user_id = ?{clause}", (user_id, *extra),
        )
        row = await cursor.fetchone()
        return row[0] if row else 0
