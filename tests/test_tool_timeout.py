"""O teto de uma tool longa é dela; o do registry é só o default de quem não declara."""

import asyncio
from typing import Any

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry
from nanobot.providers.base import ToolCallRequest


class _SleepTool(Tool):
    """Dorme o que mandarem, e registra quando entrou e quando saiu."""

    def __init__(self, name: str, seconds: float, *, timeout_s: float | None = None,
                 parallel_safe: bool = True, marks: list[str] | None = None):
        self._name = name
        self._seconds = seconds
        self.timeout_s = timeout_s
        self.parallel_safe = parallel_safe
        self.marks = marks if marks is not None else []

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return "dorme"

    @property
    def parameters(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}}

    async def execute(self, **_: Any) -> str:
        self.marks.append(f"{self._name}:entrou")
        await asyncio.sleep(self._seconds)
        self.marks.append(f"{self._name}:saiu")
        return f"{self._name} terminou"


def _call(name: str) -> ToolCallRequest:
    return ToolCallRequest(id=f"call_{name}", name=name, arguments={})


async def test_a_tool_that_declares_its_ceiling_is_not_cut_by_the_default():
    """O teto interno do code_agent era inalcançável: o registry cortava antes."""
    registry = ToolRegistry()
    registry.register(_SleepTool("demorada", 0.3, timeout_s=30))

    results = await registry.execute_calls([_call("demorada")], timeout=0.05)

    assert results == ["demorada terminou"]


async def test_a_tool_without_a_ceiling_keeps_the_registry_default():
    registry = ToolRegistry()
    registry.register(_SleepTool("comum", 5))

    results = await registry.execute_calls([_call("comum")], timeout=0.05)

    assert "timed out" in results[0]


async def test_a_tool_that_is_not_parallel_safe_serializes_the_batch():
    """repo, exec e code_agent dividem uma árvore de trabalho — lote concorrente é corrida."""
    marks: list[str] = []
    registry = ToolRegistry()
    registry.register(_SleepTool("exclusiva", 0.1, parallel_safe=False, marks=marks))
    registry.register(_SleepTool("outra", 0.1, marks=marks))

    await registry.execute_calls([_call("exclusiva"), _call("outra")])

    assert marks == ["exclusiva:entrou", "exclusiva:saiu", "outra:entrou", "outra:saiu"]


async def test_a_batch_of_safe_tools_still_runs_concurrently():
    marks: list[str] = []
    registry = ToolRegistry()
    registry.register(_SleepTool("uma", 0.1, marks=marks))
    registry.register(_SleepTool("duas", 0.1, marks=marks))

    await registry.execute_calls([_call("uma"), _call("duas")])

    assert marks[:2] == ["uma:entrou", "duas:entrou"]
