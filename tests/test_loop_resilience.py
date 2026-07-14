"""Testes de resiliência do loop: retry de LLM, timeouts, tools paralelas e tokens."""

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import litellm
import pytest

from nanobot.agent.loop import _PROVIDER_ERROR_MESSAGE, AgentLoop
from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry
from nanobot.bus.queue import MessageBus
from nanobot.providers.base import LLMResponse, ProviderError, ToolCallRequest
from nanobot.providers.litellm_provider import LiteLLMProvider
from nanobot.session.manager import Session


class SleepTool(Tool):
    def __init__(self, name="sleepy", delay=0.2, parallel_safe=True):
        self._name = name
        self._delay = delay
        self.parallel_safe = parallel_safe

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return "Sleep then echo."

    @property
    def parameters(self) -> dict:
        return {"type": "object", "properties": {"text": {"type": "string"}}}

    async def execute(self, **kwargs) -> str:
        await asyncio.sleep(self._delay)
        return kwargs.get("text", "")


def _call(name, text):
    return ToolCallRequest(id=f"tc-{name}-{text}", name=name, arguments={"text": text})


def _completion_response(content="ok"):
    message = SimpleNamespace(content=content, tool_calls=None, reasoning_content=None)
    usage = SimpleNamespace(prompt_tokens=10, completion_tokens=5, total_tokens=15)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="stop")], usage=usage)


async def test_transient_error_retries_then_succeeds():
    provider = LiteLLMProvider(api_key="sk-test", default_model="openai/gpt-test")
    rate_limit = litellm.exceptions.RateLimitError(
        message="rate limited", model="gpt-test", llm_provider="openai",
    )
    mock = AsyncMock(side_effect=[rate_limit, _completion_response("depois do retry")])
    with patch("nanobot.providers.litellm_provider.acompletion", mock), \
         patch("nanobot.providers.litellm_provider.asyncio.sleep", new=AsyncMock()):
        response = await provider.chat(messages=[{"role": "user", "content": "oi"}])
    assert response.content == "depois do retry"
    assert mock.call_count == 2


async def test_transient_error_exhausts_retries_and_raises():
    provider = LiteLLMProvider(api_key="sk-test", default_model="openai/gpt-test")
    rate_limit = litellm.exceptions.RateLimitError(
        message="rate limited", model="gpt-test", llm_provider="openai",
    )
    mock = AsyncMock(side_effect=rate_limit)
    with patch("nanobot.providers.litellm_provider.acompletion", mock), \
         patch("nanobot.providers.litellm_provider.asyncio.sleep", new=AsyncMock()):
        with pytest.raises(ProviderError) as exc:
            await provider.chat(messages=[{"role": "user", "content": "oi"}])
    assert exc.value.retryable is True
    assert mock.call_count == 3


async def test_permanent_error_raises_immediately():
    provider = LiteLLMProvider(api_key="sk-test", default_model="openai/gpt-test")
    auth_error = litellm.exceptions.AuthenticationError(
        message="bad key", model="gpt-test", llm_provider="openai",
    )
    mock = AsyncMock(side_effect=auth_error)
    with patch("nanobot.providers.litellm_provider.acompletion", mock):
        with pytest.raises(ProviderError) as exc:
            await provider.chat(messages=[{"role": "user", "content": "oi"}])
    assert exc.value.retryable is False
    assert mock.call_count == 1


async def test_loop_returns_friendly_message_on_provider_error(tmp_path):
    provider = AsyncMock()
    provider.get_default_model.return_value = "test-model"
    provider.chat = AsyncMock(side_effect=ProviderError("boom", code="Timeout", retryable=True))
    loop = AgentLoop(bus=MessageBus(), provider=provider, workspace=tmp_path)

    final, _, _ = await loop._run_agent_loop(
        [{"role": "user", "content": "oi"}], tools=ToolRegistry(),
    )
    assert final == _PROVIDER_ERROR_MESSAGE


async def test_tool_call_timeout_becomes_error_result():
    registry = ToolRegistry()
    registry.register(SleepTool(delay=0.5))
    results = await registry.execute_calls([_call("sleepy", "a")], timeout=0.05)
    assert "timed out" in results[0]


async def test_parallel_tools_run_concurrently_and_keep_order():
    registry = ToolRegistry()
    registry.register(SleepTool(delay=0.2))
    started = time.monotonic()
    results = await registry.execute_calls(
        [_call("sleepy", "um"), _call("sleepy", "dois"), _call("sleepy", "tres")],
    )
    elapsed = time.monotonic() - started
    assert results == ["um", "dois", "tres"]
    assert elapsed < 0.45


async def test_parallel_unsafe_tool_forces_sequential():
    registry = ToolRegistry()
    registry.register(SleepTool(name="serial", delay=0.1, parallel_safe=False))
    started = time.monotonic()
    results = await registry.execute_calls(
        [_call("serial", "um"), _call("serial", "dois")],
    )
    elapsed = time.monotonic() - started
    assert results == ["um", "dois"]
    assert elapsed >= 0.2


async def test_usage_totals_accumulate_across_iterations(tmp_path):
    provider = AsyncMock()
    provider.get_default_model.return_value = "test-model"
    provider.chat = AsyncMock(side_effect=[
        LLMResponse(
            content="",
            tool_calls=[ToolCallRequest(id="t1", name="sleepy", arguments={"text": "x"})],
            usage={"prompt_tokens": 100, "completion_tokens": 20},
        ),
        LLMResponse(content="Pronto.", usage={"prompt_tokens": 150, "completion_tokens": 30}),
        LLMResponse(content="COMPLETO", usage={"prompt_tokens": 10, "completion_tokens": 2}),
    ])
    loop = AgentLoop(bus=MessageBus(), provider=provider, workspace=tmp_path)
    registry = ToolRegistry()
    registry.register(SleepTool(delay=0))

    usage: dict[str, int] = {}
    final, _, _ = await loop._run_agent_loop(
        [{"role": "user", "content": "faça"}], tools=registry, usage_totals=usage,
    )
    assert final == "Pronto."
    assert usage == {"prompt_tokens": 260, "completion_tokens": 52, "llm_calls": 3}


def test_record_turn_usage_updates_session_metadata():
    session = Session(key="s1")
    AgentLoop._record_turn_usage(
        session, {"prompt_tokens": 100, "completion_tokens": 40, "llm_calls": 2},
        duration_s=3.21, user_id="u1", agent_id="a1",
    )
    AgentLoop._record_turn_usage(
        session, {"prompt_tokens": 50, "completion_tokens": 10, "llm_calls": 1},
        duration_s=1.0, user_id="u1", agent_id="a1",
    )
    assert session.metadata["token_usage"] == {
        "prompt_tokens": 150, "completion_tokens": 50, "turns": 2,
    }
    assert session.metadata["last_turn"]["prompt_tokens"] == 50
    assert session.metadata["last_turn"]["duration_s"] == 1.0
