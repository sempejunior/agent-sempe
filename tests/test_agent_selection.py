"""Testes da seleção de agente em canais compartilhados (client/selection.py)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

from nanobot.bus.events import InboundMessage
from nanobot.client.selection import (
    SelectionDecision,
    list_channel_agents,
    resolve_selection,
)

CHANNEL = "telegram"


async def _setup(repos, agent_specs):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    for spec in agent_specs:
        await repos.agents.create_agent("u1", spec)
    await repos.clients.create({"client_id": "c1", "owner_id": "u1"})


def _agent_spec(agent_id, name, *, enabled=True, role="", channel=CHANNEL):
    return {
        "agent_id": agent_id,
        "name": name,
        "role": role,
        "channel_configs": {channel: {"enabled": enabled}} if enabled else {},
    }


def _msg(content, channel=CHANNEL):
    return InboundMessage(
        channel=channel, sender_id="s1", chat_id="chat1",
        content=content, user_id="u1",
    )


async def _resolve(repos, content, channel=CHANNEL):
    return await resolve_selection(
        _msg(content, channel), "u1", "c1",
        agents=repos.agents, clients=repos.clients,
    )


async def _client_meta(repos):
    client = await repos.clients.get("c1")
    return json.loads(client["metadata"] or "{}")


async def test_single_enabled_agent_routes_without_prompt(repos):
    await _setup(repos, [_agent_spec("a1", "Solo")])
    decision = await _resolve(repos, "oi")
    assert decision == SelectionDecision(agent_id="a1")


async def test_zero_enabled_agents_returns_empty_decision(repos):
    await _setup(repos, [_agent_spec("a1", "Off", enabled=False)])
    decision = await _resolve(repos, "oi")
    assert decision == SelectionDecision()


async def test_multiple_agents_first_message_returns_picker_and_sets_pending(repos):
    await _setup(repos, [
        _agent_spec("a1", "PDI", role="Desenvolvimento de pessoas"),
        _agent_spec("a2", "Paulo"),
    ])
    decision = await _resolve(repos, "oi")
    assert decision.agent_id is None
    assert "1. PDI — Desenvolvimento de pessoas" in decision.reply
    assert "2. Paulo" in decision.reply
    meta = await _client_meta(repos)
    assert meta["agent_picker"][CHANNEL]["options"] == ["a1", "a2"]


async def test_pending_numeric_reply_selects_and_confirms(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    decision = await _resolve(repos, "2")
    assert decision.agent_id == "a2"
    assert "Paulo" in decision.reply
    meta = await _client_meta(repos)
    assert meta["selected_agent"][CHANNEL] == "a2"
    assert CHANNEL not in meta["agent_picker"]


async def test_pending_name_reply_selects(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    decision = await _resolve(repos, "paulo")
    assert decision.agent_id == "a2"


async def test_pending_invalid_reply_reprompts(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    decision = await _resolve(repos, "quero o melhor")
    assert decision.agent_id is None
    assert "Não entendi" in decision.reply
    assert "1. PDI" in decision.reply


async def test_stored_selection_routes_directly(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    await _resolve(repos, "1")
    decision = await _resolve(repos, "me ajuda com um PDI")
    assert decision == SelectionDecision(agent_id="a1")


async def test_stale_selection_reprompts(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    await _resolve(repos, "1")
    await repos.agents.update_agent("u1", "a1", {"channel_configs": {}})
    await repos.agents.create_agent("u1", _agent_spec("a3", "Novo"))
    decision = await _resolve(repos, "oi de novo")
    assert decision.agent_id is None
    assert "escolha o agente" in decision.reply


async def test_agente_command_reopens_picker_and_clears_selection(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    await _resolve(repos, "1")
    decision = await _resolve(repos, "/agente")
    assert decision.agent_id is None
    assert "1. PDI" in decision.reply
    meta = await _client_meta(repos)
    assert CHANNEL not in meta["selected_agent"]
    assert meta["agent_picker"][CHANNEL]["options"] == ["a1", "a2"]


async def test_agent_disabled_between_prompt_and_reply_is_rejected(repos):
    await _setup(repos, [
        _agent_spec("a1", "PDI"),
        _agent_spec("a2", "Paulo"),
        _agent_spec("a3", "Extra"),
    ])
    await _resolve(repos, "oi")
    await repos.agents.update_agent("u1", "a1", {"channel_configs": {}})
    decision = await _resolve(repos, "1")
    assert decision.agent_id is None
    assert "Não entendi" in decision.reply


async def test_selection_is_per_channel(repos):
    await _setup(repos, [
        {
            "agent_id": "a1", "name": "PDI",
            "channel_configs": {
                "telegram": {"enabled": True},
                "whatsapp": {"enabled": True},
            },
        },
        {
            "agent_id": "a2", "name": "Paulo",
            "channel_configs": {
                "telegram": {"enabled": True},
                "whatsapp": {"enabled": True},
            },
        },
    ])
    await _resolve(repos, "oi", channel="telegram")
    await _resolve(repos, "1", channel="telegram")
    decision = await _resolve(repos, "oi", channel="whatsapp")
    assert decision.agent_id is None
    assert "escolha o agente" in decision.reply


async def test_single_agent_cleans_stale_state(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    await _resolve(repos, "2")
    await repos.agents.update_agent("u1", "a2", {"channel_configs": {}})
    decision = await _resolve(repos, "oi")
    assert decision == SelectionDecision(agent_id="a1")
    meta = await _client_meta(repos)
    assert not meta.get("selected_agent")
    assert not meta.get("agent_picker")


async def test_help_on_shared_channel_mentions_agente_command(repos):
    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])
    await _resolve(repos, "oi")
    await _resolve(repos, "1")
    decision = await _resolve(repos, "/help")
    assert decision.agent_id is None
    assert "/agente" in decision.reply
    assert "PDI" in decision.reply


async def test_list_channel_agents_filters_by_channel_and_status(repos):
    await _setup(repos, [
        _agent_spec("a1", "PDI"),
        _agent_spec("a2", "Off", enabled=False),
        _agent_spec("a3", "Zap", channel="whatsapp"),
    ])
    enabled = await list_channel_agents(repos.agents, "u1", CHANNEL)
    assert [a["agent_id"] for a in enabled] == ["a1"]


async def test_loop_intercepts_and_returns_picker(repos, tmp_path):
    from nanobot.agent.loop import AgentLoop
    from nanobot.bus.queue import MessageBus
    from nanobot.client.loop import ClientAwareAgentLoop

    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])

    provider = AsyncMock()
    provider.get_default_model.return_value = "test-model"
    loop = ClientAwareAgentLoop(
        MessageBus(), provider, tmp_path, repos=repos,
    )

    inbound = InboundMessage(
        channel=CHANNEL, sender_id="ext-1", chat_id="chat-1",
        content="oi", user_id="u1",
    )
    with patch.object(AgentLoop, "_process_message", new=AsyncMock()) as base:
        outbound = await loop._process_message(inbound)
        base.assert_not_awaited()
    assert outbound is not None
    assert "Com qual agente" in outbound.content
    assert outbound.metadata["_owner_id"] == "u1"

    sessions = await repos.sessions.list_sessions("u1")
    picker_sessions = [
        s for s in sessions
        if "client:" in s["session_key"] and not s["session_key"].startswith("agent:")
    ]
    assert len(picker_sessions) == 1
    saved = await repos.messages.get_messages(picker_sessions[0]["id"])
    assert [m["role"] for m in saved] == ["user", "assistant"]
    assert saved[0]["content"] == "oi"
    assert "Com qual agente" in saved[1]["content"]


async def test_loop_bypasses_picker_when_agent_already_set(repos, tmp_path):
    from nanobot.agent.loop import AgentLoop
    from nanobot.bus.queue import MessageBus
    from nanobot.client.loop import ClientAwareAgentLoop

    await _setup(repos, [_agent_spec("a1", "PDI"), _agent_spec("a2", "Paulo")])

    provider = AsyncMock()
    provider.get_default_model.return_value = "test-model"
    loop = ClientAwareAgentLoop(
        MessageBus(), provider, tmp_path, repos=repos,
    )

    inbound = InboundMessage(
        channel=CHANNEL, sender_id="ext-1", chat_id="chat-1",
        content="oi", user_id="u1", agent_id="a1",
    )
    with patch.object(
        ClientAwareAgentLoop, "_resolve_selection", new=AsyncMock(),
    ) as selection:
        with patch.object(AgentLoop, "_process_message", new=AsyncMock()), \
             patch.object(
                 ClientAwareAgentLoop, "_get_user_context",
                 new=AsyncMock(return_value=MagicMock()),
             ):
            await loop._process_message(inbound)
        selection.assert_not_awaited()
