"""SQLite async connection pool using aiosqlite."""

from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path

import aiosqlite
from loguru import logger

from nanobot.db.sqlite.migrations import apply_migrations


def _ensure_writable(path: Path) -> None:
    """Ensure the database file is writable by the current process.

    On FUSE mounts (SSHFS, NFS) the database may have been created by a
    previous container running as a different uid.  The current process can
    read but not write to it.  Fix by replacing the file with a copy — the
    copy inherits the current process's effective uid and is therefore
    writable.  All data is preserved.
    """
    if not path.exists():
        return
    if os.access(str(path), os.W_OK):
        return

    logger.warning("Database {} is read-only, recreating with correct ownership", path.name)
    tmp = path.with_suffix(".tmp")
    shutil.copy2(str(path), str(tmp))
    os.replace(str(tmp), str(path))

    for suffix in ("-wal", "-shm"):
        stale = path.with_name(path.name + suffix)
        if stale.exists():
            try:
                stale.unlink()
            except OSError:
                pass


async def create_database(db_path: str | Path) -> aiosqlite.Connection:
    """Open (or create) the SQLite database, apply migrations, and return the connection.

    The connection is configured with:
    - WAL journal mode (concurrent reads + single writer without blocking)
    - Foreign keys enforced
    - Busy timeout of 5 s so concurrent writers wait instead of failing
    """
    path = Path(db_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)

    _ensure_writable(path)

    db = await aiosqlite.connect(str(path))
    db.row_factory = aiosqlite.Row

    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.execute("PRAGMA busy_timeout=5000")

    await apply_migrations(db)
    return db


class DatabasePool:
    """Lightweight wrapper that hands out a single shared connection.

    SQLite (with WAL) handles concurrent reads well.  Writes are serialised
    by SQLite itself, so a single connection is fine for moderate traffic.
    For heavy write loads consider switching to MongoDB.

    Usage::

        pool = DatabasePool("~/.nanobot/nanobot.db")
        await pool.open()
        db = pool.connection   # use in repos
        ...
        await pool.close()
    """

    def __init__(self, db_path: str | Path):
        self._db_path = db_path
        self._db: aiosqlite.Connection | None = None
        self._lock = asyncio.Lock()

    async def open(self) -> aiosqlite.Connection:
        async with self._lock:
            if self._db is None:
                self._db = await create_database(self._db_path)
            return self._db

    @property
    def connection(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("DatabasePool not opened — call await pool.open() first")
        return self._db

    async def close(self) -> None:
        async with self._lock:
            if self._db is not None:
                await self._db.close()
                self._db = None

    async def __aenter__(self) -> "DatabasePool":
        await self.open()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()
