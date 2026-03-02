# Database Schema

> SQLite (via aiosqlite) com WAL mode. Arquivo: `~/.nanobot/nanobot.db`
>
> Todas as interfaces estao em `nanobot/db/repositories.py` como Protocols.
> Implementacao atual: `nanobot/db/sqlite/`. Migrar para MongoDB/Postgres requer apenas novas implementacoes.

## Visao Geral

```
users              perfil, agent config, limits, bootstrap (prompt extensions), channel configs
sessions           conversas por user_id + session_key (+ client_id opcional)
messages           mensagens separadas por sessao (role, content, tool_calls)
memories           long_term (1 por user) + history (N registros, pesquisavel via FTS5)
skills             skills customizadas por usuario (builtins ficam no filesystem)
cron_jobs          jobs agendados por usuario
channel_bindings   mapeamento sender_id (Telegram, Discord, etc.) -> user_id
audit_log          trilha de auditoria append-only
rag_chunks         chunks de RAG por usuario com FTS5
clients            perfis de end-users (clients) por creator
client_identities  mapeamento multi-canal de clients (Telegram ID, WhatsApp, etc.)
client_memories    memoria per-client: long_term + history com FTS5
```

## Migrations

| Versao | Descricao |
|--------|-----------|
| v1 | Schema inicial: 8 tabelas + indices + _schema_version |
| v2 | FTS5 full-text search em memories (type='history') + triggers de sync |
| v3 | `users.channel_configs` — configuracoes de canais per-user (JSON) |
| v4 | RAG chunk storage com FTS5 (`rag_chunks` + `rag_chunks_fts`) |
| v5 | Client layer: `clients`, `client_identities`, `client_memories` + FTS5 + coluna `client_id` em `sessions` |

Migrations sao aplicadas automaticamente em `nanobot/db/sqlite/migrations.py`.

---

## Tabelas

### users

Perfil do usuario, configuracao do agente, limites de uso e contadores.

```sql
CREATE TABLE users (
    user_id        TEXT PRIMARY KEY,             -- 'usr_abc123'
    display_name   TEXT NOT NULL,
    email          TEXT UNIQUE,
    api_key_hash   TEXT UNIQUE,                  -- sha256, nunca plaintext
    role           TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'

    -- JSON serializado
    agent_config   TEXT NOT NULL DEFAULT '{}',    -- {model, max_tokens, temperature, ...}
    bootstrap      TEXT NOT NULL DEFAULT '{}',    -- prompt extensions per-user (ver abaixo)
    limits         TEXT NOT NULL DEFAULT '{}',    -- {max_sessions, max_tokens_per_day, ...}
    tools_enabled  TEXT NOT NULL DEFAULT '[]',    -- ["exec", "web_search", ...]
    channel_configs TEXT NOT NULL DEFAULT '{}',   -- configs de canais per-user (v3)

    -- Contadores de uso
    tokens_today      INTEGER NOT NULL DEFAULT 0,
    tokens_total      INTEGER NOT NULL DEFAULT 0,
    requests_today    INTEGER NOT NULL DEFAULT 0,
    last_request_at   TEXT,                       -- ISO datetime
    usage_reset_date  TEXT,                       -- YYYY-MM-DD

    status     TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'suspended' | 'disabled'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**agent_config** (defaults):
```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "max_tokens": 8192,
  "temperature": 0.1,
  "max_tool_iterations": 40,
  "memory_window": 100
}
```

**bootstrap** — prompt extensions per-user. Chaves sao nomes de arquivo (SOUL.md, AGENTS.md, USER.md). Combinados com base prompts de `nanobot/prompts/` pelo ContextBuilder:
```json
{
  "SOUL.md": "Eu sou um assistente especializado em Python.",
  "AGENTS.md": "Sempre forneca citacoes.",
  "USER.md": "O usuario se chama Carlos, trabalha com data science."
}
```

**limits** (defaults):
```json
{
  "max_sessions": 100,
  "max_memory_entries": 10000,
  "max_skills": 50,
  "max_cron_jobs": 20,
  "max_exec_timeout_s": 30,
  "max_tokens_per_day": 1000000,
  "max_requests_per_minute": 30,
  "sandbox_memory": "256m",
  "sandbox_cpu": "0.5"
}
```

**channel_configs** — configuracoes de canais per-user (adicionado na migration v3). Cada chave e o nome do canal:
```json
{
  "telegram": {
    "enabled": true,
    "token": "bot123:ABC-DEF",
    "allow_from": ["123456789"]
  },
  "discord": {
    "enabled": false,
    "token": "MTIz..."
  }
}
```

### sessions

Conversas por usuario. Chave unica: `(user_id, session_key)`.

```sql
CREATE TABLE sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_key       TEXT NOT NULL,               -- 'telegram:12345' ou 'web:ses_abc'
    last_consolidated INTEGER NOT NULL DEFAULT 0,  -- seq da ultima consolidacao
    message_count     INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'active',
    metadata          TEXT NOT NULL DEFAULT '{}',
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(user_id, session_key)
);
```

### messages

Mensagens separadas da sessao para facilitar queries e evitar limites de documento.

```sql
CREATE TABLE messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,                    -- desnormalizado para queries
    role         TEXT NOT NULL,                    -- 'user' | 'assistant' | 'system' | 'tool'
    content      TEXT,
    tool_calls   TEXT,                             -- JSON array
    tool_call_id TEXT,
    name         TEXT,                             -- tool name (para role='tool')
    timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
    seq          INTEGER NOT NULL                  -- ordem dentro da sessao
);
```

### memories

Dois tipos: `long_term` (1 por user, UPSERT) e `history` (N registros, append-only, pesquisavel via FTS5).

```sql
CREATE TABLE memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type       TEXT NOT NULL,                      -- 'long_term' | 'history'
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 para busca full-text em history (v2)
CREATE VIRTUAL TABLE memories_fts USING fts5(
    content, content='memories', content_rowid='id'
);
-- Triggers automaticos mantém o indice FTS sincronizado
```

### skills

Skills customizadas por usuario. Builtins ficam no filesystem (`nanobot/skills/`), read-only.

```sql
CREATE TABLE skills (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    content       TEXT NOT NULL,                    -- conteudo completo do SKILL.md
    description   TEXT NOT NULL DEFAULT '',
    always_active INTEGER NOT NULL DEFAULT 0,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(user_id, name)
);
```

### cron_jobs

Jobs agendados por usuario com suporte a cron expressions, intervalos e one-shots.

```sql
CREATE TABLE cron_jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    job_id           TEXT NOT NULL,                 -- UUID curto
    name             TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    schedule         TEXT NOT NULL,                 -- JSON: {kind, at_ms, every_ms, expr, tz}
    payload          TEXT NOT NULL,                 -- JSON: {kind, message, deliver, channel, to}
    next_run_at_ms   INTEGER,
    last_run_at_ms   INTEGER,
    last_status      TEXT,
    last_error       TEXT,
    delete_after_run INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(user_id, job_id)
);
```

### channel_bindings

Mapeamento de IDs externos (sender_id de Telegram, Discord, etc.) para user_id interno.

```sql
CREATE TABLE channel_bindings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel    TEXT NOT NULL,                       -- 'telegram', 'discord', etc.
    sender_id  TEXT NOT NULL,                       -- ID do user no canal
    verified   INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(channel, sender_id)
);
```

### audit_log

Trilha de auditoria append-only.

```sql
CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    event      TEXT NOT NULL,                       -- 'tool_exec', 'login', 'config_change', ...
    detail     TEXT NOT NULL DEFAULT '{}',          -- JSON
    ip_address TEXT,
    user_agent TEXT,
    timestamp  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### rag_chunks

Chunks de RAG por usuario com busca full-text via FTS5.

```sql
CREATE TABLE rag_chunks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    metadata   TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 para busca full-text em chunks (v4)
CREATE VIRTUAL TABLE rag_chunks_fts USING fts5(
    content, content='rag_chunks', content_rowid='id'
);
-- Triggers automaticos mantém o indice FTS sincronizado
```

### clients

Perfis de end-users (clients) por creator. Auto-criados na primeira mensagem de um canal.

```sql
CREATE TABLE clients (
    client_id          TEXT PRIMARY KEY,           -- UUID
    owner_id           TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    display_name       TEXT NOT NULL DEFAULT '',
    metadata           TEXT NOT NULL DEFAULT '{}',  -- JSON: tags, notas, campos customizados
    first_seen         TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen          TEXT NOT NULL DEFAULT (datetime('now')),
    total_interactions INTEGER NOT NULL DEFAULT 0,
    status             TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'blocked' | 'archived'
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_clients_owner_status ON clients(owner_id, status);
CREATE INDEX idx_clients_owner_last_seen ON clients(owner_id, last_seen DESC);
```

### client_identities

Mapeamento multi-canal de clients. Um client pode ter identidades em Telegram, WhatsApp, Discord, etc.

```sql
CREATE TABLE client_identities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    owner_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel      TEXT NOT NULL,                     -- 'telegram', 'whatsapp', 'discord', etc.
    external_id  TEXT NOT NULL,                     -- ID do user no canal
    display_name TEXT NOT NULL DEFAULT '',
    verified     INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(owner_id, channel, external_id)
);

CREATE INDEX idx_client_identities_client ON client_identities(client_id);
```

### client_memories

Memoria per-client: `long_term` (1 por client, UPSERT) e `history` (N registros, pesquisavel via FTS5).

```sql
CREATE TABLE client_memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id  TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    owner_id   TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type       TEXT NOT NULL,                       -- 'long_term' | 'history'
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_client_memories_client_type ON client_memories(client_id, type);

-- FTS5 para busca full-text em history (v5)
CREATE VIRTUAL TABLE client_memories_fts USING fts5(
    content, content='client_memories', content_rowid='id'
);
-- Triggers automaticos mantém o indice FTS sincronizado
```

---

## Repositorios

Interfaces core em `nanobot/db/repositories.py`, interfaces de client em `nanobot/db/client_repositories.py`:

| Repository | Interfaces | Funcao |
|------------|-----------|--------|
| `UserRepository` | `repositories.py` | CRUD users, usage tracking, rate limits |
| `SessionRepository` | `repositories.py` | CRUD sessoes, metadados, consolidacao |
| `MessageRepository` | `repositories.py` | Mensagens por sessao, append/query por seq |
| `MemoryRepository` | `repositories.py` | Long-term (UPSERT) + history (append + FTS5 search) |
| `SkillRepository` | `repositories.py` | CRUD skills por usuario |
| `CronRepository` | `repositories.py` | CRUD cron jobs, scheduling, status |
| `ChannelBindingRepository` | `repositories.py` | Bind/unbind sender_id <-> user_id |
| `AuditRepository` | `repositories.py` | Append log + TTL cleanup |
| `ClientRepository` | `client_repositories.py` | CRUD clients, touch (update last_seen), list/count by owner |
| `ClientIdentityRepository` | `client_repositories.py` | Lookup/create/reassign identidades multi-canal |
| `ClientMemoryRepository` | `client_repositories.py` | Long-term + history per-client com FTS5, merge support |

## Diagrama de Relacionamentos

```
users (1) ──── (*) sessions ──── (*) messages
  │                   │
  │                   └──── (?) clients (via client_id, nullable)
  │
  ├──── (*) memories
  ├──── (*) skills
  ├──── (*) cron_jobs
  ├──── (*) channel_bindings
  ├──── (*) audit_log
  ├──── (*) rag_chunks
  │
  └──── (*) clients (via owner_id)
              │
              ├──── (*) client_identities
              └──── (*) client_memories
```

Todos os relacionamentos usam `ON DELETE CASCADE`. Foreign keys estao ativas (`PRAGMA foreign_keys=ON`). A coluna `sessions.client_id` usa `ON DELETE SET NULL` para preservar sessoes quando um client e deletado.
