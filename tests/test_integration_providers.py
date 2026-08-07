"""Testes do catálogo por fornecedor: uma credencial serve todos os transportes."""

import json
from unittest.mock import AsyncMock

import pytest

from nanobot.integrations.catalog import (
    CATALOG,
    AuthSpec,
    build_auth_headers,
    get_integration,
)
from nanobot.utils import crypto


@pytest.fixture(autouse=True)
def master_key(tmp_path):
    crypto.ensure_master_key(tmp_path)


def test_every_entry_belongs_to_a_provider():
    for entry in CATALOG:
        assert entry.provider_id, entry.id


def test_the_api_and_the_mcp_of_a_vendor_share_the_provider():
    """É o que faz o cliente colar o PAT uma vez em vez de duas."""
    assert get_integration("azure_devops").provider_id == "azure_devops"
    assert get_integration("mcp_azure_devops").provider_id == "azure_devops"
    assert get_integration("mcp_github").provider_id == "github"
    assert get_integration("mcp_atlassian").provider_id == "jira"


def test_a_shared_field_means_the_same_thing_in_every_transport():
    """A credencial é uma só, então um mesmo key não pode ter dois significados.

    Transportes do mesmo fornecedor podem pedir campos diferentes — o MCP do
    Slack precisa do team_id que a API não usa, e a UI cadastra a união. O que
    não pode é o mesmo key ser texto num lugar e senha noutro, ou obrigatório
    num e opcional noutro: o cliente preencheria um formulário contraditório.
    """
    seen: dict[tuple[str, str], object] = {}
    for entry in CATALOG:
        for f in entry.credential_fields:
            key = (entry.provider_id, f.key)
            previous = seen.get(key)
            if previous is None:
                seen[key] = f
                continue
            assert (f.kind, f.required) == (previous.kind, previous.required), \
                f"{entry.id} declara {f.key} diferente do resto de {entry.provider_id}"


def test_the_code_agent_cli_is_not_an_api():
    """Ele aparecia no catálogo como API e não tem endpoint nenhum."""
    kiro = get_integration("kiro")

    assert kiro.kind == "cli"
    assert kiro.api is None


def test_no_api_entry_is_left_without_endpoints():
    for entry in CATALOG:
        if entry.kind == "api":
            assert entry.api and entry.api.endpoints, entry.id


def test_basic_auth_headers_are_composed_from_two_fields():
    """O MCP remoto da Atlassian exige Basic base64(email:token)."""
    headers = build_auth_headers(
        AuthSpec(mode="basic", username_field="email", password_field="api_token"),
        {"email": "a@b.c", "api_token": "t0k"},
    )

    import base64
    assert headers["Authorization"].startswith("Basic ")
    decoded = base64.b64decode(headers["Authorization"].split(" ", 1)[1]).decode()
    assert decoded == "a@b.c:t0k"


def test_no_auth_header_when_the_credential_is_empty():
    assert build_auth_headers(AuthSpec(mode="bearer", secret_field="token"), {}) == {}
    assert build_auth_headers(AuthSpec(mode="none"), {"token": "x"}) == {}


async def test_a_hosted_mcp_server_gets_its_auth_header(tmp_path):
    """Sem isso o servidor remoto subia sem autenticação e falhava na 1a chamada."""
    from nanobot.integrations.mcp_launcher import build_user_mcp_servers

    repos = AsyncMock()
    repos.integrations.list_integrations.return_value = [{
        "slug": "mcp_atlassian", "kind": "mcp", "enabled": True,
        "system_integration_id": "mcp_atlassian", "credential_id": 1,
    }]
    repos.credentials.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(
            json.dumps({"email": "a@b.c", "api_token": "t0k"})),
    }

    servers, _ = await build_user_mcp_servers("u1", repos)

    server = servers["mcp_atlassian"]
    assert server.url == "https://mcp.atlassian.com/v1/mcp"
    assert server.headers["Authorization"].startswith("Basic ")


async def test_a_stdio_mcp_server_still_gets_its_env(tmp_path):
    from nanobot.integrations.mcp_launcher import build_user_mcp_servers

    repos = AsyncMock()
    repos.integrations.list_integrations.return_value = [{
        "slug": "mcp_azure_devops", "kind": "mcp", "enabled": True,
        "system_integration_id": "mcp_azure_devops", "credential_id": 1,
    }]
    repos.credentials.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(
            json.dumps({"organization": "acme", "pat": "segredo"})),
    }

    servers, _ = await build_user_mcp_servers("u1", repos)

    server = servers["mcp_azure_devops"]
    assert server.command
    assert "segredo" in json.dumps(server.env)


def test_the_catalog_endpoint_exposes_the_provider(client):
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.get("/api/integrations/catalog",
                   headers={"Authorization": "Bearer u1"})

    assert r.status_code == 200, r.text
    by_id = {e["id"]: e for e in r.json()}
    assert by_id["mcp_azure_devops"]["provider"] == "azure_devops"
    assert by_id["kiro"]["kind"] == "cli"


async def test_a_cli_integration_is_not_described_as_an_http_api(tmp_path):
    """Descrita como API, o modelo tentaria http_call num binário local."""
    from nanobot.agent.context import ContextBuilder

    integration_repo = AsyncMock()
    integration_repo.list_integrations.return_value = [
        {"slug": "kiro", "kind": "cli", "label": "Kiro (agente de código)"},
    ]
    builder = ContextBuilder(
        workspace=tmp_path, user_id="u1", integration_repo=integration_repo,
    )
    builder._mode = "db"

    section = await builder._build_integrations_section()

    assert "`kiro`" in section
    assert "CLI local" in section
    assert "http_call(integration_slug='kiro'" not in section


def test_every_credential_asks_with_instructions():
    """Um campo de segredo sem instrução é o cliente adivinhando onde clicar."""
    for entry in CATALOG:
        if not entry.credential_fields:
            continue
        assert len(entry.setup_steps) >= 2, f"{entry.id} tem {len(entry.setup_steps)} passos"
        for f in entry.credential_fields:
            assert f.hint.strip(), f"{entry.id}.{f.key} sem hint"


def test_an_entry_without_a_public_page_explains_who_provides_the_secret():
    """Integração interna não tem página pública, e inventar uma URL é pior que
    não ter. O que não pode é o cliente ficar sem saber a quem pedir."""
    for entry in CATALOG:
        if not entry.credential_fields:
            continue
        if entry.docs_url or entry.credential_url:
            continue
        assert len(entry.setup_steps) >= 3, entry.id
        assert any("peça" in s.lower() or "time" in s.lower() or "administra" in s.lower()
                   for s in entry.setup_steps), entry.id


def test_a_credential_url_is_a_real_url():
    for entry in CATALOG:
        if entry.credential_url:
            assert entry.credential_url.startswith("https://"), entry.id


def test_the_canonical_entry_carries_the_instructions():
    """Passos de credencial pertencem ao fornecedor; transporte só fala de transporte."""
    by_provider: dict[str, list] = {}
    for entry in CATALOG:
        by_provider.setdefault(entry.provider_id, []).append(entry)

    for provider, entries in by_provider.items():
        if len(entries) < 2:
            continue
        canonical = next((e for e in entries if e.id == provider), entries[0])
        assert len(canonical.setup_steps) >= 3, provider
        for entry in entries:
            if entry is canonical:
                continue
            assert len(entry.setup_steps) <= len(canonical.setup_steps), \
                f"{entry.id} repete as instruções de {provider}"


def test_no_mcp_entry_launches_a_deprecated_reference_server():
    """@modelcontextprotocol/server-* foram arquivados: são interruptores mortos."""
    for entry in CATALOG:
        if not entry.mcp:
            continue
        args = " ".join(entry.mcp.args)
        assert "@modelcontextprotocol/server-" not in args, entry.id


def test_a_hosted_mcp_declares_how_it_authenticates():
    """Sem AuthSpec o servidor remoto sobe sem credencial e falha na 1a chamada."""
    for entry in CATALOG:
        if entry.mcp and entry.mcp.url and entry.credential_fields:
            assert entry.auth.mode != "none", entry.id
