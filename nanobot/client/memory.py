"""Client-scoped memory that routes reads/writes to per-client storage.

The core MemoryStore is never modified.  This class implements the same
interface so it can be swapped in transparently during message processing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nanobot.agent.memory import MemoryStore
    from nanobot.db.client_repositories import ClientMemoryRepository
    from nanobot.providers.base import LLMProvider
    from nanobot.session.manager import Session


class ClientScopedMemory:
    """MemoryStore-compatible wrapper that routes to per-client storage.

    - ``get_memory_context()`` returns BOTH creator memory + client memory
      so the system prompt contains full context.
    - ``read_long_term`` / ``write_long_term`` operate on the **client's**
      memory, so ``save_memory`` tool writes to the right place.
    - ``consolidate`` reuses ``MemoryStore.consolidate`` via duck-typing
      (unbound method call) — zero code duplication.
    """

    def __init__(
        self,
        base_memory: MemoryStore,
        client_memory_repo: ClientMemoryRepository,
        client_id: str,
        owner_id: str,
    ):
        self._base = base_memory
        self._repo = client_memory_repo
        self._client_id = client_id
        self._owner_id = owner_id

    async def read_long_term(self) -> str:
        return await self._repo.get_long_term(self._client_id)

    async def write_long_term(self, content: str) -> None:
        await self._repo.save_long_term(self._client_id, self._owner_id, content)

    async def append_history(self, entry: str) -> None:
        await self._repo.append_history(self._client_id, self._owner_id, entry)

    async def search_history(self, query: str, limit: int = 20) -> list[str]:
        results = await self._repo.search_history(self._client_id, query, limit)
        return [r["content"] if isinstance(r, dict) else r for r in results]

    async def get_memory_context(self) -> str:
        creator_ctx = await self._base.get_memory_context()
        client_long_term = await self.read_long_term()

        parts: list[str] = []
        if creator_ctx:
            parts.append(creator_ctx)
        if client_long_term:
            parts.append(f"## Client Memory\n{client_long_term}")
        return "\n\n".join(parts)

    async def consolidate(
        self,
        session: Session,
        provider: LLMProvider,
        model: str,
        *,
        archive_all: bool = False,
        memory_window: int = 50,
    ) -> bool:
        from nanobot.agent.memory import MemoryStore

        return await MemoryStore.consolidate(
            self,  # type: ignore[arg-type]
            session,
            provider,
            model,
            archive_all=archive_all,
            memory_window=memory_window,
        )

    def _get_search_results(self, results: list[dict[str, Any]]) -> list[str]:
        return [r["content"] if isinstance(r, dict) else r for r in results]
