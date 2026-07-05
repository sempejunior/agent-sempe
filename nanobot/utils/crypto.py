"""Credential encryption helper.

Uses Fernet (AES128-CBC + HMAC-SHA256) for symmetric encryption. The master key
is expected in the ``NANOBOT_SECRET_KEY`` environment variable. If missing at
startup, ``ensure_master_key`` generates one and persists it under
``{data_dir}/master.key``.

Prod hardening (KMS/Vault, rotation, audit) is tracked separately.
"""

from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from loguru import logger

_ENV_VAR = "NANOBOT_SECRET_KEY"


def ensure_master_key(data_dir: Path) -> str:
    """Ensure a master key exists. Reads env var, then file, else generates.

    Sets ``NANOBOT_SECRET_KEY`` in os.environ before returning.
    """
    existing = os.environ.get(_ENV_VAR, "").strip()
    if existing:
        return existing

    key_path = data_dir / "master.key"
    if key_path.exists():
        key = key_path.read_text().strip()
        if key:
            os.environ[_ENV_VAR] = key
            return key

    key_bytes = Fernet.generate_key()
    key = key_bytes.decode()
    data_dir.mkdir(parents=True, exist_ok=True)
    key_path.write_text(key)
    try:
        os.chmod(key_path, 0o600)
    except OSError:
        pass
    os.environ[_ENV_VAR] = key
    logger.info("Generated new credential master key at {}", key_path)
    return key


def _get_fernet() -> Fernet:
    key = os.environ.get(_ENV_VAR, "").strip()
    if not key:
        raise RuntimeError(
            f"{_ENV_VAR} is not set. Call ensure_master_key(data_dir) at startup."
        )
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string, return base64 ciphertext."""
    if plaintext is None:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt base64 ciphertext to a UTF-8 string. Returns '' on failure."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        logger.warning("Credential decrypt failed: {}", exc)
        return ""


def mask(value: str) -> str:
    """Return a display-safe masked version of a secret."""
    if not value:
        return ""
    if len(value) <= 4:
        return "****"
    return f"{'*' * (len(value) - 4)}{value[-4:]}"
