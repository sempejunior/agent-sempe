"""Tool registry for dynamic tool management."""

import asyncio
from typing import TYPE_CHECKING, Any

from loguru import logger

from nanobot.agent.tools.base import Tool

if TYPE_CHECKING:
    from nanobot.providers.base import ToolCallRequest

DEFAULT_TOOL_TIMEOUT_S = 180


class ToolRegistry:
    """
    Registry for agent tools.

    Allows dynamic registration and execution of tools.
    """

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        """Unregister a tool by name."""
        self._tools.pop(name, None)

    def get(self, name: str) -> Tool | None:
        """Get a tool by name."""
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """Check if a tool is registered."""
        return name in self._tools

    def get_definitions(self) -> list[dict[str, Any]]:
        """Get all tool definitions in OpenAI format."""
        return [tool.to_schema() for tool in self._tools.values()]

    async def execute(self, name: str, params: dict[str, Any]) -> str | list[dict[str, Any]]:
        """Execute a tool by name with given parameters."""
        hint = "\n\n[Analyze the error above and try a different approach.]"

        tool = self._tools.get(name)
        if not tool:
            return f"Error: Tool '{name}' not found. Available: {', '.join(self.tool_names)}"

        try:
            errors = tool.validate_params(params)
            if errors:
                return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors) + hint
            result = await tool.execute(**params)
            if isinstance(result, str) and result.startswith("Error"):
                return result + hint
            return result
        except Exception as e:
            return f"Error executing {name}: {str(e)}" + hint

    async def execute_calls(
        self, calls: list["ToolCallRequest"], *, timeout: float = DEFAULT_TOOL_TIMEOUT_S,
    ) -> list[str | list[dict[str, Any]]]:
        """Execute a batch of tool calls, each bounded by ``timeout``.

        A tool that declares its own ``timeout_s`` is bounded by that instead —
        otherwise a tool driving a long external process would be cancelled here
        long before its own ceiling applied.

        Independent calls run concurrently; results keep the input order (the
        chat API requires one tool result per call, in order). A call whose
        tool declares ``parallel_safe = False`` forces the whole batch to run
        sequentially.
        """
        parallel = len(calls) > 1 and all(
            getattr(self._tools.get(call.name), "parallel_safe", True) for call in calls
        )
        if parallel:
            return list(await asyncio.gather(
                *(self._execute_bounded(call, timeout) for call in calls)
            ))
        return [await self._execute_bounded(call, timeout) for call in calls]

    async def _execute_bounded(
        self, call: "ToolCallRequest", timeout: float,
    ) -> str | list[dict[str, Any]]:
        limit = getattr(self._tools.get(call.name), "timeout_s", None) or timeout
        try:
            return await asyncio.wait_for(self.execute(call.name, call.arguments), limit)
        except asyncio.TimeoutError:
            logger.warning("Tool call {} timed out after {}s", call.name, limit)
            return (
                f"Error: tool '{call.name}' timed out after {int(limit)}s. "
                "Try a different approach or a smaller request."
            )

    @property
    def tool_names(self) -> list[str]:
        """Get list of registered tool names."""
        return list(self._tools.keys())

    @property
    def tools(self) -> list[Tool]:
        """Registered instances, for callers that configure tools per turn."""
        return list(self._tools.values())

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools
