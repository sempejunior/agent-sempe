"""SQLite async connection pool using aiosqlite."""

from __future__ import annotations

import asyncio
import os
import sqlite3
from pathlib import Path

import aiosqlite
from loguru import logger

from nanobot.db.sqlite.migrations import apply_migrations


def _ensure_writable(path: Path) -> None:
    """Ensure the database file is writable by the current process.

    On FUSE mounts (SSHFS, NFS) the database may have been created by a
    previous container running as a different uid.  The current process can
    read but not write to it.  Fix by rewriting the file via SQLite's backup
    API — the copy inherits the current process's effective uid.  The backup
    API is used instead of a raw file copy so that pending writes still in
    the -wal file are folded into the snapshot; a raw copy plus a WAL delete
    would lose recent transactions.
    """
    if not path.exists():
        return
    if os.access(str(path), os.W_OK):
        return

    logger.warning("Database {} is read-only, recreating with correct ownership", path.name)
    tmp = path.with_suffix(".tmp")
    if tmp.exists():
        tmp.unlink()

    src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        dst = sqlite3.connect(str(tmp))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()

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
    _checkpoint_and_drop_wal(path)

    db = await aiosqlite.connect(str(path))
    db.row_factory = aiosqlite.Row

    await db.execute("PRAGMA journal_mode=DELETE")
    await db.execute("PRAGMA synchronous=FULL")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.execute("PRAGMA busy_timeout=5000")

    await apply_migrations(db)
    return db


def _checkpoint_and_drop_wal(path: Path) -> None:
    """Fold any pending WAL contents into the main DB and drop the -wal/-shm files.

    Legacy DBs left over from the previous WAL-mode configuration may have a
    non-empty -wal file when we boot into DELETE mode. Opening straight into
    DELETE mode without checkpointing would discard those pending writes, so
    we run a synchronous WAL checkpoint here before switching modes.
    """
    if not path.exists():
        return
    wal = path.with_name(path.name + "-wal")
    if not wal.exists() or wal.stat().st_size == 0:
        return
    conn = sqlite3.connect(str(path))
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("PRAGMA journal_mode=DELETE")
        conn.commit()
    finally:
        conn.close()
    for suffix in ("-wal", "-shm"):
        stale = path.with_name(path.name + suffix)
        if stale.exists():
            try:
                stale.unlink()
            except OSError:
                pass


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
