"""SQLite implementation of AgentTemplateRepository."""

from __future__ import annotations

import json
from typing import Any

import aiosqlite


def _row_to_template(row: aiosqlite.Row) -> dict[str, Any]:
    data = dict(row)
    for field in ("tags", "tools", "starter_prompts"):
        raw = data.get(field)
        try:
            data[field] = json.loads(raw) if raw else []
        except json.JSONDecodeError:
            data[field] = []
    data["rag_enabled"] = bool(data.get("rag_enabled"))
    return data


class SQLiteAgentTemplateRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def list_templates(self) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT t.*,
                      (SELECT COUNT(*) FROM agent_template_skills s
                       WHERE s.template_id = t.id) AS skills_count,
                      (SELECT COUNT(*) FROM agent_template_knowledge k
                       WHERE k.template_id = t.id) AS knowledge_count
               FROM agent_templates t
               ORDER BY t.display_order, t.name"""
        )
        rows = await cursor.fetchall()
        return [_row_to_template(r) for r in rows]

    async def get_template(self, template_id: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM agent_templates WHERE id = ?",
            (template_id,),
        )
        row = await cursor.fetchone()
        return _row_to_template(row) if row else None

    async def list_skills(self, template_id: str) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT name, description, content, always_active, display_order
               FROM agent_template_skills
               WHERE template_id = ?
               ORDER BY display_order, name""",
            (template_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "name": r["name"],
                "description": r["description"],
                "content": r["content"],
                "always_active": bool(r["always_active"]),
            }
            for r in rows
        ]

    async def list_knowledge(self, template_id: str) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            """SELECT source, content, display_order
               FROM agent_template_knowledge
               WHERE template_id = ?
               ORDER BY display_order, source""",
            (template_id,),
        )
        rows = await cursor.fetchall()
        return [{"source": r["source"], "content": r["content"]} for r in rows]
