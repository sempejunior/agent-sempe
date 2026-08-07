"""Testes da tool http_call, com foco na injeção de identidade pela credencial."""

import json
from unittest.mock import AsyncMock

import httpx
import pytest

from nanobot.agent.tools.http_call import HttpCallTool
from nanobot.integrations.catalog import get_integration
from nanobot.utils import crypto

_CREDENTIAL = {
    "base_url": "http://start.local/internal/v1",
    "api_key": "chave-secreta",
    "tenant_id": "tenant-1",
    "company_id": "company-1",
    "user_id": "user-1",
}


@pytest.fixture(autouse=True)
def master_key(tmp_path):
    """A tool descriptografa credenciais; os testes precisam de uma chave própria."""
    crypto.ensure_master_key(tmp_path)


def _make_tool(credential: dict, *, slug: str = "start_colaborador",
               system_integration_id: str = "solides_start") -> HttpCallTool:
    integration_repo = AsyncMock()
    integration_repo.get_integration.return_value = {
        "slug": slug,
        "kind": "api",
        "enabled": True,
        "system_integration_id": system_integration_id,
        "credential_id": 1,
        "config": {},
    }
    credential_repo = AsyncMock()
    credential_repo.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(json.dumps(credential)),
    }
    return HttpCallTool(
        user_id="u1", integration_repo=integration_repo, credential_repo=credential_repo,
    )


@pytest.fixture
def captured(monkeypatch):
    """Intercepta a requisição saindo e devolve o objeto httpx.Request enviado."""
    calls: list[httpx.Request] = []

    async def fake_request(self, method, url, **kwargs):
        request = httpx.Request(
            method, url, params=kwargs.get("params"), json=kwargs.get("json"),
            headers=kwargs.get("headers"),
        )
        calls.append(request)
        return httpx.Response(200, json={"success": True, "data": {"notified": True}},
                              request=request)

    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)
    return calls


def _body(request: httpx.Request) -> dict:
    return json.loads(request.content)


async def test_injects_integration_level_identity_into_body(captured):
    tool = _make_tool(_CREDENTIAL)

    await tool.execute(
        integration_slug="start_colaborador",
        endpoint_key="notify_lateness",
        body={"expectedArrivalTime": "09:30"},
    )

    body = _body(captured[0])
    assert body["tenantId"] == "tenant-1"
    assert body["companyId"] == "company-1"
    assert body["userId"] == "user-1"
    assert body["expectedArrivalTime"] == "09:30"


async def test_endpoint_level_injection_adds_its_own_field(captured):
    tool = _make_tool(_CREDENTIAL)

    await tool.execute(
        integration_slug="start_colaborador",
        endpoint_key="list_my_payslips",
        body={"competencia": "06/2026"},
    )

    body = _body(captured[0])
    assert body["employeeUserId"] == "user-1"
    assert body["tenantId"] == "tenant-1"
    assert body["competencia"] == "06/2026"


async def test_credential_overrides_identity_sent_by_the_model(captured):
    tool = _make_tool(_CREDENTIAL)

    await tool.execute(
        integration_slug="start_colaborador",
        endpoint_key="notify_absence",
        body={"tenantId": "outro-tenant", "userId": "vitima", "reason": "consulta"},
    )

    body = _body(captured[0])
    assert body["tenantId"] == "tenant-1"
    assert body["userId"] == "user-1"
    assert body["reason"] == "consulta"


async def test_empty_credential_field_is_left_out_of_the_body(captured):
    tool = _make_tool({**_CREDENTIAL, "company_id": ""})

    await tool.execute(
        integration_slug="start_colaborador",
        endpoint_key="notify_absence",
        body={},
    )

    body = _body(captured[0])
    assert "companyId" not in body
    assert body["tenantId"] == "tenant-1"


async def test_injection_creates_the_body_when_the_model_sends_none(captured):
    tool = _make_tool(_CREDENTIAL)

    await tool.execute(
        integration_slug="start_colaborador",
        endpoint_key="list_received_feedbacks",
    )

    body = _body(captured[0])
    assert body["recipientUserId"] == "user-1"
    assert body["tenantId"] == "tenant-1"


async def test_credential_base_url_and_api_key_header_are_used(captured):
    tool = _make_tool(_CREDENTIAL)

    await tool.execute(
        integration_slug="start_colaborador",
        endpoint_key="notify_lateness",
        body={},
    )

    request = captured[0]
    assert str(request.url) == "http://start.local/internal/v1/start/hr-ops-api/notify-lateness"
    assert request.headers["X-Internal-Api-Key"] == "chave-secreta"


async def test_integration_without_body_injection_is_untouched(captured):
    tool = _make_tool({"token": "ghp_x"}, slug="github", system_integration_id="github")

    await tool.execute(
        integration_slug="github",
        endpoint_key="create_issue",
        path_params={"owner": "acme", "repo": "app"},
        body={"title": "bug"},
    )

    request = captured[0]
    assert _body(request) == {"title": "bug"}
    assert request.headers["Authorization"] == "Bearer ghp_x"


def test_solides_start_endpoints_declare_only_known_credential_fields():
    entry = get_integration("solides_start")
    assert entry is not None and entry.api is not None
    known = {field.key for field in entry.credential_fields}

    mapped = set(entry.api.body_from_credential.values())
    for endpoint in entry.api.endpoints:
        mapped.update(endpoint.body_from_credential.values())

    assert mapped <= known


async def test_the_integration_default_query_is_applied(captured, monkeypatch):
    """api-version é constante da integração, não lembrança do modelo."""
    tool = _make_tool({"organization": "acme", "pat": "segredo"},
                      slug="azure_devops", system_integration_id="azure_devops")

    await tool.execute(integration_slug="azure_devops", endpoint_key="get_work_item",
                       path_params={"id": "42"})

    assert "api-version=7.1" in str(captured[0].url)


async def test_the_model_can_override_a_default_query(captured):
    tool = _make_tool({"organization": "acme", "pat": "segredo"},
                      slug="azure_devops", system_integration_id="azure_devops")

    await tool.execute(integration_slug="azure_devops", endpoint_key="get_work_item",
                       path_params={"id": "42"}, query={"api-version": "6.0"})

    assert "api-version=6.0" in str(captured[0].url)
