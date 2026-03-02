"""Client-aware agent loop — extends AgentLoop with per-client isolation.

This subclass overrides ``_process_message`` to:
1. Resolve the client from the inbound message (channel + sender_id).
2. Scope the session key so each client gets isolated conversation history.
3. Temporarily swap the memory stores so the core loop reads/writes
   client-specific memory without any changes to the parent class.

A per-user ``asyncio.Lock`` serialises all client-scoped processing for
the same owner, so the swap/restore cycle is safe even when
``process_direct`` is called concurrently from multiple WebSocket
connections.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Awaitable, Callable

from nanobot.agent.loop import AgentLoop

if TYPE_CHECKING:
    from nanobot.agent.memory import MemoryStore
    from nanobot.bus.events import InboundMessage, OutboundMessage
    from nanobot.client.memory import ClientScopedMemory


class ClientAwareAgentLoop(AgentLoop):
    """AgentLoop that adds per-client identity, session, and memory isolation."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]
        self._client_swap_locks: dict[str, asyncio.Lock] = {}

    def _get_swap_lock(self, user_id: str) -> asyncio.Lock:
        """Return (or create) the per-user lock that guards memory swaps."""
        lock = self._client_swap_locks.get(user_id)
        if lock is None:
            lock = asyncio.Lock()
            self._client_swap_locks[user_id] = lock
        return lock

    async def _process_message(
        self,
        msg: InboundMessage,
        session_key: str | None = None,
        on_progress: Callable[[str], Awaitable[None]] | None = None,
    ) -> OutboundMessage | None:
        if not self._repos:
            return await super()._process_message(msg, session_key, on_progress)

        user_id = await self._resolve_user_id(msg)
        if not user_id:
            return await super()._process_message(msg, session_key, on_progress)

        client_id = await self._resolve_client(msg, user_id)
        if not client_id:
            return await super()._process_message(msg, session_key, on_progress)

        base_key = session_key or msg.session_key
        msg.session_key_override = f"client:{client_id}:{base_key}"

        lock = self._get_swap_lock(user_id)
        async with lock:
            uctx = await self._get_user_context(user_id)
            client_memory = self._build_client_memory(uctx.memory, client_id, user_id)

            originals = self._swap_memory(uctx, client_memory)
            try:
                return await super()._process_message(msg, session_key, on_progress)
            finally:
                self._restore_memory(uctx, originals)

    async def _resolve_client(self, msg: InboundMessage, owner_id: str) -> str | None:
        from nanobot.client.resolver import resolve_client

        return await resolve_client(
            msg,
            owner_id,
            clients=self._repos.clients,
            identities=self._repos.client_identities,
            client_memories=self._repos.client_memories,
        )

    def _build_client_memory(
        self, base_memory: MemoryStore, client_id: str, owner_id: str,
    ) -> ClientScopedMemory:
        from nanobot.client.memory import ClientScopedMemory

        return ClientScopedMemory(
            base_memory=base_memory,
            client_memory_repo=self._repos.client_memories,
            client_id=client_id,
            owner_id=owner_id,
        )

    @staticmethod
    def _swap_memory(
        uctx: "UserContext",
        client_memory: ClientScopedMemory,
    ) -> dict:
        """Swap memory references on the UserContext and its tools.

        Returns the original references for later restoration.
        """
        from nanobot.agent.tools.memory import SaveMemoryTool, SearchMemoryTool

        originals: dict = {
            "uctx_memory": uctx.memory,
            "context_memory": uctx.context.memory,
        }

        uctx.memory = client_memory  # type: ignore[assignment]
        uctx.context.memory = client_memory  # type: ignore[assignment]

        save_tool = uctx.tools.get("save_memory")
        if isinstance(save_tool, SaveMemoryTool):
            originals["save_memory"] = save_tool._memory
            save_tool._memory = client_memory  # type: ignore[assignment]

        search_tool = uctx.tools.get("search_memory")
        if isinstance(search_tool, SearchMemoryTool):
            originals["search_memory"] = search_tool._memory
            search_tool._memory = client_memory  # type: ignore[assignment]

        return originals

    @staticmethod
    def _restore_memory(uctx: "UserContext", originals: dict) -> None:
        """Restore original memory references after processing."""
        from nanobot.agent.tools.memory import SaveMemoryTool, SearchMemoryTool

        uctx.memory = originals["uctx_memory"]
        uctx.context.memory = originals["context_memory"]

        if "save_memory" in originals:
            save_tool = uctx.tools.get("save_memory")
            if isinstance(save_tool, SaveMemoryTool):
                save_tool._memory = originals["save_memory"]

        if "search_memory" in originals:
            search_tool = uctx.tools.get("search_memory")
            if isinstance(search_tool, SearchMemoryTool):
                search_tool._memory = originals["search_memory"]


if TYPE_CHECKING:
    from nanobot.agent.user_context import UserContext
