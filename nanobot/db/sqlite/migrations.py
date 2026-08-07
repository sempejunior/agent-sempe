"""SQLite schema migrations.

Each migration is a (version, sql) tuple.  ``apply_migrations`` runs them
inside a transaction so the database is always in a consistent state.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import aiosqlite

_MIGRATIONS: list[tuple[int, str]] = [
    (1, """
-- ===================== v1: initial schema =====================

CREATE TABLE IF NOT EXISTS users (
    user_id        TEXT PRIMARY KEY,
    display_name   TEXT NOT NULL,
    email          TEXT UNIQUE,
    api_key_hash   TEXT UNIQUE,
    role           TEXT NOT NULL DEFAULT 'user',

    agent_config   TEXT NOT NULL DEFAULT '{}',
    bootstrap      TEXT NOT NULL DEFAULT '{}',
    limits         TEXT NOT NULL DEFAULT '{}',
    tools_enabled  TEXT NOT NULL DEFAULT '[]',

    tokens_today      INTEGER NOT NULL DEFAULT 0,
    tokens_total      INTEGER NOT NULL DEFAULT 0,
    requests_today    INTEGER NOT NULL DEFAULT 0,
    last_request_at   TEXT,
    usage_reset_date  TEXT,

    status     TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key_hash);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_key       TEXT NOT NULL,
    last_consolidated INTEGER NOT NULL DEFAULT 0,
    message_count     INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'active',
    metadata          TEXT NOT NULL DEFAULT '{}',
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(user_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    role         TEXT NOT NULL,
    content      TEXT,
    tool_calls   TEXT,
    tool_call_id TEXT,
    name         TEXT,
    timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
    seq          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, seq);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_user_type ON memories(user_id, type);
CREATE INDEX IF NOT EXISTS idx_memories_user_type_updated ON memories(user_id, type, updated_at DESC);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS skills (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    content       TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    always_active INTEGER NOT NULL DEFAULT 0,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_skills_user_enabled ON skills(user_id, enabled);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cron_jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    job_id           TEXT NOT NULL,
    name             TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    schedule         TEXT NOT NULL,
    payload          TEXT NOT NULL,
    next_run_at_ms   INTEGER,
    last_run_at_ms   INTEGER,
    last_status      TEXT,
    last_error       TEXT,
    delete_after_run INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_enabled_next ON cron_jobs(enabled, next_run_at_ms);
CREATE INDEX IF NOT EXISTS idx_cron_user ON cron_jobs(user_id, enabled);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS channel_bindings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel    TEXT NOT NULL,
    sender_id  TEXT NOT NULL,
    verified   INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(channel, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_bindings_user ON channel_bindings(user_id);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    event      TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    timestamp  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_ts ON audit_log(event, timestamp DESC);

-- -----------------------------------------------------------------
-- Schema version tracker
-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER NOT NULL
);

INSERT INTO _schema_version (version) VALUES (1);
"""),

    (2, """
-- ===================== v2: FTS5 full-text search on memories =====================

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    content='memories',
    content_rowid='id'
);

-- Populate index with existing history entries
INSERT INTO memories_fts(rowid, content)
    SELECT id, content FROM memories WHERE type = 'history';

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories
WHEN NEW.type = 'history'
BEGIN
    INSERT INTO memories_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories
WHEN OLD.type = 'history'
BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories
WHEN NEW.type = 'history'
BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
    INSERT INTO memories_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;
"""),

    (3, """
-- ===================== v3: per-user channel configs =====================

ALTER TABLE users ADD COLUMN channel_configs TEXT NOT NULL DEFAULT '{}';
"""),

    (4, """
-- ===================== v4: RAG chunk storage with FTS5 =====================

CREATE TABLE IF NOT EXISTS rag_chunks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    metadata   TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_user ON rag_chunks(user_id);

CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
    content,
    content='rag_chunks',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS rag_ai AFTER INSERT ON rag_chunks
BEGIN
    INSERT INTO rag_chunks_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS rag_ad AFTER DELETE ON rag_chunks
BEGIN
    INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, content)
    VALUES('delete', OLD.id, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS rag_au AFTER UPDATE OF content ON rag_chunks
BEGIN
    INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, content)
    VALUES('delete', OLD.id, OLD.content);
    INSERT INTO rag_chunks_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;
"""),

    (5, """
-- ===================== v5: client layer — identity, memory, sessions =====================

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    client_id     TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    display_name  TEXT NOT NULL DEFAULT '',
    metadata      TEXT NOT NULL DEFAULT '{}',
    first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
    total_interactions INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clients_owner_status ON clients(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_owner_last_seen ON clients(owner_id, last_seen DESC);

-- Client identities table
CREATE TABLE IF NOT EXISTS client_identities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    owner_id  TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel     TEXT NOT NULL,
    external_id TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    verified    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(owner_id, channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_client_identities_client ON client_identities(client_id);

-- Client memories table
CREATE TABLE IF NOT EXISTS client_memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    owner_id  TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_memories_client_type ON client_memories(client_id, type);
CREATE INDEX IF NOT EXISTS idx_client_memories_client_type_updated ON client_memories(client_id, type, updated_at DESC);

-- FTS5 for client_memories
CREATE VIRTUAL TABLE IF NOT EXISTS client_memories_fts USING fts5(
    content,
    content='client_memories',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS client_memories_ai AFTER INSERT ON client_memories
WHEN NEW.type = 'history'
BEGIN
    INSERT INTO client_memories_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS client_memories_ad AFTER DELETE ON client_memories
WHEN OLD.type = 'history'
BEGIN
    INSERT INTO client_memories_fts(client_memories_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS client_memories_au AFTER UPDATE OF content ON client_memories
WHEN NEW.type = 'history'
BEGIN
    INSERT INTO client_memories_fts(client_memories_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
    INSERT INTO client_memories_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

-- Add nullable client_id to sessions
ALTER TABLE sessions ADD COLUMN client_id TEXT REFERENCES clients(client_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id);
"""),

    (6, """
-- ===================== v6: multi-agent ownership =====================

CREATE TABLE IF NOT EXISTS agents (
    agent_id        TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    avatar          TEXT NOT NULL DEFAULT '',
    is_default      INTEGER NOT NULL DEFAULT 0,
    agent_config    TEXT NOT NULL DEFAULT '{}',
    bootstrap       TEXT NOT NULL DEFAULT '{}',
    tools_enabled   TEXT NOT NULL DEFAULT '[]',
    channel_configs TEXT NOT NULL DEFAULT '{}',
    metadata        TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_user_status ON agents(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_default ON agents(user_id, is_default)
    WHERE is_default = 1 AND status != 'deleted';

INSERT OR IGNORE INTO agents (
    agent_id, user_id, name, role, description, avatar, is_default,
    agent_config, bootstrap, tools_enabled, channel_configs, metadata,
    status, created_at, updated_at
)
SELECT
    user_id || ':default',
    user_id,
    COALESCE(NULLIF(display_name, ''), 'Paulo'),
    'Especialista em DP',
    'Agente padrão migrado da configuração original.',
    'P',
    1,
    agent_config,
    bootstrap,
    tools_enabled,
    channel_configs,
    '{"source":"migration_v6","template":"default"}',
    'active',
    created_at,
    updated_at
FROM users;

UPDATE sessions SET agent_id = user_id || ':default' WHERE agent_id IS NULL OR agent_id = '';
CREATE INDEX IF NOT EXISTS idx_sessions_agent_status ON sessions(user_id, agent_id, status);

UPDATE messages
SET agent_id = (
    SELECT s.agent_id FROM sessions s WHERE s.id = messages.session_id
)
WHERE agent_id IS NULL OR agent_id = '';
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(user_id, agent_id);

UPDATE memories SET agent_id = user_id || ':default' WHERE agent_id IS NULL OR agent_id = '';
CREATE INDEX IF NOT EXISTS idx_memories_agent_type ON memories(user_id, agent_id, type);

UPDATE rag_chunks SET agent_id = user_id || ':default' WHERE agent_id IS NULL OR agent_id = '';
CREATE INDEX IF NOT EXISTS idx_rag_chunks_agent ON rag_chunks(user_id, agent_id);

CREATE TABLE IF NOT EXISTS skills_v6 (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    agent_id      TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    content       TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    always_active INTEGER NOT NULL DEFAULT 0,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, agent_id, name)
);
INSERT OR IGNORE INTO skills_v6
    (id, user_id, agent_id, name, content, description, always_active, enabled, created_at, updated_at)
SELECT id, user_id, user_id || ':default', name, content, description, always_active, enabled, created_at, updated_at
FROM skills;
DROP TABLE skills;
ALTER TABLE skills_v6 RENAME TO skills;
CREATE INDEX IF NOT EXISTS idx_skills_user_agent_enabled ON skills(user_id, agent_id, enabled);

CREATE TABLE IF NOT EXISTS cron_jobs_v6 (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    agent_id         TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    job_id           TEXT NOT NULL,
    name             TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    schedule         TEXT NOT NULL,
    payload          TEXT NOT NULL,
    next_run_at_ms   INTEGER,
    last_run_at_ms   INTEGER,
    last_status      TEXT,
    last_error       TEXT,
    delete_after_run INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, agent_id, job_id)
);
INSERT OR IGNORE INTO cron_jobs_v6
    (id, user_id, agent_id, job_id, name, enabled, schedule, payload,
     next_run_at_ms, last_run_at_ms, last_status, last_error, delete_after_run,
     created_at, updated_at)
SELECT id, user_id, user_id || ':default', job_id, name, enabled, schedule, payload,
       next_run_at_ms, last_run_at_ms, last_status, last_error, delete_after_run,
       created_at, updated_at
FROM cron_jobs;
DROP TABLE cron_jobs;
ALTER TABLE cron_jobs_v6 RENAME TO cron_jobs;
CREATE INDEX IF NOT EXISTS idx_cron_enabled_next ON cron_jobs(enabled, next_run_at_ms);
CREATE INDEX IF NOT EXISTS idx_cron_user_agent ON cron_jobs(user_id, agent_id, enabled);

CREATE TABLE IF NOT EXISTS channel_bindings_v6 (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    channel    TEXT NOT NULL,
    sender_id  TEXT NOT NULL,
    verified   INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(agent_id, channel, sender_id)
);
INSERT OR IGNORE INTO channel_bindings_v6
    (id, user_id, agent_id, channel, sender_id, verified, created_at)
SELECT id, user_id, user_id || ':default', channel, sender_id, verified, created_at
FROM channel_bindings;
DROP TABLE channel_bindings;
ALTER TABLE channel_bindings_v6 RENAME TO channel_bindings;
CREATE INDEX IF NOT EXISTS idx_bindings_user_agent ON channel_bindings(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_bindings_channel_sender ON channel_bindings(channel, sender_id);
"""),

    (7, """
-- ===================== v7: revert skills + rag_chunks to user scope =====================

CREATE TABLE skills_v7 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    always_active INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
);
INSERT OR IGNORE INTO skills_v7 (id, user_id, name, content, description, always_active, enabled, created_at, updated_at)
SELECT MIN(id), user_id, name, content, description, MAX(always_active), MAX(enabled), MIN(created_at), MAX(updated_at)
FROM skills GROUP BY user_id, name;
DROP TABLE skills;
ALTER TABLE skills_v7 RENAME TO skills;
CREATE INDEX idx_skills_user_enabled ON skills(user_id, enabled);

CREATE TABLE rag_chunks_v7 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO rag_chunks_v7 (id, user_id, content, metadata, created_at)
SELECT id, user_id, content, metadata, created_at FROM rag_chunks;
DROP TABLE rag_chunks;
ALTER TABLE rag_chunks_v7 RENAME TO rag_chunks;
CREATE INDEX idx_rag_chunks_user ON rag_chunks(user_id);
DROP TABLE IF EXISTS rag_chunks_fts;
CREATE VIRTUAL TABLE rag_chunks_fts USING fts5(content, content='rag_chunks', content_rowid='id');
INSERT INTO rag_chunks_fts(rowid, content) SELECT id, content FROM rag_chunks;
CREATE TRIGGER rag_ai AFTER INSERT ON rag_chunks BEGIN
    INSERT INTO rag_chunks_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;
CREATE TRIGGER rag_ad AFTER DELETE ON rag_chunks BEGIN
    INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
END;
CREATE TRIGGER rag_au AFTER UPDATE OF content ON rag_chunks BEGIN
    INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
    INSERT INTO rag_chunks_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;
"""),

    (8, """
-- ===================== v8: credentials + user integrations =====================

CREATE TABLE IF NOT EXISTS credentials (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    provider_key   TEXT NOT NULL DEFAULT '',
    secret_cipher  TEXT NOT NULL,
    metadata       TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_user_provider ON credentials(user_id, provider_key);

CREATE TABLE IF NOT EXISTS user_integrations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kind                  TEXT NOT NULL,
    slug                  TEXT NOT NULL,
    system_integration_id TEXT,
    label                 TEXT NOT NULL DEFAULT '',
    enabled               INTEGER NOT NULL DEFAULT 1,
    credential_id         INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
    config                TEXT NOT NULL DEFAULT '{}',
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON user_integrations(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_kind ON user_integrations(user_id, kind);
"""),

    (9, """
-- ===================== v9: agent templates catalog =====================

CREATE TABLE IF NOT EXISTS agent_templates (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    role              TEXT NOT NULL DEFAULT '',
    description       TEXT NOT NULL DEFAULT '',
    category          TEXT NOT NULL DEFAULT 'Geral',
    tags              TEXT NOT NULL DEFAULT '[]',
    icon              TEXT NOT NULL DEFAULT 'sparkles',
    system_prompt     TEXT NOT NULL DEFAULT '',
    tools             TEXT NOT NULL DEFAULT '[]',
    rag_enabled       INTEGER NOT NULL DEFAULT 0,
    starter_prompts   TEXT NOT NULL DEFAULT '[]',
    model_recommended TEXT,
    display_order     INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_template_skills (
    template_id   TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL,
    always_active INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (template_id, name)
);

CREATE TABLE IF NOT EXISTS agent_template_knowledge (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
    source        TEXT NOT NULL,
    content       TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_template_skills_tpl ON agent_template_skills(template_id);
CREATE INDEX IF NOT EXISTS idx_template_knowledge_tpl ON agent_template_knowledge(template_id);
"""),

    (10, """
-- ===================== v10: template guardrails column =====================
-- Column added via _safe_add_column in the post-migration fixup below to be
-- idempotent across divergent DBs.
SELECT 1;
"""),
]

async def _safe_add_column(db: "aiosqlite.Connection", table: str, column: str, definition: str) -> None:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in await cursor.fetchall()]
    if column not in columns:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


async def _ensure_agents_table(db: "aiosqlite.Connection") -> None:
    """Create the agents table and related indices if missing.

    Runs unconditionally after all version-based migrations so that databases
    from divergent branches that already have a high schema_version but never
    had the agents table still get it created correctly.
    """
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    )
    if await cursor.fetchone():
        return

    await db.executescript("""
CREATE TABLE IF NOT EXISTS agents (
    agent_id        TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    avatar          TEXT NOT NULL DEFAULT '',
    is_default      INTEGER NOT NULL DEFAULT 0,
    agent_config    TEXT NOT NULL DEFAULT '{}',
    bootstrap       TEXT NOT NULL DEFAULT '{}',
    tools_enabled   TEXT NOT NULL DEFAULT '[]',
    channel_configs TEXT NOT NULL DEFAULT '{}',
    metadata        TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_user_status ON agents(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_default ON agents(user_id, is_default)
    WHERE is_default = 1 AND status != 'deleted';

INSERT OR IGNORE INTO agents (
    agent_id, user_id, name, role, description, avatar, is_default,
    agent_config, bootstrap, tools_enabled, channel_configs, metadata,
    status, created_at, updated_at
)
SELECT
    user_id || ':default',
    user_id,
    COALESCE(NULLIF(display_name, ''), 'Paulo'),
    'Especialista em DP',
    'Agente padrão migrado da configuração original.',
    'P',
    1,
    agent_config,
    bootstrap,
    tools_enabled,
    channel_configs,
    '{"source":"repair","template":"default"}',
    'active',
    created_at,
    updated_at
FROM users;
""")
    await db.commit()


async def _fixup_v6_add_columns(db: "aiosqlite.Connection") -> None:
    """Ensure agent-scoped columns exist on tables that keep agent scope."""
    await _safe_add_column(db, "sessions", "agent_id", "TEXT")
    await _safe_add_column(db, "messages", "agent_id", "TEXT")
    await _safe_add_column(db, "memories", "agent_id", "TEXT")
    await _safe_add_column(db, "channel_bindings", "agent_id", "TEXT")
    await db.commit()


async def _fixup_v6_cron(db: "aiosqlite.Connection") -> None:
    """Add agent_id to cron_jobs when v6 DROP+RECREATE was skipped.

    The v6 migration replaces this table entirely, but on databases whose
    schema_version was already 6 from a divergent branch the new column is
    absent.  ALTER TABLE is safe to run multiple times via _safe_add_column.
    """
    await _safe_add_column(db, "cron_jobs", "agent_id", "TEXT")
    await db.execute(
        """UPDATE cron_jobs SET agent_id = (
            SELECT a.agent_id FROM agents a
            WHERE a.user_id = cron_jobs.user_id AND a.is_default = 1 LIMIT 1
        ) WHERE agent_id IS NULL"""
    )
    await db.execute(
        "UPDATE cron_jobs SET agent_id = user_id || ':default' WHERE agent_id IS NULL"
    )
    await db.commit()


async def _fixup_v5_column_names(db: "aiosqlite.Connection") -> None:
    """Rename creator_id -> owner_id if v5 was applied from an early draft."""
    for table in ("clients", "client_identities", "client_memories"):
        cursor = await db.execute(f"PRAGMA table_info({table})")
        columns = [row[1] for row in await cursor.fetchall()]
        if "creator_id" in columns and "owner_id" not in columns:
            await db.execute(
                f"ALTER TABLE {table} RENAME COLUMN creator_id TO owner_id",
            )
    await db.commit()


async def apply_migrations(db: "aiosqlite.Connection") -> None:
    """Apply any outstanding migrations."""
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_version'"
    )
    exists = await cursor.fetchone()

    current_version = 0
    if exists:
        cursor = await db.execute("SELECT MAX(version) FROM _schema_version")
        row = await cursor.fetchone()
        current_version = row[0] if row and row[0] else 0

    for version, sql in _MIGRATIONS:
        if version > current_version:
            if version == 6:
                await _safe_add_column(db, "sessions", "agent_id", "TEXT")
                await _safe_add_column(db, "messages", "agent_id", "TEXT")
                await _safe_add_column(db, "memories", "agent_id", "TEXT")
                await _safe_add_column(db, "rag_chunks", "agent_id", "TEXT")
                await _safe_add_column(db, "channel_bindings", "agent_id", "TEXT")
                await db.commit()
            await db.executescript(sql)
            if current_version > 0:
                await db.execute("INSERT INTO _schema_version (version) VALUES (?)", (version,))
            current_version = version
            await db.commit()

    if current_version >= 5:
        await _fixup_v5_column_names(db)

    await _ensure_agents_table(db)
    await _fixup_v6_add_columns(db)
    await _fixup_v6_cron(db)
    await _fixup_v10_template_guardrails(db)
    await _fixup_v11_skill_origin(db)
    await _seed_agent_templates_if_empty(db)
    await _backfill_template_guardrails(db)
    await _backfill_missing_templates(db)
    await _refresh_skill_author_prompt(db)
    await _consolidate_pdi_templates(db)
    await _refresh_pdi_prompt(db)
    await _enable_analise_desempenho_skill(db)
    await _backfill_user_limits(db)


async def _backfill_user_limits(db: "aiosqlite.Connection") -> None:
    """Bring already-created users up to the current limit defaults.

    ``_DEFAULT_LIMITS`` only applies when a user row is created, so existing
    users keep whatever JSON was written back then — including a 30s exec ceiling
    that kills a clone, an install or a test suite, and the dead
    ``sandbox_memory``/``sandbox_cpu`` keys that never controlled anything.

    A limit the user raised above the default is left alone; this only lifts
    values that are still at or below an outdated default.
    """
    import json

    from nanobot.db.sqlite.user_repo import _DEFAULT_LIMITS

    outdated_ceilings = {"max_exec_timeout_s": 30}
    dead_keys = ("sandbox_memory", "sandbox_cpu")

    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    )
    if not await cursor.fetchone():
        return

    cursor = await db.execute("SELECT user_id, limits FROM users")
    for user_id, raw in await cursor.fetchall():
        try:
            limits = json.loads(raw) if raw else {}
        except (TypeError, ValueError):
            limits = {}
        if not isinstance(limits, dict):
            limits = {}

        updated = dict(limits)
        for key in dead_keys:
            updated.pop(key, None)
        for key, default in _DEFAULT_LIMITS.items():
            if key not in updated:
                updated[key] = default
            elif key in outdated_ceilings and updated[key] <= outdated_ceilings[key]:
                updated[key] = default

        if updated != limits:
            await db.execute(
                "UPDATE users SET limits = ? WHERE user_id = ?",
                (json.dumps(updated), user_id),
            )
    await db.commit()


async def _consolidate_pdi_templates(db: "aiosqlite.Connection") -> None:
    """Merge the two PDI templates: drop legacy `td_pdi` from the catalog and
    rename `pdi_desenvolvimento` to the consolidated name.

    Idempotent and non-destructive to user data: only the catalog rows are
    touched. Agents already created from `td_pdi` are independent copies and
    keep working. Runs only while `td_pdi` still exists (or the name is stale).
    """
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_templates'"
    )
    if not await cursor.fetchone():
        return
    cursor = await db.execute("SELECT id FROM agent_templates WHERE id='td_pdi'")
    if await cursor.fetchone():
        await db.execute("DELETE FROM agent_template_skills WHERE template_id='td_pdi'")
        await db.execute("DELETE FROM agent_template_knowledge WHERE template_id='td_pdi'")
        await db.execute("DELETE FROM agent_templates WHERE id='td_pdi'")
    await db.execute(
        "UPDATE agent_templates SET name='PDI & Desenvolvimento' "
        "WHERE id='pdi_desenvolvimento' AND name='PDI & Desenvolvimento (dados)'"
    )
    # Ensure the page/report tools are on the PDI template so they come pre-selected.
    import json
    cursor = await db.execute(
        "SELECT tools FROM agent_templates WHERE id='pdi_desenvolvimento'"
    )
    row = await cursor.fetchone()
    if row:
        try:
            tools = json.loads(row[0]) if row[0] else []
        except (TypeError, ValueError):
            tools = []
        changed = False
        for t in ("publish_page", "publish_report", "azure_devops_report"):
            if t not in tools:
                tools.append(t)
                changed = True
        if changed:
            await db.execute(
                "UPDATE agent_templates SET tools=? WHERE id='pdi_desenvolvimento'",
                (json.dumps(tools, ensure_ascii=False),),
            )
    await db.commit()


async def _fixup_v11_skill_origin(db: "aiosqlite.Connection") -> None:
    """Track skill origin (user vs solides template) so the UI can filter."""
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skills'"
    )
    if not await cursor.fetchone():
        return
    await _safe_add_column(
        db, "skills", "origin", "TEXT NOT NULL DEFAULT 'user'"
    )
    cursor = await db.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name='agent_template_skills'"
    )
    if await cursor.fetchone():
        await db.execute(
            "UPDATE skills SET origin = 'solides' "
            "WHERE origin = 'user' AND name IN ("
            "  SELECT DISTINCT name FROM agent_template_skills"
            ")"
        )
    await db.commit()


async def _fixup_v10_template_guardrails(db: "aiosqlite.Connection") -> None:
    """Ensure agent_templates has a guardrails column."""
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_templates'"
    )
    if not await cursor.fetchone():
        return
    await _safe_add_column(
        db, "agent_templates", "guardrails", "TEXT NOT NULL DEFAULT ''"
    )
    await db.commit()


async def _backfill_missing_templates(db: "aiosqlite.Connection") -> None:
    """Insert any missing seed template or its skills/knowledge.

    The initial seed only runs on empty tables. This backfill handles two
    cases: (1) templates added to SOLIDES_TEMPLATES after first startup, and
    (2) templates already present but whose skill/knowledge rows are empty
    (e.g. partial seed after an earlier crash). User-edited rows are
    preserved: skills/knowledge are only inserted when the child count is 0.
    """
    import json

    from nanobot.db.sqlite.seed.agent_templates_solides import SOLIDES_TEMPLATES

    cursor = await db.execute("SELECT id FROM agent_templates")
    existing = {row[0] for row in await cursor.fetchall()}

    cursor = await db.execute("SELECT COALESCE(MAX(display_order), -1) FROM agent_templates")
    row = await cursor.fetchone()
    next_order = (row[0] if row else -1) + 1

    for tpl in SOLIDES_TEMPLATES:
        if tpl["id"] not in existing:
            await db.execute(
                """INSERT INTO agent_templates (
                    id, name, role, description, category, tags, icon,
                    system_prompt, guardrails, tools, rag_enabled, starter_prompts,
                    model_recommended, display_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    tpl["id"],
                    tpl["name"],
                    tpl.get("role", ""),
                    tpl.get("description", ""),
                    tpl.get("category", "Geral"),
                    json.dumps(tpl.get("tags", []), ensure_ascii=False),
                    tpl.get("icon", "sparkles"),
                    tpl.get("system_prompt", ""),
                    tpl.get("guardrails", ""),
                    json.dumps(tpl.get("tools", []), ensure_ascii=False),
                    1 if tpl.get("rag_enabled") else 0,
                    json.dumps(tpl.get("starter_prompts", []), ensure_ascii=False),
                    tpl.get("model_recommended"),
                    next_order,
                ),
            )
            next_order += 1

        cursor = await db.execute(
            "SELECT COUNT(*) FROM agent_template_skills WHERE template_id = ?",
            (tpl["id"],),
        )
        row = await cursor.fetchone()
        skills_count = row[0] if row else 0
        if skills_count == 0:
            for skill_order, skill in enumerate(tpl.get("skills", [])):
                await db.execute(
                    """INSERT INTO agent_template_skills (
                        template_id, name, description, content,
                        always_active, display_order
                    ) VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        tpl["id"],
                        skill["name"],
                        skill.get("description", ""),
                        skill["content"],
                        1 if skill.get("always_active") else 0,
                        skill_order,
                    ),
                )

        cursor = await db.execute(
            "SELECT COUNT(*) FROM agent_template_knowledge WHERE template_id = ?",
            (tpl["id"],),
        )
        row = await cursor.fetchone()
        knowledge_count = row[0] if row else 0
        if knowledge_count == 0:
            for knowledge_order, doc in enumerate(tpl.get("knowledge", [])):
                await db.execute(
                    """INSERT INTO agent_template_knowledge (
                        template_id, source, content, display_order
                    ) VALUES (?, ?, ?, ?)""",
                    (tpl["id"], doc["source"], doc["content"], knowledge_order),
                )
    await db.commit()


async def _backfill_template_guardrails(db: "aiosqlite.Connection") -> None:
    """Populate guardrails on catalog templates that ship with the seed.

    Templates already in the DB from a previous seed have empty guardrails
    after v10. This backfills them from the seed source without touching
    user-edited templates (only rows whose guardrails is still empty).
    """
    from nanobot.db.sqlite.seed.agent_templates_solides import SOLIDES_TEMPLATES

    for tpl in SOLIDES_TEMPLATES:
        guardrails = tpl.get("guardrails", "")
        if not guardrails:
            continue
        await db.execute(
            "UPDATE agent_templates SET guardrails = ? "
            "WHERE id = ? AND (guardrails IS NULL OR guardrails = '')",
            (guardrails, tpl["id"]),
        )
    await db.commit()


async def _seed_agent_templates_if_empty(db: "aiosqlite.Connection") -> None:
    """Populate the Sólides agent templates catalog if the table is empty.

    The seed is idempotent by design: it only runs when agent_templates has
    zero rows. Admins editing templates via UI/API in the future will not be
    overwritten on next startup.
    """
    cursor = await db.execute("SELECT COUNT(*) FROM agent_templates")
    row = await cursor.fetchone()
    if row and row[0] > 0:
        return

    import json

    from nanobot.db.sqlite.seed.agent_templates_solides import SOLIDES_TEMPLATES

    for order, tpl in enumerate(SOLIDES_TEMPLATES):
        await db.execute(
            """INSERT INTO agent_templates (
                id, name, role, description, category, tags, icon,
                system_prompt, guardrails, tools, rag_enabled, starter_prompts,
                model_recommended, display_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                tpl["id"],
                tpl["name"],
                tpl.get("role", ""),
                tpl.get("description", ""),
                tpl.get("category", "Geral"),
                json.dumps(tpl.get("tags", []), ensure_ascii=False),
                tpl.get("icon", "sparkles"),
                tpl.get("system_prompt", ""),
                tpl.get("guardrails", ""),
                json.dumps(tpl.get("tools", []), ensure_ascii=False),
                1 if tpl.get("rag_enabled") else 0,
                json.dumps(tpl.get("starter_prompts", []), ensure_ascii=False),
                tpl.get("model_recommended"),
                order,
            ),
        )
        for skill_order, skill in enumerate(tpl.get("skills", [])):
            await db.execute(
                """INSERT INTO agent_template_skills (
                    template_id, name, description, content,
                    always_active, display_order
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    tpl["id"],
                    skill["name"],
                    skill.get("description", ""),
                    skill["content"],
                    1 if skill.get("always_active") else 0,
                    skill_order,
                ),
            )
        for knowledge_order, doc in enumerate(tpl.get("knowledge", [])):
            await db.execute(
                """INSERT INTO agent_template_knowledge (
                    template_id, source, content, display_order
                ) VALUES (?, ?, ?, ?)""",
                (tpl["id"], doc["source"], doc["content"], knowledge_order),
            )
    await db.commit()


_SKILL_AUTHOR_LEGACY_MARKER = "Rascunhe a estrutura da skill em Markdown"


async def _enable_analise_desempenho_skill(db: "aiosqlite.Connection") -> None:
    """Enable the builtin analise-desempenho skill on existing PDI-style agents.

    Agents store a closed skills_enabled list in agent_config, so builtin skills
    added later stay invisible to them. Any agent that already enables montar-pdi
    or relatorio-time-azure gets analise-desempenho appended. Idempotent.
    """
    import json

    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    )
    if not await cursor.fetchone():
        return
    cursor = await db.execute(
        "SELECT agent_id, agent_config FROM agents WHERE agent_config LIKE ?",
        ("%skills_enabled%",),
    )
    for agent_id, config_raw in await cursor.fetchall():
        try:
            config = json.loads(config_raw)
        except (TypeError, ValueError):
            continue
        skills = config.get("skills_enabled")
        if not isinstance(skills, list) or "analise-desempenho" in skills:
            continue
        if "montar-pdi" not in skills and "relatorio-time-azure" not in skills:
            continue
        skills.append("analise-desempenho")
        await db.execute(
            "UPDATE agents SET agent_config = ? WHERE agent_id = ?",
            (json.dumps(config, ensure_ascii=False), agent_id),
        )
    await db.commit()


_PDI_PROMPT_ANCHOR = "parceiro de desenvolvimento de pessoas da Sólides"
_PDI_PROMPT_MARKER = "Pedidos compostos"


async def _refresh_pdi_prompt(db: "aiosqlite.Connection") -> None:
    """Add the multi-part-request directive to the PDI prompt.

    Updates the `pdi_desenvolvimento` catalog template and any agent already
    instantiated from it with the seed prompt that carries the "Pedidos
    compostos" directive. Rows are only touched while they still contain the
    seed anchor phrase and lack the new marker — admin-rewritten prompts never
    match the anchor and are left untouched. Idempotent: once the marker is
    present, nothing matches. The SQL prefilter on agents.bootstrap uses an
    accent-free substring because the JSON may store escaped unicode; the
    precise anchor check runs in Python on the parsed text.
    """
    import json

    from nanobot.db.sqlite.seed.agent_templates_solides import SOLIDES_TEMPLATES

    tpl = next((t for t in SOLIDES_TEMPLATES if t["id"] == "pdi_desenvolvimento"), None)
    if not tpl:
        return
    new_prompt = tpl.get("system_prompt", "")
    if _PDI_PROMPT_MARKER not in new_prompt:
        return

    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_templates'"
    )
    if await cursor.fetchone():
        await db.execute(
            "UPDATE agent_templates SET system_prompt = ? "
            "WHERE id = 'pdi_desenvolvimento' AND system_prompt LIKE ? "
            "AND system_prompt NOT LIKE ?",
            (new_prompt, f"%{_PDI_PROMPT_ANCHOR}%", f"%{_PDI_PROMPT_MARKER}%"),
        )

    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    )
    if await cursor.fetchone():
        cursor = await db.execute(
            "SELECT agent_id, bootstrap FROM agents WHERE bootstrap LIKE ?",
            ("%parceiro de desenvolvimento de pessoas%",),
        )
        for agent_id, bootstrap_raw in await cursor.fetchall():
            try:
                bootstrap = json.loads(bootstrap_raw)
            except (TypeError, ValueError):
                continue
            text = bootstrap.get("AGENTS.md", "")
            if _PDI_PROMPT_ANCHOR not in text or _PDI_PROMPT_MARKER in text:
                continue
            head, sep, tail = text.partition("\n## Guardrails")
            bootstrap["AGENTS.md"] = new_prompt + sep + tail
            await db.execute(
                "UPDATE agents SET bootstrap = ? WHERE agent_id = ?",
                (json.dumps(bootstrap, ensure_ascii=False), agent_id),
            )

    await db.commit()


async def _refresh_skill_author_prompt(db: "aiosqlite.Connection") -> None:
    """Replace the legacy interview-style skill_author prompt with the seed.

    The first skill_author prompt drove an interview flow (option menus, long
    checklists) that misbehaved on smaller models. This updates both the
    catalog template and any agent already instantiated from it, but only
    while they still carry the exact legacy prompt — admin-edited rows never
    match the marker, so they are left untouched. The update is idempotent:
    the new prompt lacks the marker, so it runs at most once per row.
    """
    import json

    from nanobot.db.sqlite.seed.agent_templates_solides import SOLIDES_TEMPLATES

    tpl = next((t for t in SOLIDES_TEMPLATES if t["id"] == "skill_author"), None)
    if not tpl:
        return
    new_prompt = tpl.get("system_prompt", "")
    if not new_prompt or _SKILL_AUTHOR_LEGACY_MARKER in new_prompt:
        return

    marker_like = f"%{_SKILL_AUTHOR_LEGACY_MARKER}%"

    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_templates'"
    )
    if await cursor.fetchone():
        await db.execute(
            "UPDATE agent_templates SET system_prompt = ?, guardrails = ? "
            "WHERE id = 'skill_author' AND system_prompt LIKE ?",
            (new_prompt, tpl.get("guardrails", ""), marker_like),
        )

    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    )
    if await cursor.fetchone():
        cursor = await db.execute(
            "SELECT agent_id, bootstrap FROM agents WHERE bootstrap LIKE ?",
            (marker_like,),
        )
        for agent_id, bootstrap_raw in await cursor.fetchall():
            try:
                bootstrap = json.loads(bootstrap_raw)
            except (TypeError, ValueError):
                continue
            if _SKILL_AUTHOR_LEGACY_MARKER not in bootstrap.get("AGENTS.md", ""):
                continue
            bootstrap["AGENTS.md"] = new_prompt
            await db.execute(
                "UPDATE agents SET bootstrap = ? WHERE agent_id = ?",
                (json.dumps(bootstrap, ensure_ascii=False), agent_id),
            )

    await db.commit()
