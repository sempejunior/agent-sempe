# Estrategia de Banco de Dados: SQLite + PostgreSQL

> Dual-backend storage: SQLite para modo local, PostgreSQL para modo cloud (multiuser).

---

## Sumario

1. [Visao Geral](#1-visao-geral)
2. [Modos de Operacao](#2-modos-de-operacao)
3. [Arquitetura Atual](#3-arquitetura-atual)
4. [Inventario do Schema](#4-inventario-do-schema)
5. [Mapeamento SQLite para PostgreSQL](#5-mapeamento-sqlite-para-postgresql)
6. [Plano de Implementacao](#6-plano-de-implementacao)
7. [Detalhes por Repositorio](#7-detalhes-por-repositorio)
8. [Full-Text Search](#8-full-text-search)
9. [Connection Management](#9-connection-management)
10. [Integracoes Necessarias](#10-integracoes-necessarias)
11. [Migracao de Dados](#11-migracao-de-dados)
12. [Checklist de Implementacao](#12-checklist-de-implementacao)

---

## 1. Visao Geral

O nanobot opera em dois modos distintos com necessidades de storage diferentes:

| Modo | Flag | Storage | Cenario |
|------|------|---------|---------|
| **Local** | (default) | SQLite | Desenvolvedor rodando na propria maquina. Single-user. Zero config. |
| **Cloud** | `--multiuser` | PostgreSQL | Deploy em servidor/cloud. Multi-user. Requer `--database-url`. |

O principio e: **SQLite para simplicidade local, PostgreSQL para escala cloud**. Ambos
coexistem no codebase e compartilham as mesmas interfaces (Protocols).

---

## 2. Modos de Operacao

### Modo Local (SQLite)

```bash
nanobot gateway
```

- Sobe o web server com frontend
- Cria/usa `~/.nanobot/nanobot.db` (SQLite)
- Single-user, sem autenticacao
- Ideal para: desenvolvimento, teste, uso pessoal
- Zero dependencias externas (SQLite e built-in no Python)

### Modo Cloud (PostgreSQL)

```bash
nanobot gateway --multiuser --database-url postgresql://user:pass@host:5432/nanobot
```

- Multi-user com autenticacao JWT
- Connection pooling via asyncpg
- FTS via tsvector + GIN indexes
- Ideal para: producao, SaaS, times, deploy em cloud
- Requer: PostgreSQL 15+ com extensao `pg_trgm`

---

## 3. Arquitetura Atual

### Protocol-Based Repositories

Toda a persistencia e definida por **11 Protocol interfaces** em `db/repositories.py`
e `db/client_repositories.py`. Nenhum codigo fora de `db/` importa implementacoes
concretas — tudo depende dos Protocols.

```
nanobot/db/
├── repositories.py            # 8 Protocols (User, Session, Message, Memory, Skill, Cron, ChannelBinding, Retriever, Audit)
├── client_repositories.py     # 3 Protocols (Client, ClientIdentity, ClientMemory)
├── factory.py                 # RepositoryFactory dataclass + create_sqlite_factory()
├── sqlite/                    # Implementacao SQLite (atual, completa)
│   ├── __init__.py
│   ├── connection.py          # aiosqlite connection + WAL + SSHFS workaround
│   ├── migrations.py          # Schema DDL (5 versoes, 16 tabelas)
│   ├── user_repo.py           # SQLiteUserRepository
│   ├── session_repo.py        # SQLiteSessionRepository
│   ├── memory_repo.py         # SQLiteMemoryRepository (FTS5)
│   ├── skill_repo.py          # SQLiteSkillRepository
│   ├── cron_repo.py           # SQLiteCronRepository
│   ├── channel_binding_repo.py# SQLiteChannelBindingRepository
│   ├── audit_repo.py          # SQLiteAuditRepository
│   ├── rag_repo.py            # SQLiteRetrieverRepository (FTS5)
│   ├── client_repo.py         # SQLiteClientRepository
│   ├── client_identity_repo.py# SQLiteClientIdentityRepository
│   └── client_memory_repo.py  # SQLiteClientMemoryRepository (FTS5)
└── postgres/                  # Implementacao PostgreSQL (A CRIAR)
    ├── __init__.py
    ├── connection.py           # asyncpg Pool
    ├── migrations.py           # DDL com tsvector, JSONB, GIN indexes
    ├── user_repo.py
    ├── session_repo.py
    ├── memory_repo.py          # tsvector + GIN
    ├── skill_repo.py
    ├── cron_repo.py
    ├── channel_binding_repo.py
    ├── audit_repo.py
    ├── rag_repo.py             # tsvector + GIN
    ├── client_repo.py
    ├── client_identity_repo.py
    └── client_memory_repo.py   # tsvector + GIN
```

### Dependency Flow

```
cli/commands.py
  ├── (default)    → create_sqlite_factory(db_conn)
  └── (--multiuser) → create_postgres_factory(database_url)   # A IMPLEMENTAR
        ↓
  RepositoryFactory (11 repos)
        ↓
  AgentLoop / WebServer / Channels (usam Protocols, nao implementacoes)
```

---

## 4. Inventario do Schema

### Tabelas (16 total)

| # | Tabela | Versao | Descricao | Features SQLite-Specific |
|---|--------|--------|-----------|--------------------------|
| 1 | `users` | v1 | Contas de usuario + config | JSON como TEXT, `datetime('now')` |
| 2 | `sessions` | v1 | Metadados de sessao | AUTOINCREMENT, JSON metadata |
| 3 | `messages` | v1 | Mensagens por sessao | AUTOINCREMENT, JSON tool_calls |
| 4 | `memories` | v1 | Memoria do agente (long_term + history) | Type discrimination, datetime |
| 5 | `skills` | v1 | Skills customizadas por user | UNIQUE(user_id, name) |
| 6 | `cron_jobs` | v1 | Jobs agendados | JSON schedule/payload, NULLS LAST |
| 7 | `channel_bindings` | v1 | Mapeamento sender → user | ON CONFLICT |
| 8 | `audit_log` | v1 | Log de auditoria | JSON detail, datetime arithmetic |
| 9 | `memories_fts` | v2 | FTS5 virtual table | **FTS5 + triggers** |
| 10 | `rag_chunks` | v4 | Chunks RAG | json_extract() |
| 11 | `rag_chunks_fts` | v4 | FTS5 virtual table | **FTS5 + triggers** |
| 12 | `clients` | v5 | Perfis de end-users | AUTOINCREMENT, JSON metadata |
| 13 | `client_identities` | v5 | Identidades cross-channel | UNIQUE composite |
| 14 | `client_memories` | v5 | Memoria por cliente | Type discrimination |
| 15 | `client_memories_fts` | v5 | FTS5 virtual table | **FTS5 + triggers** |
| 16 | `_schema_version` | v1 | Controle de migracao | Single-row tracker |

### Colunas JSON (armazenadas como TEXT no SQLite)

| Tabela | Coluna | Conteudo Tipico |
|--------|--------|-----------------|
| users | agent_config | {model, temperature, max_tokens, provider: {name, api_key}, rag: {...}} |
| users | bootstrap | {SOUL.md: "...", AGENTS.md: "..."} |
| users | limits | {max_tokens_per_day, max_requests_per_minute} |
| users | tools_enabled | ["read_file", "web_search", "exec", ...] |
| users | channel_configs | {telegram: {token, allow_from}, ...} |
| sessions | metadata | {title, ...} |
| messages | tool_calls | [{id, function: {name, arguments}}] |
| cron_jobs | schedule | {kind, expr, tz} |
| cron_jobs | payload | {message, deliver, channel, to} |
| rag_chunks | metadata | {source, title, ...} |
| audit_log | detail | Evento-specific JSON |
| clients | metadata | Freeform JSON |

---

## 5. Mapeamento SQLite para PostgreSQL

### Tipos e Funcoes

| SQLite | PostgreSQL | Notas |
|--------|-----------|-------|
| `TEXT` (JSON) | `JSONB` | Nativo, indexavel, operadores `->`, `->>`, `@>` |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGSERIAL PRIMARY KEY` | Ou `GENERATED ALWAYS AS IDENTITY` |
| `datetime('now')` | `NOW()` / `CURRENT_TIMESTAMP` | Retorna `timestamp with time zone` |
| `datetime('now', '-N days')` | `NOW() - INTERVAL 'N days'` | Para cleanup do audit_log |
| `json_extract(col, '$.key')` | `col->>'key'` | Operador JSONB |
| `FTS5 virtual table` | `tsvector` + GIN index | Ver secao 8 |
| `MATCH` query | `@@` operator com `to_tsquery()` | Ver secao 8 |
| `ON CONFLICT DO UPDATE` | `ON CONFLICT DO UPDATE` | Sintaxe identica |
| `NULLS LAST` | `NULLS LAST` | Sintaxe identica |
| `LIKE '%term%'` | `ILIKE '%term%'` | Case-insensitive no Postgres |
| `PRAGMA journal_mode=WAL` | N/A (MVCC nativo) | Postgres ja faz isso |
| `PRAGMA foreign_keys=ON` | Default ON | Postgres ja enforce por padrao |

### JSON Strategy

**Recomendacao: usar JSONB no PostgreSQL.**

- Colunas frequentemente lidas inteiras (bootstrap, limits, channel_configs): `JSONB` com
  serialization/deserialization automatica pelo asyncpg
- Colunas com queries internas (rag metadata): `JSONB` com operadores nativos
- O codigo atual usa `json.dumps()`/`json.loads()` manual — o asyncpg faz isso automaticamente
  com type codec registration

---

## 6. Plano de Implementacao

### Fase 1: Foundation (~1 dia)

**Objetivo:** Infraestrutura de conexao e migracao.

1. Criar `nanobot/db/postgres/__init__.py`
2. Criar `nanobot/db/postgres/connection.py`:
   - `async def create_pool(dsn: str) -> asyncpg.Pool`
   - Pool config: min_size=5, max_size=20
   - JSONB codec registration
   - Health check function
3. Criar `nanobot/db/postgres/migrations.py`:
   - Traduzir schema de SQLite para DDL PostgreSQL
   - Usar tsvector columns em vez de FTS5 virtual tables
   - GIN indexes para FTS e JSONB
   - Function + trigger para manter tsvector atualizado
4. Adicionar `create_postgres_factory()` em `db/factory.py`
5. Adicionar `asyncpg` como dependencia opcional: `pip install nanobot[postgres]`

### Fase 2: Repository Ports (~2 dias)

**Objetivo:** Portar os 11 repos, um a um.

Ordem de implementacao (por dependencia):

1. **UserRepository** — base de tudo, mais complexo (dynamic updates, increment)
2. **SessionRepository + MessageRepository** — usados junto
3. **MemoryRepository** — primeiro repo com FTS (valida estrategia tsvector)
4. **SkillRepository** — simples, validacao rapida
5. **CronRepository** — medio, dynamic SET clause
6. **ChannelBindingRepository** — simples
7. **AuditRepository** — datetime arithmetic
8. **RetrieverRepository** — FTS, similar ao MemoryRepository
9. **ClientRepository** — dynamic WHERE/ORDER
10. **ClientIdentityRepository** — simples
11. **ClientMemoryRepository** — FTS, similar ao MemoryRepository

**Para cada repo:**
- Copiar SQLite impl como base
- Substituir `aiosqlite` por `asyncpg`
- Substituir `?` placeholders por `$1, $2, ...` (asyncpg usa numerados)
- Substituir features SQLite-specific (ver mapeamento acima)
- Testar com pytest contra Postgres local

### Fase 3: Integracao (~1 dia)

**Objetivo:** Conectar tudo e garantir que ambos os modos funcionam.

1. Atualizar `cli/commands.py`:
   ```python
   if multiuser:
       if database_url and database_url.startswith("postgresql"):
           pool = await create_pool(database_url)
           repos = create_postgres_factory(pool)
       else:
           db_conn = await connect_sqlite(db_path)
           repos = create_sqlite_factory(db_conn)
   ```
2. Atualizar `web/server.py` health check para suportar ambos
3. Adicionar `--database-url` flag ao CLI
4. Docker Compose para dev com PostgreSQL
5. Testar fluxo completo: register → login → chat → memory → cron → channels

### Fase 4: Testes e Migracao (~1 dia)

1. Adaptar test fixtures para rodar contra ambos os backends
2. Script de migracao SQLite → PostgreSQL (para quem ja tem dados)
3. Documentar processo de setup do PostgreSQL

---

## 7. Detalhes por Repositorio

### UserRepository (162 LOC SQLite)

**Complexidade: Media**

Pontos de atencao:
- `increment_usage()` usa `CASE WHEN usage_reset_date < DATE('now')` — Postgres: `CASE WHEN usage_reset_date < CURRENT_DATE`
- Dynamic `SET` clause building (campos opcionais no update) — manter mesma logica
- JSON columns: `agent_config`, `bootstrap`, `limits`, `tools_enabled`, `channel_configs`
  - SQLite: `json.dumps()` + TEXT
  - Postgres: passar dict direto, asyncpg serializa para JSONB

### SessionRepository (118 LOC)

**Complexidade: Baixa**

- `ON CONFLICT(user_id, session_key) DO UPDATE` — identico no Postgres
- JSON: `metadata` column

### MessageRepository (106 LOC)

**Complexidade: Baixa**

- `executemany()` para batch insert — Postgres: `executemany()` do asyncpg ou `COPY`
- JSON: `tool_calls` column
- Ordenacao por `seq` (inteiro sequencial)

### MemoryRepository (98 LOC)

**Complexidade: Media (FTS)**

- `MATCH` query no FTS5 → `@@` com `to_tsquery()` no Postgres
- Fallback para LIKE no SQLite (catch `OperationalError`) → no Postgres, usar `ILIKE` como fallback se tsquery falhar
- Ver secao 8 para detalhes de FTS

### SkillRepository (73 LOC)

**Complexidade: Baixa**

- CRUD simples com ON CONFLICT upsert
- Boolean como INTEGER no SQLite → BOOLEAN nativo no Postgres

### CronRepository (136 LOC)

**Complexidade: Media**

- `NULLS LAST` — identico
- Dynamic SET clause (similar a UserRepository)
- `get_due_jobs()` compara `next_run_at_ms` com timestamp em milissegundos
  - Manter como BIGINT no Postgres (ms since epoch)

### ChannelBindingRepository (49 LOC)

**Complexidade: Baixa**

- CRUD com ON CONFLICT — direto

### AuditRepository (81 LOC)

**Complexidade: Media**

- `cleanup()` usa `datetime('now', '-{days} days')` → `NOW() - INTERVAL '{days} days'`
- Dynamic WHERE clause building
- JSON: `detail` column

### RetrieverRepository (67 LOC)

**Complexidade: Media (FTS)**

- FTS5 MATCH → tsvector @@
- `json_extract(metadata, '$.source')` → `metadata->>'source'`
- Mesma estrategia do MemoryRepository para FTS

### ClientRepository (137 LOC)

**Complexidade: Media**

- Dynamic WHERE + ORDER BY building
- `count_by_owner()` com filtros opcionais
- JSON: `metadata` column

### ClientIdentityRepository (66 LOC)

**Complexidade: Baixa**

- `reassign()` batch update — direto

### ClientMemoryRepository (109 LOC)

**Complexidade: Media (FTS)**

- Identico ao MemoryRepository mas scoped por `client_id`
- FTS5 → tsvector (mesma estrategia)

---

## 8. Full-Text Search

### SQLite (atual)

```sql
-- Virtual table
CREATE VIRTUAL TABLE memories_fts USING fts5(content, content=memories, content_rowid=id);

-- Triggers para manter sincronizado
CREATE TRIGGER memories_ai AFTER INSERT ON memories ...
CREATE TRIGGER memories_ad AFTER DELETE ON memories ...
CREATE TRIGGER memories_au AFTER UPDATE ON memories ...

-- Query
SELECT m.* FROM memories_fts f JOIN memories m ON m.id = f.rowid
WHERE f.content MATCH ? ORDER BY rank;
```

### PostgreSQL (a implementar)

```sql
-- Coluna tsvector na tabela principal
ALTER TABLE memories ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

-- GIN index
CREATE INDEX idx_memories_fts ON memories USING GIN (content_tsv);

-- Query
SELECT * FROM memories
WHERE user_id = $1 AND type = 'history'
  AND content_tsv @@ plainto_tsquery('simple', $2)
ORDER BY ts_rank(content_tsv, plainto_tsquery('simple', $2)) DESC;
```

**Vantagens do PostgreSQL FTS:**
- Sem tabelas virtuais separadas
- Sem triggers manuais (coluna GENERATED cuida disso)
- `plainto_tsquery` e mais tolerante que `to_tsquery` (sem necessidade de operadores booleanos)
- Config `'simple'` para matching exato de palavras (sem stemming — melhor para nomes e termos tecnicos)
- `'portuguese'` ou `'english'` pode ser usado se quiser stemming

**Fallback para ILIKE:**

```python
async def search_history(self, user_id: str, query: str, limit: int = 20):
    try:
        rows = await self._pool.fetch(
            "SELECT * FROM memories WHERE user_id=$1 AND type='history' "
            "AND content_tsv @@ plainto_tsquery('simple', $2) "
            "ORDER BY ts_rank(content_tsv, plainto_tsquery('simple', $2)) DESC LIMIT $3",
            user_id, query, limit,
        )
    except Exception:
        rows = await self._pool.fetch(
            "SELECT * FROM memories WHERE user_id=$1 AND type='history' "
            "AND content ILIKE $2 ORDER BY updated_at DESC LIMIT $3",
            user_id, f"%{query}%", limit,
        )
    return [dict(r) for r in rows]
```

---

## 9. Connection Management

### SQLite (atual)

```python
# Single connection, WAL mode
conn = await aiosqlite.connect(db_path)
await conn.execute("PRAGMA journal_mode=WAL")
await conn.execute("PRAGMA foreign_keys=ON")
await conn.execute("PRAGMA busy_timeout=5000")
```

- Adequado para single-user
- Write serialization via WAL
- Sem connection pooling (uma conexao compartilhada)

### PostgreSQL (a implementar)

```python
import asyncpg

async def create_pool(dsn: str) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(
        dsn,
        min_size=5,
        max_size=20,
        command_timeout=30,
    )
    # Register JSONB codec para serializar/deserializar automaticamente
    async with pool.acquire() as conn:
        await conn.set_type_codec(
            'jsonb',
            encoder=json.dumps,
            decoder=json.loads,
            schema='pg_catalog',
        )
    return pool
```

- Connection pooling automatico
- MVCC nativo (sem WAL manual)
- `min_size=5` garante conexoes pre-aquecidas
- `max_size=20` limita pressao no Postgres
- `command_timeout=30` evita queries travadas

---

## 10. Integracoes Necessarias

### CLI (commands.py)

```python
@app.command()
def gateway(
    multiuser: bool = False,
    database_url: str | None = None,  # NOVO
    host: str = "0.0.0.0",
    port: int = 8080,
):
    if multiuser:
        if database_url and database_url.startswith("postgresql"):
            pool = await create_pool(database_url)
            repos = await create_postgres_factory(pool)
        else:
            # Fallback para SQLite mesmo em multiuser (backwards compat)
            db_conn = await connect_sqlite(db_path)
            repos = create_sqlite_factory(db_conn)
    else:
        # Modo local: sempre SQLite
        ...
```

### Docker Compose (docker-compose.yml)

```yaml
services:
  nanobot:
    build: .
    environment:
      - DATABASE_URL=postgresql://nanobot:nanobot@postgres:5432/nanobot
    command: nanobot gateway --multiuser --database-url $DATABASE_URL
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nanobot
      POSTGRES_USER: nanobot
      POSTGRES_PASSWORD: nanobot
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nanobot"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

### pyproject.toml

```toml
[project.optional-dependencies]
postgres = ["asyncpg>=0.29"]
matrix = ["matrix-nio[e2e]>=0.24", "nh3>=0.2"]
all = ["nanobot[postgres,matrix]"]
```

---

## 11. Migracao de Dados

Para usuarios que ja tem dados em SQLite e querem migrar para PostgreSQL:

```bash
nanobot db migrate --from sqlite:///path/to/nanobot.db --to postgresql://user:pass@host/nanobot
```

**Estrategia:**
1. Conectar em ambos os bancos
2. Para cada tabela, ler todos os registros do SQLite
3. Batch insert no PostgreSQL (`COPY` ou `executemany`)
4. Reconstruir tsvector columns (auto via GENERATED)
5. Verificar contagens: `SELECT count(*) FROM <table>` em ambos
6. Report final com diferencas

**Tabelas a migrar (em ordem de dependencia):**
1. `_schema_version`
2. `users`
3. `sessions` → `messages`
4. `memories`
5. `skills`
6. `cron_jobs`
7. `channel_bindings`
8. `audit_log`
9. `rag_chunks`
10. `clients` → `client_identities` → `client_memories`

---

## 12. Checklist de Implementacao

### Fase 1: Foundation
- [ ] Criar `nanobot/db/postgres/__init__.py`
- [ ] Criar `nanobot/db/postgres/connection.py` (asyncpg pool + JSONB codec)
- [ ] Criar `nanobot/db/postgres/migrations.py` (DDL completo)
- [ ] Adicionar `create_postgres_factory()` em `db/factory.py`
- [ ] Adicionar `asyncpg` como dependencia opcional em `pyproject.toml`

### Fase 2: Repository Ports
- [ ] `PostgresUserRepository`
- [ ] `PostgresSessionRepository`
- [ ] `PostgresMessageRepository`
- [ ] `PostgresMemoryRepository` (com tsvector)
- [ ] `PostgresSkillRepository`
- [ ] `PostgresCronRepository`
- [ ] `PostgresChannelBindingRepository`
- [ ] `PostgresAuditRepository`
- [ ] `PostgresRetrieverRepository` (com tsvector)
- [ ] `PostgresClientRepository`
- [ ] `PostgresClientIdentityRepository`
- [ ] `PostgresClientMemoryRepository` (com tsvector)

### Fase 3: Integracao
- [ ] Atualizar `cli/commands.py` com `--database-url`
- [ ] Atualizar `web/server.py` health check
- [ ] Docker Compose com PostgreSQL
- [ ] Variavel de ambiente `DATABASE_URL` como alternativa ao flag

### Fase 4: Testes e Migracao
- [ ] Fixtures pytest para rodar contra PostgreSQL
- [ ] Testes de integracao end-to-end com Postgres
- [ ] Script de migracao SQLite → PostgreSQL
- [ ] Documentacao de setup PostgreSQL

### Fase 5: Otimizacoes (pos-lancamento)
- [ ] Tuning de connection pool (baseado em metricas reais)
- [ ] Indexes adicionais baseados em slow query log
- [ ] Particionamento de `messages` e `audit_log` por data (se volume justificar)
- [ ] Read replicas para queries pesadas (listagem de clients, search)
