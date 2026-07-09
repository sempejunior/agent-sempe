"""SQLite implementation of AgentRepository."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

import aiosqlite


def _row_to_dict(row: aiosqlite.Row) -> dict[str, Any]:
    d = dict(row)
    for key in ("agent_config", "bootstrap", "tools_enabled", "channel_configs", "metadata"):
        if key in d and isinstance(d[key], str):
            d[key] = json.loads(d[key])
    return d


class SQLiteAgentRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def list_agents(self, user_id: str, status: str | None = None) -> list[dict[str, Any]]:
        if status:
            cursor = await self._db.execute(
                "SELECT * FROM agents WHERE user_id = ? AND status = ? ORDER BY created_at ASC",
                (user_id, status),
            )
        else:
            cursor = await self._db.execute(
                "SELECT * FROM agents WHERE user_id = ? AND status != 'deleted' "
                "ORDER BY created_at ASC",
                (user_id,),
            )
        return [_row_to_dict(row) for row in await cursor.fetchall()]

    async def get_agent(self, user_id: str, agent_id: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM agents WHERE user_id = ? AND agent_id = ? AND status != 'deleted'",
            (user_id, agent_id),
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def get_default_agent(self, user_id: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            """SELECT * FROM agents
               WHERE user_id = ? AND is_default = 1 AND status != 'deleted'
               ORDER BY created_at ASC LIMIT 1""",
            (user_id,),
        )
        row = await cursor.fetchone()
        if row:
            return _row_to_dict(row)
        cursor = await self._db.execute(
            """SELECT * FROM agents
               WHERE user_id = ? AND status != 'deleted'
               ORDER BY created_at ASC LIMIT 1""",
            (user_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def create_agent(self, user_id: str, agent: dict[str, Any]) -> str:
        now = datetime.now().isoformat()
        agent_id = agent.get("agent_id") or f"agent_{uuid.uuid4().hex[:12]}"
        await self._db.execute(
            """INSERT INTO agents
               (agent_id, user_id, name, role, description, avatar, is_default,
                agent_config, bootstrap, tools_enabled, channel_configs, metadata,
                status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                agent_id,
                user_id,
                agent.get("name", "Novo agente"),
                agent.get("role", ""),
                agent.get("description", ""),
                agent.get("avatar", ""),
                1 if agent.get("is_default") else 0,
                json.dumps(agent.get("agent_config", {})),
                json.dumps(agent.get("bootstrap", {})),
                json.dumps(agent.get("tools_enabled", [])),
                json.dumps(agent.get("channel_configs", {})),
                json.dumps(agent.get("metadata", {})),
                agent.get("status", "active"),
                now,
                now,
            ),
        )
        await self._db.commit()
        return agent_id

    async def update_agent(self, user_id: str, agent_id: str, fields: dict[str, Any]) -> bool:
        if not fields:
            return False
        allowed = {
            "name", "role", "description", "avatar", "is_default",
            "agent_config", "bootstrap", "tools_enabled", "channel_configs",
            "metadata", "status", "updated_at",
        }
        bad = set(fields) - allowed
        if bad:
            raise ValueError(f"Disallowed fields: {bad}")

        for key in ("agent_config", "bootstrap", "tools_enabled", "channel_configs", "metadata"):
            if key in fields and not isinstance(fields[key], str):
                fields[key] = json.dumps(fields[key])
        if "is_default" in fields:
            fields["is_default"] = 1 if fields["is_default"] else 0
        fields["updated_at"] = datetime.now().isoformat()

        if fields.get("is_default") == 1:
            await self._db.execute(
                "UPDATE agents SET is_default = 0 WHERE user_id = ? AND agent_id != ?",
                (user_id, agent_id),
            )

        set_clause = ", ".join(f"{key} = ?" for key in fields)
        values = list(fields.values()) + [user_id, agent_id]
        cursor = await self._db.execute(
            f"UPDATE agents SET {set_clause} WHERE user_id = ? AND agent_id = ?",
            values,
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def delete_agent(self, user_id: str, agent_id: str) -> bool:
        agent = await self.get_agent(user_id, agent_id)
        if not agent or agent.get("is_default"):
            return False
        cursor = await self._db.execute(
            "UPDATE agents SET status = 'deleted', updated_at = ? WHERE user_id = ? AND agent_id = ?",
            (datetime.now().isoformat(), user_id, agent_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def duplicate_agent(self, user_id: str, agent_id: str) -> str | None:
        source = await self.get_agent(user_id, agent_id)
        if not source:
            return None
        clone = {
            "name": f"{source.get('name', 'Agente')} (cópia)",
            "role": source.get("role", ""),
            "description": source.get("description", ""),
            "avatar": source.get("avatar", ""),
            "is_default": False,
            "agent_config": source.get("agent_config", {}),
            "bootstrap": source.get("bootstrap", {}),
            "tools_enabled": source.get("tools_enabled", []),
            "channel_configs": {},
            "metadata": {
                **(source.get("metadata") or {}),
                "duplicated_from": agent_id,
            },
            "status": "active",
        }
        return await self.create_agent(user_id, clone)

    async def find_by_embed_token(self, token: str) -> dict[str, Any] | None:
        if not token:
            return None
        cursor = await self._db.execute(
            "SELECT * FROM agents WHERE status != 'deleted' AND metadata LIKE ?",
            (f'%"embed_token": "{token}"%',),
        )
        for row in await cursor.fetchall():
            agent = _row_to_dict(row)
            meta = agent.get("metadata") or {}
            if meta.get("embed_token") == token and meta.get("embed_enabled"):
                return agent
        return None

    async def get_agent_metrics(self, user_id: str, agent_id: str) -> dict[str, Any]:
        cursor = await self._db.execute(
            """SELECT COUNT(*) FROM messages
               WHERE user_id = ? AND agent_id = ?
               AND datetime(timestamp) >= datetime('now', '-1 day')""",
            (user_id, agent_id),
        )
        row = await cursor.fetchone()
        messages_24h = row[0] if row else 0

        cursor = await self._db.execute(
            """SELECT MAX(timestamp) FROM messages
               WHERE user_id = ? AND agent_id = ?""",
            (user_id, agent_id),
        )
        row = await cursor.fetchone()
        last_activity = row[0] if row and row[0] else None

        cursor = await self._db.execute(
            "SELECT channel_configs FROM agents WHERE user_id = ? AND agent_id = ?",
            (user_id, agent_id),
        )
        row = await cursor.fetchone()
        active_channels = 0
        if row and row[0]:
            try:
                cfgs = json.loads(row[0])
                active_channels = sum(
                    1 for cfg in cfgs.values()
                    if isinstance(cfg, dict) and cfg.get("enabled")
                )
            except (json.JSONDecodeError, AttributeError):
                active_channels = 0

        return {
            "messages_last_24h": messages_24h,
            "active_channels": active_channels,
            "last_activity_at": last_activity,
        }
