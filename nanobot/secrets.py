"""Helpers for legacy encrypted credential secrets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from loguru import logger


def _read_master_key(data_dir: Path) -> bytes | None:
    key_path = data_dir / "master.key"
    try:
        return key_path.read_text().strip().encode()
    except FileNotFoundError:
        return None
    except Exception as exc:
        logger.warning("Failed to read credential master key: {}", exc)
        return None


async def get_credential_secret(
    db: Any,
    data_dir: Path,
    user_id: str,
    kind: str,
    name: str,
) -> str | None:
    """Return a decrypted legacy credential secret, if present."""
    if db is None:
        return None

    key = _read_master_key(data_dir)
    if not key:
        return None

    try:
        from cryptography.fernet import Fernet
    except Exception as exc:
        logger.warning("cryptography is unavailable; cannot read credential vault: {}", exc)
        return None

    try:
        cursor = await db.execute(
            """
            SELECT ciphertext
            FROM credential_secrets
            WHERE user_id = ? AND kind = ? AND name = ?
            """,
            (user_id, kind, name),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        ciphertext = row["ciphertext"] if hasattr(row, "keys") else row[0]
        return Fernet(key).decrypt(ciphertext.encode()).decode()
    except Exception as exc:
        logger.warning("Failed to read credential secret {}:{} for {}: {}", kind, name, user_id, exc)
        return None


async def resolve_channel_secret(
    db: Any,
    data_dir: Path,
    user_id: str,
    channel_name: str,
    field_name: str,
) -> str | None:
    """Resolve a channel secret field from the legacy credential vault."""
    candidates = [f"{channel_name}:{field_name}"]
    if channel_name == "telegram" and field_name == "token":
        candidates.append("telegram:bot_token")

    for name in candidates:
        secret = await get_credential_secret(db, data_dir, user_id, "channel", name)
        if secret:
            return secret
    return None
