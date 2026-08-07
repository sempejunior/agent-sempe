"""Testes do backfill de limites de usuários já criados."""

import json

import aiosqlite
import pytest

from nanobot.db.sqlite.migrations import _backfill_user_limits, apply_migrations
from nanobot.db.sqlite.user_repo import _DEFAULT_LIMITS


@pytest.fixture
async def db(tmp_path):
    conn = await aiosqlite.connect(tmp_path / "t.db")
    await apply_migrations(conn)
    yield conn
    await conn.close()


async def _insert(conn, user_id: str, limits: dict) -> None:
    await conn.execute(
        "INSERT INTO users (user_id, display_name, limits) VALUES (?, ?, ?)",
        (user_id, user_id, json.dumps(limits)),
    )
    await conn.commit()


async def _limits(conn, user_id: str) -> dict:
    cursor = await conn.execute("SELECT limits FROM users WHERE user_id = ?", (user_id,))
    row = await cursor.fetchone()
    return json.loads(row[0])


async def test_an_outdated_exec_ceiling_is_lifted(db):
    await _insert(db, "antigo", {"max_exec_timeout_s": 30})

    await _backfill_user_limits(db)

    assert (await _limits(db, "antigo"))["max_exec_timeout_s"] == 900


async def test_the_missing_job_duration_is_added(db):
    await _insert(db, "antigo", {"max_exec_timeout_s": 30})

    await _backfill_user_limits(db)

    assert (await _limits(db, "antigo"))["max_job_duration_s"] == 1800


async def test_the_dead_sandbox_keys_are_removed(db):
    await _insert(db, "antigo", {"sandbox_memory": "256m", "sandbox_cpu": "0.5"})

    await _backfill_user_limits(db)

    limits = await _limits(db, "antigo")
    assert "sandbox_memory" not in limits
    assert "sandbox_cpu" not in limits


async def test_a_customized_limit_is_left_alone(db):
    await _insert(db, "generoso", {"max_exec_timeout_s": 3600, "max_sessions": 5})

    await _backfill_user_limits(db)

    limits = await _limits(db, "generoso")
    assert limits["max_exec_timeout_s"] == 3600
    assert limits["max_sessions"] == 5


async def test_an_empty_limits_column_gets_the_defaults(db):
    await _insert(db, "vazio", {})

    await _backfill_user_limits(db)

    assert await _limits(db, "vazio") == _DEFAULT_LIMITS


async def test_running_twice_changes_nothing(db):
    await _insert(db, "antigo", {"max_exec_timeout_s": 30, "sandbox_cpu": "0.5"})

    await _backfill_user_limits(db)
    first = await _limits(db, "antigo")
    await _backfill_user_limits(db)

    assert await _limits(db, "antigo") == first


async def test_a_corrupt_limits_column_is_replaced_by_the_defaults(db):
    await db.execute(
        "INSERT INTO users (user_id, display_name, limits) VALUES (?, ?, ?)",
        ("quebrado", "quebrado", "isso nao e json"),
    )
    await db.commit()

    await _backfill_user_limits(db)

    assert await _limits(db, "quebrado") == _DEFAULT_LIMITS
