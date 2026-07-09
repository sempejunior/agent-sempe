"""Fixtures compartilhadas para testes de repositório.

Cada teste recebe um `repos` (RepositoryFactory) apoiado num SQLite temporário e
isolado, com as migrações já aplicadas.
"""

import pytest_asyncio

from nanobot.db.factory import create_sqlite_factory
from nanobot.db.sqlite.connection import create_database


@pytest_asyncio.fixture
async def repos(tmp_path):
    db = await create_database(str(tmp_path / "test.db"))
    try:
        yield create_sqlite_factory(db)
    finally:
        await db.close()
