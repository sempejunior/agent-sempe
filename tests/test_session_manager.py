"""Testes da sessão relida: o horário de cada mensagem sobrevive ao recarregamento."""

import pytest_asyncio

from nanobot.session.manager import SessionManager


@pytest_asyncio.fixture
async def manager(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    return SessionManager(
        session_repo=repos.sessions, message_repo=repos.messages,
        user_id="u1", agent_id="a1",
    )


async def test_a_reloaded_message_keeps_its_time(manager):
    """A coluna chama timestamp; ler created_at devolvia string vazia sempre."""
    session = await manager.get_or_create("web:abc")
    session.add_message("user", "Resolve a demanda 41235")
    await manager.save(session)
    manager.invalidate("web:abc")

    reloaded = await manager.get_or_create("web:abc")

    assert reloaded.messages[0]["timestamp"]
    assert reloaded.messages[0]["content"] == "Resolve a demanda 41235"


async def test_what_the_agent_did_survives_the_reload(manager):
    session = await manager.get_or_create("web:abc")
    session.add_message("assistant", None, tool_calls=[
        {"id": "call_1", "type": "function",
         "function": {"name": "repo", "arguments": '{"action":"ensure"}'}},
    ])
    session.add_message("tool", "clonado", tool_call_id="call_1", name="repo")
    await manager.save(session)
    manager.invalidate("web:abc")

    reloaded = await manager.get_or_create("web:abc")

    assert reloaded.messages[0]["tool_calls"][0]["function"]["name"] == "repo"
    assert reloaded.messages[1]["tool_call_id"] == "call_1"
