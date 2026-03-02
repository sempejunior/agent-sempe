"""Repository protocols for the client layer.

Separate from the core repositories.py so the core module stays untouched.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ClientRepository(Protocol):
    """CRUD for end-user (client) profiles scoped to a creator."""

    async def get(self, client_id: str) -> dict[str, Any] | None: ...

    async def create(self, client: dict[str, Any]) -> str: ...

    async def update(self, client_id: str, fields: dict[str, Any]) -> bool: ...

    async def delete(self, client_id: str) -> bool: ...

    async def list_by_owner(
        self, owner_id: str, *, status: str | None = None,
        query: str | None = None, limit: int = 50, offset: int = 0,
        sort: str = "last_seen",
    ) -> list[dict[str, Any]]: ...

    async def count_by_owner(
        self, owner_id: str, *, status: str | None = None, query: str | None = None,
    ) -> int: ...

    async def touch(self, client_id: str) -> None: ...


@runtime_checkable
class ClientIdentityRepository(Protocol):
    """Maps channel + external_id to a client, scoped to a creator."""

    async def lookup(self, owner_id: str, channel: str, external_id: str) -> str | None: ...

    async def create(self, identity: dict[str, Any]) -> int: ...

    async def delete(self, identity_id: int, client_id: str) -> bool: ...

    async def list_by_client(self, client_id: str) -> list[dict[str, Any]]: ...

    async def reassign(self, from_client_id: str, to_client_id: str) -> int: ...


@runtime_checkable
class ClientMemoryRepository(Protocol):
    """Per-client two-layer memory: long_term + history with FTS."""

    async def get_long_term(self, client_id: str) -> str: ...

    async def save_long_term(self, client_id: str, owner_id: str, content: str) -> None: ...

    async def append_history(self, client_id: str, owner_id: str, entry: str) -> None: ...

    async def get_history(self, client_id: str, limit: int = 100) -> list[dict[str, Any]]: ...

    async def search_history(self, client_id: str, query: str, limit: int = 50) -> list[dict[str, Any]]: ...

    async def delete_entry(self, entry_id: int, client_id: str) -> bool: ...

    async def clear(self, client_id: str) -> int: ...

    async def reassign(self, from_client_id: str, to_client_id: str) -> int: ...
