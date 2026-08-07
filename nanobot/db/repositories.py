"""Repository interfaces (Protocols) for pluggable storage backends.

These Protocols define the contract between the application layer and the
persistence layer.  The application only imports these interfaces; the actual
implementation (SQLite today, MongoDB tomorrow) is injected at startup.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class AgentRepository(Protocol):
    """Agents owned by a user."""

    async def list_agents(self, user_id: str, status: str | None = None) -> list[dict[str, Any]]: ...

    async def get_agent(self, user_id: str, agent_id: str) -> dict[str, Any] | None: ...

    async def get_default_agent(self, user_id: str) -> dict[str, Any] | None: ...

    async def create_agent(self, user_id: str, agent: dict[str, Any]) -> str: ...

    async def update_agent(self, user_id: str, agent_id: str, fields: dict[str, Any]) -> bool: ...

    async def delete_agent(self, user_id: str, agent_id: str) -> bool: ...

    async def duplicate_agent(self, user_id: str, agent_id: str) -> str | None: ...

    async def find_by_embed_token(self, token: str) -> dict[str, Any] | None: ...

    async def get_agent_metrics(self, user_id: str, agent_id: str) -> dict[str, Any]: ...


@runtime_checkable
class UserRepository(Protocol):
    """CRUD + usage tracking for user accounts."""

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None: ...

    async def get_by_api_key_hash(self, key_hash: str) -> dict[str, Any] | None: ...

    async def get_by_email(self, email: str) -> dict[str, Any] | None: ...

    async def create(self, user: dict[str, Any]) -> str:
        """Create a user and return the user_id."""
        ...

    async def update(self, user_id: str, fields: dict[str, Any]) -> bool: ...

    async def list_all(self, status: str | None = None) -> list[dict[str, Any]]: ...

    async def increment_usage(self, user_id: str, tokens: int, requests: int = 1) -> None: ...

    async def reset_daily_usage(self) -> int:
        """Reset daily counters for all users. Returns number of rows affected."""
        ...



@runtime_checkable
class SessionRepository(Protocol):
    """Session metadata CRUD (messages stored separately)."""

    async def get(self, user_id: str, session_key: str, agent_id: str | None = None) -> dict[str, Any] | None: ...

    async def save(self, session: dict[str, Any]) -> int:
        """Upsert session. Returns the session row id."""
        ...

    async def list_sessions(
        self, user_id: str, status: str = "active", agent_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    async def delete(self, user_id: str, session_key: str, agent_id: str | None = None) -> bool: ...

    async def update_status(self, user_id: str, session_key: str, status: str) -> bool: ...



@runtime_checkable
class MessageRepository(Protocol):
    """Per-session message storage."""

    async def get_messages(
        self, session_id: int, *, offset: int = 0, limit: int = 5000,
    ) -> list[dict[str, Any]]: ...

    async def append(self, session_id: int, user_id: str, message: dict[str, Any]) -> int:
        """Append a message and return its id."""
        ...

    async def append_many(self, session_id: int, user_id: str, messages: list[dict[str, Any]]) -> None: ...

    async def count(self, session_id: int) -> int: ...

    async def delete_all(self, session_id: int) -> int:
        """Delete all messages for a session. Returns count deleted."""
        ...



@runtime_checkable
class MemoryRepository(Protocol):
    """Two-layer memory: long_term (1 per user) + history (N per user)."""

    async def get_long_term(self, user_id: str, agent_id: str | None = None) -> str: ...

    async def save_long_term(self, user_id: str, content: str, agent_id: str | None = None) -> None: ...

    async def append_history(self, user_id: str, entry: str, agent_id: str | None = None) -> None: ...

    async def get_history(self, user_id: str, limit: int = 100, agent_id: str | None = None) -> list[dict[str, Any]]: ...

    async def search_history(
        self, user_id: str, query: str, limit: int = 50, agent_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    async def delete_history(self, user_id: str, entry_id: int, agent_id: str | None = None) -> bool: ...

    async def clear_history(self, user_id: str, agent_id: str | None = None) -> int: ...



@runtime_checkable
class SkillRepository(Protocol):
    """Per-user skill storage (builtins stay on filesystem)."""

    async def list_skills(
        self, user_id: str, enabled_only: bool = True,
    ) -> list[dict[str, Any]]: ...

    async def get_skill(self, user_id: str, name: str) -> dict[str, Any] | None: ...

    async def save_skill(self, user_id: str, skill: dict[str, Any]) -> None: ...

    async def delete_skill(self, user_id: str, name: str) -> bool: ...

    async def count_skills(self, user_id: str) -> int: ...



@runtime_checkable
class CronRepository(Protocol):
    """Per-user cron job storage."""

    async def list_jobs(
        self, user_id: str, include_disabled: bool = False, agent_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    async def get_job(
        self, user_id: str, job_id: str, agent_id: str | None = None,
    ) -> dict[str, Any] | None: ...

    async def get_due_jobs(self, now_ms: int) -> list[dict[str, Any]]:
        """Cross-user: all enabled jobs whose next_run_at_ms <= now_ms."""
        ...

    async def save_job(self, job: dict[str, Any]) -> None: ...

    async def delete_job(self, user_id: str, job_id: str, agent_id: str | None = None) -> bool: ...

    async def update_job_state(self, job_id: str, state: dict[str, Any], *, user_id: str | None = None) -> None: ...

    async def count_jobs(self, user_id: str) -> int: ...



@runtime_checkable
class ChannelBindingRepository(Protocol):
    """Maps external sender_id (per channel) to internal user_id."""

    async def resolve_user(self, channel: str, sender_id: str) -> str | None: ...

    async def resolve_agent(self, channel: str, sender_id: str) -> dict[str, str] | None: ...

    async def bind(self, user_id: str, channel: str, sender_id: str, agent_id: str | None = None) -> None: ...

    async def unbind(
        self, user_id: str, channel: str, sender_id: str, agent_id: str | None = None,
    ) -> bool: ...

    async def list_bindings(self, user_id: str, agent_id: str | None = None) -> list[dict[str, Any]]: ...



@runtime_checkable
class RetrieverRepository(Protocol):
    """RAG chunk storage with full-text search."""

    async def ingest(
        self, user_id: str, content: str, metadata: dict[str, Any] | None = None,
    ) -> str: ...

    async def search(
        self, user_id: str, query: str, *, top_k: int = 5,
    ) -> list[dict[str, Any]]: ...

    async def delete(self, user_id: str, chunk_id: str) -> bool: ...

    async def list_sources(self, user_id: str) -> list[dict[str, Any]]: ...



@runtime_checkable
class CredentialRepository(Protocol):
    """Encrypted per-user credential storage."""

    async def list_credentials(self, user_id: str) -> list[dict[str, Any]]: ...

    async def get_credential(self, user_id: str, credential_id: int) -> dict[str, Any] | None: ...

    async def get_by_name(self, user_id: str, name: str) -> dict[str, Any] | None: ...

    async def create(self, credential: dict[str, Any]) -> int: ...

    async def update(self, user_id: str, credential_id: int, fields: dict[str, Any]) -> bool: ...

    async def delete(self, user_id: str, credential_id: int) -> bool: ...


@runtime_checkable
class IntegrationRepository(Protocol):
    """Per-user activated integrations (MCP servers or REST APIs)."""

    async def list_integrations(
        self, user_id: str, kind: str | None = None, enabled_only: bool = False,
    ) -> list[dict[str, Any]]: ...

    async def get_integration(self, user_id: str, slug: str) -> dict[str, Any] | None: ...

    async def get_by_id(self, user_id: str, integration_id: int) -> dict[str, Any] | None: ...

    async def upsert(self, integration: dict[str, Any]) -> int: ...

    async def delete(self, user_id: str, slug: str) -> bool: ...


@runtime_checkable
class AgentTemplateRepository(Protocol):
    """Read-only catalog of agent templates seeded at first migration."""

    async def list_templates(self) -> list[dict[str, Any]]: ...

    async def get_template(self, template_id: str) -> dict[str, Any] | None: ...

    async def list_skills(self, template_id: str) -> list[dict[str, Any]]: ...

    async def list_knowledge(self, template_id: str) -> list[dict[str, Any]]: ...


@runtime_checkable
class AuditRepository(Protocol):
    """Append-only audit trail with TTL cleanup."""

    async def log(self, user_id: str, event: str, detail: dict[str, Any] | None = None,
                  ip_address: str | None = None, user_agent: str | None = None) -> None: ...

    async def query(
        self, *, user_id: str | None = None, event: str | None = None,
        limit: int = 100, offset: int = 0,
    ) -> list[dict[str, Any]]: ...

    async def cleanup(self, days: int = 90) -> int:
        """Delete entries older than *days*. Returns count deleted."""
        ...


@runtime_checkable
class WorkItemRepository(Protocol):
    """Which demands an autonomous routine already worked, and what came out.

    The record a sweeping routine needs to not re-open a pull request for the
    same demand tomorrow, and the only durable answer to "what did the agent do
    this week" — the conversation session is shared, windowed and lost on timeout.
    """

    async def claim(
        self, user_id: str, *, source: str, external_id: str, agent_id: str = "",
        title: str = "", stale_after_s: int = 3600,
    ) -> dict[str, Any]:
        """Try to take ownership of one demand.

        Returns the row plus a ``claimed`` flag: False means someone already has
        it or already finished it. A claim older than *stale_after_s* that never
        completed is taken over — that is how a run killed by its timeout frees
        its work.
        """
        ...

    async def complete(
        self, user_id: str, *, source: str, external_id: str, pr_url: str,
        branch: str = "", note: str = "",
    ) -> bool:
        """Mark the demand done. ``pr_url`` is required: no PR, not done."""
        ...

    async def fail(
        self, user_id: str, *, source: str, external_id: str, note: str,
    ) -> bool: ...

    async def get(
        self, user_id: str, *, source: str, external_id: str,
    ) -> dict[str, Any] | None: ...

    async def list_items(
        self, user_id: str, *, state: str | None = None, limit: int = 50,
    ) -> list[dict[str, Any]]: ...
