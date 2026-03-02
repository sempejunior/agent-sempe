"""Repository factory — single point to swap storage backends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nanobot.db.client_repositories import (
        ClientIdentityRepository,
        ClientMemoryRepository,
        ClientRepository,
    )
    from nanobot.db.repositories import (
        AuditRepository,
        ChannelBindingRepository,
        CronRepository,
        MemoryRepository,
        MessageRepository,
        RetrieverRepository,
        SessionRepository,
        SkillRepository,
        UserRepository,
    )


@dataclass
class RepositoryFactory:
    """Holds all repository instances for a given backend.

    To switch from SQLite to MongoDB, create a ``MongoRepositoryFactory``
    that builds Mongo-backed repos and plug it in at startup.
    """

    users: UserRepository
    sessions: SessionRepository
    messages: MessageRepository
    memories: MemoryRepository
    skills: SkillRepository
    cron: CronRepository
    channel_bindings: ChannelBindingRepository
    audit: AuditRepository
    retriever: RetrieverRepository
    clients: ClientRepository
    client_identities: ClientIdentityRepository
    client_memories: ClientMemoryRepository


def create_sqlite_factory(db) -> RepositoryFactory:
    """Build a RepositoryFactory backed by SQLite.

    Args:
        db: An open ``aiosqlite.Connection``.
    """
    from nanobot.db.sqlite.audit_repo import SQLiteAuditRepository
    from nanobot.db.sqlite.channel_binding_repo import SQLiteChannelBindingRepository
    from nanobot.db.sqlite.client_identity_repo import SQLiteClientIdentityRepository
    from nanobot.db.sqlite.client_memory_repo import SQLiteClientMemoryRepository
    from nanobot.db.sqlite.client_repo import SQLiteClientRepository
    from nanobot.db.sqlite.cron_repo import SQLiteCronRepository
    from nanobot.db.sqlite.memory_repo import SQLiteMemoryRepository
    from nanobot.db.sqlite.rag_repo import SQLiteRetrieverRepository
    from nanobot.db.sqlite.session_repo import SQLiteMessageRepository, SQLiteSessionRepository
    from nanobot.db.sqlite.skill_repo import SQLiteSkillRepository
    from nanobot.db.sqlite.user_repo import SQLiteUserRepository

    return RepositoryFactory(
        users=SQLiteUserRepository(db),
        sessions=SQLiteSessionRepository(db),
        messages=SQLiteMessageRepository(db),
        memories=SQLiteMemoryRepository(db),
        skills=SQLiteSkillRepository(db),
        cron=SQLiteCronRepository(db),
        channel_bindings=SQLiteChannelBindingRepository(db),
        audit=SQLiteAuditRepository(db),
        retriever=SQLiteRetrieverRepository(db),
        clients=SQLiteClientRepository(db),
        client_identities=SQLiteClientIdentityRepository(db),
        client_memories=SQLiteClientMemoryRepository(db),
    )
