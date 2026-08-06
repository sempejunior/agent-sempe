"""Testes do catálogo de tools e da montagem do registry a partir dele."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from nanobot.agent.tools.catalog import CATALOG, get_spec, serialize_catalog
from nanobot.agent.user_context import build_tool_registry

_PERMISSIONS = {"repo", "exec", "computer", "browser", "screenshot", "cron",
                "message", "save_mcp_server"}


@pytest.fixture
def full_context(tmp_path):
    """Contexto com todas as dependências satisfeitas."""
    return dict(
        workspace=tmp_path,
        bus=MagicMock(publish_outbound=AsyncMock()),
        cron_service=MagicMock(),
        user_id="u1",
        skill_repo=AsyncMock(),
        user_repo=AsyncMock(),
        memory_store=MagicMock(),
        retriever_store=MagicMock(),
        integration_repo=AsyncMock(),
        credential_repo=AsyncMock(),
    )


def test_catalog_ids_are_unique():
    ids = [spec.id for spec in CATALOG]
    assert len(ids) == len(set(ids))


def test_permission_set_is_exactly_the_consequential_tools():
    assert {spec.id for spec in CATALOG if spec.permission} == _PERMISSIONS


def test_every_permission_explains_its_risk():
    for spec in CATALOG:
        if spec.permission:
            assert spec.warn, f"{spec.id} é permissão e precisa de warn"


def test_infrastructure_tools_never_carry_a_warning():
    for spec in CATALOG:
        if not spec.permission:
            assert not spec.warn


def test_serialize_catalog_exposes_the_ui_contract():
    rows = serialize_catalog()
    assert len(rows) == len(CATALOG)
    assert set(rows[0]) == {"id", "label", "category", "permission", "warn",
                            "requires", "integrations"}


def test_infrastructure_is_registered_without_being_granted(full_context):
    registry = build_tool_registry(tools_enabled=[], **full_context)

    for tool_id in ("save_memory", "search_memory", "rag_search", "read_skill",
                    "publish_page", "publish_report", "http_call", "web_search",
                    "read_file", "write_file", "cnpj_lookup", "cct_search"):
        assert registry.has(tool_id), f"{tool_id} deveria vir sempre"


def test_permissions_are_absent_until_granted(full_context):
    registry = build_tool_registry(tools_enabled=[], **full_context)

    for tool_id in ("exec", "cron", "message", "save_mcp_server"):
        assert not registry.has(tool_id), f"{tool_id} não deveria vir sem permissão"


def test_granting_a_permission_registers_it(full_context):
    registry = build_tool_registry(tools_enabled=["exec", "cron"], **full_context)

    assert registry.has("exec")
    assert registry.has("cron")
    assert not registry.has("message")


def test_missing_dependency_removes_the_tool(tmp_path):
    registry = build_tool_registry(
        tools_enabled=["cron"], workspace=tmp_path, bus=MagicMock(),
    )

    assert not registry.has("save_memory")
    assert not registry.has("rag_search")
    assert not registry.has("http_call")
    assert not registry.has("cron")
    assert registry.has("read_file")


def test_repo_tool_follows_the_git_capable_integrations(full_context):
    """A tool de repositório só existe quando há uma origem git ativa."""
    without = build_tool_registry(tools_enabled=["repo"], **full_context)
    assert not without.has("repo")

    with_gitlab = build_tool_registry(
        tools_enabled=["repo"], active_integrations={"gitlab"}, **full_context,
    )
    assert with_gitlab.has("repo")


def test_repo_tool_needs_the_permission(full_context):
    registry = build_tool_registry(
        tools_enabled=[], active_integrations={"gitlab"}, **full_context,
    )
    assert not registry.has("repo")


def test_git_origins_come_from_the_integration_catalog():
    """A lista de origens é derivada, não escrita à mão."""
    from nanobot.integrations.catalog import CATALOG as INTEGRATIONS
    spec = get_spec("repo")
    assert set(spec.integrations) == {e.id for e in INTEGRATIONS if e.git}
    assert "gitlab" in spec.integrations


def test_vendor_tool_follows_the_activated_integration(full_context):
    without = build_tool_registry(tools_enabled=[], **full_context)
    assert not without.has("azure_devops_report")

    with_azure = build_tool_registry(
        tools_enabled=[], active_integrations={"azure_devops"}, **full_context,
    )
    assert with_azure.has("azure_devops_report")


def test_display_tools_require_a_display(monkeypatch, full_context):
    monkeypatch.delenv("DISPLAY", raising=False)
    registry = build_tool_registry(
        tools_enabled=["computer", "browser", "screenshot"], **full_context,
    )

    assert not registry.has("computer")
    assert not registry.has("browser")
    assert not registry.has("screenshot")


def test_unknown_ids_in_tools_enabled_are_ignored(full_context):
    registry = build_tool_registry(tools_enabled=["nao_existe"], **full_context)

    assert not registry.has("nao_existe")
    assert registry.has("publish_page")


def test_get_spec_finds_and_misses():
    assert get_spec("exec").permission is True
    assert get_spec("nao_existe") is None
