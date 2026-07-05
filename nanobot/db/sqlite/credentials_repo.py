"""SQLite implementation of CredentialRepository."""

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


class SQLiteCredentialRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def list_credentials(self, user_id: str) -> list[dict[str, Any]]:
        cursor = await self._db.execute(
            "SELECT * FROM credentials WHERE user_id = ? ORDER BY name",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]

    async def get_credential(self, user_id: str, credential_id: int) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM credentials WHERE user_id = ? AND id = ?",
            (user_id, credential_id),
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def get_by_name(self, user_id: str, name: str) -> dict[str, Any] | None:
        cursor = await self._db.execute(
            "SELECT * FROM credentials WHERE user_id = ? AND name = ?",
            (user_id, name),
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None

    async def create(self, credential: dict[str, Any]) -> int:
        now = datetime.now().isoformat()
        cursor = await self._db.execute(
            """INSERT INTO credentials
               (user_id, name, provider_key, secret_cipher, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                credential["user_id"],
                credential["name"],
                credential.get("provider_key", ""),
                credential["secret_cipher"],
                json.dumps(credential.get("metadata", {})),
                now,
                now,
            ),
        )
        await self._db.commit()
        return cursor.lastrowid or 0

    _ALLOWED = frozenset({"name", "provider_key", "secret_cipher", "metadata"})

    async def update(self, user_id: str, credential_id: int, fields: dict[str, Any]) -> bool:
        bad = set(fields) - self._ALLOWED
        if bad:
            raise ValueError(f"Disallowed fields: {bad}")
        if not fields:
            return False
        if "metadata" in fields and not isinstance(fields["metadata"], str):
            fields["metadata"] = json.dumps(fields["metadata"])
        fields["updated_at"] = datetime.now().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [user_id, credential_id]
        cursor = await self._db.execute(
            f"UPDATE credentials SET {set_clause} WHERE user_id = ? AND id = ?",
            values,
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def delete(self, user_id: str, credential_id: int) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM credentials WHERE user_id = ? AND id = ?",
            (user_id, credential_id),
        )
        await self._db.commit()
        return cursor.rowcount > 0
