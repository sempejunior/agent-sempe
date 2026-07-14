"""Tests for the completion nudge in AgentLoop._run_agent_loop."""

from unittest.mock import AsyncMock

from nanobot.agent.loop import _COMPLETION_NUDGE, _FINAL_ANSWER_PROMPT, AgentLoop
from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry
from nanobot.bus.queue import MessageBus
from nanobot.providers.base import LLMResponse, ToolCallRequest
from nanobot.session.manager import Session


class EchoTool(Tool):
    @property
    def name(self) -> str:
        return "echo"

    @property
    def description(self) -> str:
        return "Echo the input."

    @property
    def parameters(self) -> dict:
        return {"type": "object", "properties": {"text": {"type": "string"}}}

    async def execute(self, **kwargs) -> str:
        return kwargs.get("text", "")


def make_loop(tmp_path, responses):
    provider = AsyncMock()
    provider.chat = AsyncMock(side_effect=responses)
    provider.get_default_model.return_value = "test-model"
    loop = AgentLoop(bus=MessageBus(), provider=provider, workspace=tmp_path)
    registry = ToolRegistry()
    registry.register(EchoTool())
    return loop, provider, registry


def tool_call_response(text="calling"):
    return LLMResponse(
        content=text,
        tool_calls=[ToolCallRequest(id="tc1", name="echo", arguments={"text": "hi"})],
    )


async def test_nudge_completo_keeps_original_answer(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content="Resposta final completa."),
        LLMResponse(content="COMPLETO"),
    ])
    final, tools_used, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X e Y"}], tools=registry,
    )
    assert final == "Resposta final completa."
    assert tools_used == ["echo"]
    assert provider.chat.call_count == 3
    assert all(m.get("content") != _COMPLETION_NUDGE for m in messages)


async def test_nudge_lets_model_continue_working(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content="Fiz só a parte 1."),
        tool_call_response(),
        LLMResponse(content="Agora fiz tudo."),
    ])
    final, tools_used, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X e Y"}], tools=registry,
    )
    assert final == "Agora fiz tudo."
    assert tools_used == ["echo", "echo"]
    assert provider.chat.call_count == 4
    assert any(m.get("content") == _COMPLETION_NUDGE for m in messages)


async def test_text_only_reply_is_nudged_once(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        LLMResponse(content="Oi!"),
        LLMResponse(content="COMPLETO"),
    ])
    final, _, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "oi"}], tools=registry,
    )
    assert final == "Oi!"
    assert provider.chat.call_count == 2
    assert all(m.get("content") != _COMPLETION_NUDGE for m in messages)


async def test_announcement_only_reply_is_pushed_to_work(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        LLMResponse(content="Vou levantar os projetos e montar o relatório."),
        tool_call_response(),
        LLMResponse(content="Relatório pronto: tudo analisado."),
    ])
    final, tools_used, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "quero um relatório da equipe"}], tools=registry,
    )
    assert final == "Relatório pronto: tudo analisado."
    assert tools_used == ["echo"]


async def test_empty_reply_is_not_nudged(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        LLMResponse(content=None),
    ])
    final, _, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "oi"}], tools=registry,
    )
    assert provider.chat.call_count == 1
    assert all(m.get("content") != _COMPLETION_NUDGE for m in messages)


async def test_nudge_meta_reply_never_leaks(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content="Resposta real com [link](/r/abc)."),
        LLMResponse(content="Ainda falta uma parte, não posso responder COMPLETO..."),
    ])
    final, _, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X e Y"}], tools=registry,
    )
    assert final == "Resposta real com [link](/r/abc)."
    assert provider.chat.call_count == 3
    assert all(m.get("content") != _COMPLETION_NUDGE for m in messages)


async def test_sentinel_after_post_nudge_work_never_leaks(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content="Entreguei a parte 1: [análise](/r/aaa)."),
        tool_call_response(),
        LLMResponse(content="COMPLETO"),
        LLMResponse(content="Entreguei tudo: [análise](/r/aaa) e [PDI](/r/bbb)."),
    ])
    final, _, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X e Y"}], tools=registry,
    )
    assert final == "Entreguei tudo: [análise](/r/aaa) e [PDI](/r/bbb)."
    assert provider.chat.call_count == 5
    session = Session(key="test:2")
    loop._save_turn(session, messages, 0)
    for m in session.messages:
        assert m.get("content") not in (_COMPLETION_NUDGE, _FINAL_ANSWER_PROMPT)
        if m.get("role") == "assistant" and isinstance(m.get("content"), str):
            assert m["content"].strip().upper() != "COMPLETO"


async def test_sentinel_twice_falls_back_to_pending(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content="Parte 1 entregue: [link](/r/aaa)."),
        tool_call_response(),
        LLMResponse(content="COMPLETO"),
        LLMResponse(content="COMPLETO"),
    ])
    final, _, _ = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X e Y"}], tools=registry,
    )
    assert final == "Parte 1 entregue: [link](/r/aaa)."
    assert provider.chat.call_count == 5


async def test_none_content_after_tools_does_not_crash(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content=None),
        LLMResponse(content="Resposta final."),
    ])
    final, _, _ = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X"}], tools=registry,
    )
    assert final == "Resposta final."


async def test_none_content_final_falls_back_to_canned(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        LLMResponse(content=None),
    ])
    final, _, _ = await loop._run_agent_loop(
        [{"role": "user", "content": "oi"}], tools=registry,
    )
    assert final is None


async def test_no_interim_text_progress_only_tool_hints(tmp_path):
    loop, provider, registry = make_loop(tmp_path, [
        tool_call_response("vou fazer X primeiro"),
        LLMResponse(content="Parcial com texto."),
        LLMResponse(content="COMPLETO"),
    ])
    events = []

    async def on_progress(text, *, tool_hint=False):
        events.append((tool_hint, text))

    final, _, _ = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X"}], tools=registry,
        on_progress=on_progress,
    )
    assert final == "Parcial com texto."
    assert events and all(hint for hint, _ in events)


async def test_save_turn_skips_nudge_message(tmp_path):
    loop, _, registry = make_loop(tmp_path, [
        tool_call_response(),
        LLMResponse(content="Fiz só a parte 1."),
        tool_call_response(),
        LLMResponse(content="Agora fiz tudo."),
    ])
    _, _, messages = await loop._run_agent_loop(
        [{"role": "user", "content": "faça X e Y"}], tools=registry,
    )
    session = Session(key="test:1")
    loop._save_turn(session, messages, 0)
    assert all(m.get("content") != _COMPLETION_NUDGE for m in session.messages)
    assert any(m.get("role") == "tool" for m in session.messages)
