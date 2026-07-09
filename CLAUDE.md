# CLAUDE.md — Sólides Agent Hub

## What this project is

**Sólides Agent Hub** is a fork of [nanobot](https://github.com/) turned into a **multiuser,
client-facing agent platform**. nanobot upstream is a single-user "keep it simple" agent engine;
this fork's mission is different and should guide every decision:

> **Let each client build and run their own AI agents** — configure prompts, enable skills,
> connect their own tools/integrations (MCP, APIs) — **on top of an integrated Sólides core**
> of ready-made HR/people-management agents (Profiler behavioral analysis, Ponto, Departamento
> Pessoal, Jurídico Trabalhista, R&S, PDI & desempenho, Clima) that clients can use as-is or
> extend.

Two audiences, always keep both in mind:

- **Creator/admin** (the client's builder): uses the web UI (Agent Studio, Skills, Integrations)
  to create agents from templates, write skills, activate integrations, wire channels.
- **End-user** (the client's people): talks to those agents through the web chat or channels
  (Telegram/WhatsApp/Discord/Slack), with per-user isolated memory and sessions.

The product runs in **database / multiuser mode** (`--multiuser`). Filesystem/single-user mode is
the legacy CLI path inherited from upstream — keep it working, but the product is multiuser.

Everything you build should move the platform toward: **clients self-serving agents, skills and
integrations, with the Sólides core available out of the box.**

- **Stack**: Python 3.11+ / FastAPI / aiosqlite / LiteLLM / React 19 / Tailwind CSS 4 / Zustand
- **Entry point**: `nanobot/cli/commands.py` → `gateway` command starts the server
- **Run dev**: `make dev` (Docker Compose, hot-reload for Python and frontend)
- **Run tests**: `pytest` (inside the container: `docker exec nanobot-gateway python -m pytest tests/ -q`)
- **Lint**: `ruff check .` (line limit 100, rules: E, F, I, N, W)
- **Docs**: `docs/architecture/` (decisions already made) · `docs/backlog/` (proposed work)

## Architecture

```
nanobot/
├── agent/          # Core loop, context builder, memory, skills, subagent, user_context
│   ├── tools/      # Tool implementations (filesystem, web, browser, cron, mcp, rag, report…)
│   └── retriever.py # RAG retriever (filesystem JSONL / DB FTS5 / HTTP backends)
├── bus/            # Pub/sub routing (InboundMessage → Agent → OutboundMessage)
├── channels/       # Chat platform adapters (Telegram, Discord, Slack, WhatsApp…)
├── client/         # Client-aware agent loop (multiuser message routing)
├── cli/            # Typer CLI commands
├── config/         # Pydantic schema and loader (server-wide config only)
├── cron/           # Scheduled task service
├── db/             # Repository protocols (repositories.py) + SQLite implementations
│   └── sqlite/     #   migrations.py, agent_repo, skill_repo, rag_repo, seed/ (templates)
├── heartbeat/      # Periodic proactive wake-up
├── integrations/   # Integration catalog (catalog.py) + MCP launcher (mcp_launcher.py)
├── prompts/        # Base prompt templates (SOUL.md, AGENTS.md, USER.md, RAG.md) — read-only
├── providers/      # LLM provider abstraction (LiteLLM, custom, OAuth)
├── session/        # Conversation state management
├── skills/         # Built-in skill definitions (markdown SKILL.md)
├── web/            # FastAPI server + React frontend
│   └── frontend/   # Vite + React + TypeScript
└── utils/          # Small helpers (paths, crypto, filenames)
docs/
├── architecture/   # Architecture decision records
└── backlog/        # Proposed work items (numbered); 01 = capability standardization
```

### Multiuser model (the heart of the fork)

- **users → agents (1:N)**: the `agents` table (migration v6) holds per-agent `agent_config`,
  `bootstrap`, `tools_enabled`, `channel_configs`, `metadata` as JSON. Sessions, messages,
  memories, rag_chunks, channel_bindings, cron_jobs are **agent-scoped**.
- **User-scoped (shared across a user's agents)**: `skills`, `credentials`, `user_integrations`.
- **Global catalog**: `agent_templates` / `agent_template_skills` / `agent_template_knowledge`,
  seeded from `db/sqlite/seed/agent_templates_solides.py` (the Sólides core templates).
- **Per-request assembly**: `agent/user_context.py` `build_user_context()` builds a `UserContext`
  (sessions, memory, RAG, `SkillsLoader`, `ToolRegistry`, provider) for one user+agent;
  `build_tool_registry()` instantiates only the tools the agent enabled. `AgentLoop._get_user_context`
  caches it and layers in per-user MCP tools (`_ensure_user_mcp`).
- **Chat delivery**: `web/server.py` `ws_chat` runs each turn as a background task so the socket
  keeps reading (no keepalive drop mid-turn); progress is sent as `tool_hint` chips, the assistant
  text is delivered **once, at the end** (never stream interim "kitchen" text to the user).

### Key design decisions

- **Protocol-based repositories** (`db/repositories.py`): storage behind Protocols. SQLite today;
  swapping backends means new implementations, no interface changes.
- **Registry pattern**: providers (`providers/registry.py`), tools (`agent/tools/registry.py`),
  channels (`channels/registry.py`) use declarative registries, not if-elif chains.
- **Event bus**: channels publish inbound → agent loop processes → publishes outbound → channels
  deliver. The agent loop never knows about specific channels.
- **Per-user prompts**: base prompts in `prompts/` (read-only code) + workspace + per-user/per-agent
  extension (`agents.bootstrap`). `ContextBuilder` combines them.
- **Integrations & MCP**: `integrations/catalog.py` declares available integrations (API or MCP);
  clients activate them (`user_integrations` + encrypted `credentials`); `mcp_launcher.py` turns
  enabled MCP integrations into live `mcp_<slug>_*` tools. This is how a client extends an agent
  **without writing code** — the intended self-service path.
- **Sólides core capabilities**: `azure_devops_report` (delivery analytics), `publish_report`
  (structured rich report pages) and `publish_page` (free HTML) tools, plus the Sólides templates
  and their skills (`montar-pdi`, `analise-desempenho`, `pdi_por_perfil`, …).
- **Dual-mode (legacy)**: SkillsLoader/ContextBuilder/etc. still support filesystem mode for the CLI.
  Don't expand it; multiuser/DB is the product.

### Dependency flow (no cycles allowed)

```
config ← cli → agent → providers
                 ↓         ↑
               bus ← channels
                 ↓
    session, memory, cron, db, integrations
                 ↓
               web (server consumes all above)
```

## Capability model — the standard for anything new

The platform's capabilities (tools, skills, templates, integrations) currently live in too many
places and drift. The **target standard** (see `docs/backlog/05-padronizacao-capacidades.md`) is:

> **Reference, don't copy. One home per capability.**

| Capability | Single home (source of truth) | Referenced by |
|---|---|---|
| **Tool** | Python `Tool` subclass + backend catalog entry | `id` string |
| **Skill** | Builtin: `nanobot/skills/*/SKILL.md` (git) · User: DB `skills` | `name` in `skills_enabled` |
| **Template** | Seed `agent_templates_solides.py` | `template_id` |
| **Integration/MCP** | `integrations/catalog.py` + `user_integrations` | `slug` / `system_integration_id` |

Golden rule: **a created agent is an independent instance of the user.** Changing a template or
skill affects **new** agents only; existing agents are the user's to edit. Never write migrations
that mutate already-created agents retroactively.

This standard is **not fully implemented yet** — parts of the codebase still copy content across
layers and duplicate tool ids in the frontend. Describe reality accurately when you work, and when
you touch one of those areas, **move it toward this standard** (see refactor-on-touch below).

## Standards for anything new (the "entrega 1" bar)

Everything born from now on must be correct by default:

- **Comments**: no inline comments. Only documentation comments — module/class/function docstrings
  where intent isn't obvious from the name. If you feel the need for an inline comment, the code
  needs a clearer name or a smaller function instead.
- **Patterns over ad-hoc**: follow the established patterns (Protocol repositories, registries,
  `Tool` base, `BaseChannel`, `ProviderSpec`). Add a registry/catalog entry — don't grow if-elif
  chains or duplicate a list the backend could generate.
- **Single source of truth**: never hardcode the same id/name in multiple files that must be kept
  in sync manually. If you find yourself doing it, that's a signal to introduce (or use) a catalog.
- **Refactor on touch**: when you pass through a file that is off-standard or poorly written
  (inline comments, duplicated literals, dead code, a 400+ line grab-bag, business logic in the web
  layer), **improve it** — always preserving behavior and test coverage. Leave every file better
  than you found it, but keep changes scoped and verifiable (run the tests).
- **No dead code, no back-compat shims, no emojis in code/comments.**
- **Errors**: let exceptions propagate; catch only when you can handle meaningfully. User-facing
  layers (web/channels) translate errors to friendly messages — never leak a traceback to a client.

## Coding principles

### Keep it simple
- Prefer flat code over nested abstractions. Three similar lines > premature abstraction.
- Don't add features or "improvements" beyond what was asked (refactor-on-touch is about quality of
  code you're already changing, not scope creep).
- Don't design for hypothetical future requirements.

### Single responsibility
- Each module has one job (see Architecture). No agent logic in `web/`, no DB queries in `agent/`.
- One class per tool (`Tool` base); one file per channel (`BaseChannel`).
- If a file grows past ~400 lines, consider splitting.

### Loose coupling
- Depend on protocols, not implementations. Import from `db/repositories.py`, not SQLite classes.
- `TYPE_CHECKING` blocks for forward refs / breaking cycles; lazy imports for optional deps.
- Pass dependencies through constructors; don't import globals.

### Separation of concerns
- **Config** defines shapes, no logic. **Repositories** persist, no business rules.
- **Agent loop** orchestrates LLM ↔ tools, no HTTP/WS. **Web server** translates HTTP/WS to service
  calls, no business logic. **Channels** translate platform protocols to bus messages.

## Code style

### Python
- Docstrings only, no inline comments. Type hints everywhere; prefer `X | None` over `Optional[X]`.
- `from __future__ import annotations` in files with forward references.
- Naming: `PascalCase` classes, `snake_case` functions/vars, `UPPER_SNAKE_CASE` constants,
  `_leading_underscore` private. Imports: stdlib → third-party → local (isort via ruff).
- Async by default for I/O; sync only for pure computation.

### TypeScript (frontend)
- Functional components with hooks (no class components except ErrorBoundary).
- Zustand for global state; `useState` for component-local state.
- Tailwind utilities directly on elements (no CSS modules / styled-components).
- API layer in `lib/api.ts` — components never call `fetch` directly.
- Toast for user-facing errors. Never swallow errors silently.

## Testing
- Tests in `tests/` mirroring source structure; `pytest` + `pytest-asyncio` (auto mode).
- Mock external deps (LLM providers, network) with `AsyncMock`.
- Test behavior, not implementation. Name `test_<what_it_does>`.

## Dev environment gotchas
- `make dev` runs Docker Compose. The gateway uses **watchmedo** to hot-reload on `*.py` changes —
  **every Python save restarts the gateway and drops open WebSocket sessions.** Batch Python edits
  and warn before applying during a live demo. Markdown/TSX changes don't restart the gateway
  (frontend has its own HMR).
- Changes to `docker-compose*.yml` require `docker compose ... up -d --force-recreate`, not just
  `restart`.
- Run tests/lint inside the container (`docker exec nanobot-gateway …`); the host has no venv.

## Common tasks

> These describe the **current** wiring. Where the capability model above differs, prefer moving
> toward it when you touch the code.

### Adding a tool
1. Create `nanobot/agent/tools/my_tool.py` with a class inheriting `Tool` (`name`, `description`,
   `parameters` JSON Schema, `execute()`).
2. Register in `agent/user_context.py` `build_tool_registry()` (DB/multiuser) and, if relevant to
   the CLI, `agent/loop.py` `_register_default_tools()` (filesystem mode).
3. Expose it in the frontend tool catalogs (`web/frontend/src/lib/tools.ts` and the Agent Studio
   tool list). Target state (backlog 01): a single backend catalog the frontend consumes — if you're
   already there, add one catalog entry instead of editing multiple lists.

### Adding a skill
- **Sólides/builtin skill**: create `nanobot/skills/<name>/SKILL.md` (YAML frontmatter: `name`,
  `description`, optional `metadata.nanobot` with `emoji`/`requires`/`always`). Reference it by name
  from a template's recommended skills. It's delivered to the model as a summary and loaded on
  demand via `read_skill`.
- **User skill**: created at runtime via the `save_skill` tool or the Skills UI → DB `skills` table.

### Adding an LLM provider
1. Add a `ProviderSpec` to `PROVIDERS` in `providers/registry.py`.
2. Add the field in `config/schema.py` `ProvidersConfig`.
3. Only create a new `LLMProvider` subclass if it needs special handling.

### Adding a channel
1. `nanobot/channels/my_channel.py` inheriting `BaseChannel` (accept `**kwargs`, pass to `super()`).
2. Config class in `config/schema.py` `ChannelsConfig`.
3. Register in `channels/manager.py` `CHANNEL_MAP`.
4. UI metadata in `channels/registry.py` `CHANNEL_META` / `CHANNEL_ORDER`.

### Adding an integration (client self-service capability)
1. Add an `IntegrationEntry` (API or MCP) to `CATALOG` in `integrations/catalog.py` with its
   `credential_fields` and auth/MCP spec.
2. Clients activate it in the Integrations UI → `user_integrations` + encrypted `credentials`.
3. MCP integrations become `mcp_<slug>_*` tools via `mcp_launcher.py` on next context build.

### Adding an agent template (Sólides core)
- Edit `db/sqlite/seed/agent_templates_solides.py` (`id`, `name`, `system_prompt`, `guardrails`,
  `tools`, `skills`, `knowledge`, …) and add it to `SOLIDES_TEMPLATES`.
- The DB is currently source-of-truth after first seed, so propagating a change to an existing DB
  needs a fixup in `migrations.py`. Target state (backlog 01): idempotent re-sync from seed — avoid
  writing new agent-mutating migrations.

### Frontend changes
- Components in `web/frontend/src/components/`; API in `lib/api.ts`; global state in `lib/store.ts`.
- Build: `npm run build` in the frontend dir (output to `frontend/static/`). Dev: Vite HMR.
- Key surfaces: Agent Studio (create/configure agents), Skills catalog, Integrations, Chat.

### RAG
- Core `agent/retriever.py`; tools `agent/tools/rag.py`; DB `db/sqlite/rag_repo.py` (FTS5).
- Per-user config in `agents.agent_config.rag`; API `GET/PUT /api/config/rag` (masks keys).
