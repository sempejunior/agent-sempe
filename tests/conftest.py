"""Fixtures compartilhadas para testes de repositório.

Cada teste recebe um `repos` (RepositoryFactory) apoiado num SQLite temporário e
isolado, com as migrações já aplicadas.
"""

import pytest
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


class _FakeProvider:
    """Provider mínimo: os endpoints de CRUD/auth não chamam o LLM."""

    def get_default_model(self) -> str:
        return "test-model"

    async def chat(self, *args, **kwargs):
        raise AssertionError("LLM não deveria ser chamado nestes testes")


@pytest.fixture
def client(tmp_path):
    """TestClient HTTP com app real: DB temporário, provider fake, sem rede.

    O startup do app monta repos/agent no mesmo event loop do TestClient, então
    não há mistura de loops com o aiosqlite.
    """
    from fastapi.testclient import TestClient

    from nanobot.config.schema import Config
    from nanobot.web.server import create_app

    config = Config()
    app = create_app(config=config, provider=_FakeProvider(), data_dir=tmp_path)
    with TestClient(app) as test_client:
        yield test_client
