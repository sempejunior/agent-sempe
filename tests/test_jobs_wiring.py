"""A capacidade só existe se atravessar a fiação até o registro de tools do agente.

Cada elo aqui já falhou em algum ponto do caminho: catálogo sem a entrada, contexto
sem o repositório, tool sem o runner, e turno sem a origem — que é o elo que faz a
resposta voltar para a conversa certa em vez de se perder.
"""

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from nanobot.agent.loop import AgentLoop
from nanobot.agent.user_context import build_tool_registry


@pytest.fixture
def wiring(tmp_path):
    integration_repo = AsyncMock()
    credential_repo = AsyncMock()
    return {
        "workspace": tmp_path,
        "bus": AsyncMock(),
        "user_id": "u1",
        "agent_id": "a1",
        "job_repo": AsyncMock(),
        "job_runner": AsyncMock(),
        "question_repo": AsyncMock(),
        "integration_repo": integration_repo,
        "credential_repo": credential_repo,
        "active_integrations": {"kiro"},
    }


def _registry(wiring, **overrides):
    args = {**wiring, **overrides}
    workspace = args.pop("workspace")
    bus = args.pop("bus")
    return build_tool_registry(["code_agent"], workspace, bus, **args)


def test_the_jobs_tool_reaches_the_registry(wiring):
    assert _registry(wiring).has("jobs")


def test_without_a_job_repository_the_tool_does_not_exist(wiring):
    """Melhor ausente do que presente e sem efeito."""
    assert not _registry(wiring, job_repo=None).has("jobs")


def test_the_runner_reaches_the_code_agent_tool(wiring):
    tool = _registry(wiring).get("code_agent")

    assert "background" in tool.parameters["properties"]


def test_without_a_runner_the_code_agent_has_no_background_option(wiring):
    tool = _registry(wiring, job_runner=None).get("code_agent")

    assert "background" not in tool.parameters["properties"]


def test_the_ask_human_tool_reaches_the_registry(wiring):
    assert _registry(wiring).has("ask_human")


def test_without_a_question_repository_the_tool_does_not_exist(wiring):
    assert not _registry(wiring, question_repo=None).has("ask_human")


def test_the_turn_tells_every_tool_where_to_answer(wiring):
    """Sem a origem, nem a conclusão do job nem a resposta de uma pendência sabem
    em que conversa aterrissar."""
    registry = _registry(wiring)

    AgentLoop._set_tool_context(
        object.__new__(AgentLoop), "web", "abc123",
        tools=registry, user_id="u1", agent_id="a1",
    )

    for name in ("code_agent", "ask_human"):
        tool = registry.get(name)
        assert tool._origin_channel == "web", name
        assert tool._origin_chat_id == "abc123", name
        assert tool._agent_id == "a1", name


def test_the_declared_ceiling_survives_the_registry(wiring):
    """O teto do code_agent era inalcançável: o registry cortava aos 180s."""
    from nanobot.agent.tools.registry import DEFAULT_TOOL_TIMEOUT_S

    tool = _registry(wiring).get("code_agent")

    assert tool.timeout_s > DEFAULT_TOOL_TIMEOUT_S
    assert tool.parallel_safe is False


def test_the_agent_loop_exposes_a_slot_for_the_runner(tmp_path):
    """Wiring acontece depois da construção: o runner precisa deste loop."""
    loop = AgentLoop(bus=AsyncMock(), provider=AsyncMock(), workspace=Path(tmp_path))

    assert loop.job_runner is None
