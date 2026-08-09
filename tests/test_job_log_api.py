"""Testes do log da delegação servido por HTTP: só do dono, e sem o segredo."""

import json

import pytest_asyncio

from nanobot.agent.tools.code_agent import read_delegation_log


class _FakeIntegrations:
    def __init__(self, rows):
        self._rows = rows

    async def get_integration(self, user_id, slug):
        return self._rows.get(slug)


class _FakeCredentials:
    def __init__(self, secrets):
        self._secrets = secrets

    async def get_credential(self, user_id, credential_id):
        from nanobot.utils.crypto import encrypt

        payload = self._secrets.get(credential_id)
        return {"secret_cipher": encrypt(json.dumps(payload))} if payload else None


@pytest_asyncio.fixture
async def key(tmp_path):
    from nanobot.utils.crypto import ensure_master_key

    ensure_master_key(tmp_path)
    return True


async def test_the_credential_never_leaves_the_server(tmp_path, key):
    """O arquivo em disco guarda o que a CLI imprimiu, sem filtro nenhum."""
    log = tmp_path / "delegation.log"
    log.write_text(
        "usando token sk-ant-oat01-supersecreto\nterminei o trabalho\n",
        encoding="utf-8",
    )

    text = await read_delegation_log(
        str(log), user_id="u1",
        integration_repo=_FakeIntegrations({
            "claude_code": {"credential_id": 1, "enabled": True},
        }),
        credential_repo=_FakeCredentials({1: {"oauth_token": "sk-ant-oat01-supersecreto"}}),
    )

    assert "sk-ant-oat01-supersecreto" not in text
    assert "***" in text
    assert "terminei o trabalho" in text


async def test_a_log_that_never_mentions_the_secret_is_untouched(tmp_path, key):
    log = tmp_path / "delegation.log"
    log.write_text("2 arquivos alterados\n", encoding="utf-8")

    text = await read_delegation_log(
        str(log), user_id="u1",
        integration_repo=_FakeIntegrations({}),
        credential_repo=_FakeCredentials({}),
    )

    assert text == "2 arquivos alterados\n"


async def test_a_missing_log_is_empty_not_an_error(tmp_path, key):
    text = await read_delegation_log(
        str(tmp_path / "sumiu.log"), user_id="u1",
        integration_repo=_FakeIntegrations({}),
        credential_repo=_FakeCredentials({}),
    )

    assert text == ""


def test_the_log_of_someone_elses_job_is_not_served(client):
    client.post("/api/auth/register", json={"user_id": "alice"})
    client.post("/api/auth/register", json={"user_id": "bob"})

    r = client.get("/api/jobs/code_abc/log", headers={"Authorization": "Bearer bob"})

    assert r.status_code == 404
