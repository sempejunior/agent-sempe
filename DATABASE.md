# Database Schema

> SQLite (via aiosqlite) com WAL mode. Arquivo: `~/.nanobot/nanobot.db`
>
> Todas as interfaces estao em `nanobot/db/repositories.py` como Protocols.
> Implementacao atual: `nanobot/db/sqlite/`. Migrar para MongoDB/Postgres requer apenas novas implementacoes.

## Visao Geral

```
users              perfil, agent config, limits, bootstrap (prompt extensions), channel configs
sessions           conversas por user_id + session_key
messages           mensagens separadas por sessao (role, content, tool_calls)
memories           long_term (1 por user) + history (N registros, pesquisavel via FTS5)
skills             skills customizadas por usuario (builtins ficam no filesystem)
cron_jobs          jobs agendados por usuario
channel_bindings   mapeamento sender_id (Telegram, Discord, etc.) -> user_id
audit_log          trilha de auditoria append-only
```

## Migrations

| Versao | Descricao |
|--------|-----------|
| v1 | Schema inicial: 8 tabelas + indices + _schema_version |
| v2 | FTS5 full-text search em memories (type='history') + triggers de sync |
| v3 | `users.channel_configs` — configuracoes de canais per-user (JSON) |

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

---

## Repositorios

Todas as interfaces em `nanobot/db/repositories.py`:

| Repository | Implementacao | Funcao |
|------------|--------------|--------|
| `UserRepository` | `sqlite/user_repo.py` | CRUD users, usage tracking, rate limits |
| `SessionRepository` | `sqlite/session_repo.py` | CRUD sessoes, metadados, consolidacao |
| `MessageRepository` | `sqlite/message_repo.py` | Mensagens por sessao, append/query por seq |
| `MemoryRepository` | `sqlite/memory_repo.py` | Long-term (UPSERT) + history (append + FTS5 search) |
| `SkillRepository` | `sqlite/skill_repo.py` | CRUD skills por usuario |
| `CronRepository` | `sqlite/cron_repo.py` | CRUD cron jobs, scheduling, status |
| `ChannelBindingRepository` | `sqlite/channel_binding_repo.py` | Bind/unbind sender_id <-> user_id |
| `AuditRepository` | `sqlite/audit_repo.py` | Append log + TTL cleanup |

## Diagrama de Relacionamentos

```
users (1) ──── (*) sessions ──── (*) messages
  │
  ├──── (*) memories
  ├──── (*) skills
  ├──── (*) cron_jobs
  ├──── (*) channel_bindings
  └──── (*) audit_log
```

Todos os relacionamentos usam `ON DELETE CASCADE`. Foreign keys estao ativas (`PRAGMA foreign_keys=ON`).
