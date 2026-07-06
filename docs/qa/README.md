# QA — Relatório de Testes E2E Multiusuário

Este diretório contém os achados dos testes end-to-end executados sobre o nanobot em modo `--multiuser` no contexto do **Sólides Agent Hub** (branch `solides-agent-hub`).

## Objetivo

Validar as jornadas críticas de um cliente que:

1. Cria um usuário e faz login.
2. Cria/edita agentes com prompt, modelo, tools e canais.
3. Habilita tools built-in no agente e as vê funcionando.
4. Cria skills customizadas (via API PUT direto **e** via conversa com o agente).
5. Configura servidores MCP e o agente descobre as tools.
6. Conecta canais (Telegram, WhatsApp, etc.) por usuário.
7. Conversa com o agente via WebSocket (`/ws/chat`) e vê isolamento entre usuários.

## Como este relatório está organizado

```
docs/qa/
├── README.md                    <- este arquivo (índice + resumo)
├── environment.md               <- como o QA foi executado (setup, portas, comandos)
├── journeys/                    <- roteiro passo-a-passo de cada jornada testada
│   ├── 01-auth.md
│   ├── 02-agents.md
│   ├── 03-tools.md
│   ├── 04-skills.md
│   ├── 05-mcp.md
│   ├── 06-channels.md
│   └── 07-chat-ws.md
├── bugs/                        <- um arquivo por bug com repro + arquivos afetados
│   ├── BUG-001-mcp-secret-leak.md
│   ├── BUG-002-mcp-shape-inconsistency.md
│   ├── BUG-003-mcp-invalid-payload-500.md
│   ├── BUG-004-channel-invalid-token-500.md
│   ├── BUG-005-ws-agent-not-found-shape.md
│   ├── BUG-006-channel-put-enabled-ignored.md
│   └── BUG-007-mcp-servers-shape-array-vs-dict.md
└── evidence/                    <- respostas cruas relevantes (curl outputs)
```

## Resultado sumarizado

| Jornada | Status | Comentário |
|---|---|---|
| Auth (register/login/me) | ✅ OK | Isolamento de token e erros consistentes |
| Agents (CRUD + duplicate) | ✅ OK | Isolamento por `user_id` funciona (404 quando outro usuário tenta) |
| Tools enable/disable no agente | ✅ OK | PUT `/api/skills` persiste `tools_enabled` corretamente |
| Skills customizadas (PUT) | ⚠️ Parcial | Funciona, mas UNIQUE(user_id,name) permite colisão de nome entre usuários — comportamento correto, apenas documentar |
| Skills via conversa (`save_skill`) | ✅ OK | Agente cria skill e persiste em `skills_v7` |
| MCP config | 🔴 3 bugs | Secret vazando, shape inconsistente, 500 em payload inválido |
| Channels (config/start/stop) | 🔴 2 bugs | 500 em token inválido, campo `enabled` do PUT ignorado |
| WebSocket chat | ⚠️ 1 bug | "Agent not found" retornado como `type:response` (deveria ser `type:error`) |
| Isolamento multiuser | ✅ OK | Bob não consegue ler/editar/deletar agentes de Alice; skills, sessões e MCPs isolados |

## Bugs — Priorização sugerida para o agente que for corrigir

### P0 (segurança / dados)
- **[BUG-001](bugs/BUG-001-mcp-secret-leak.md)** — Secret bearer/api_key de MCP volta em texto puro no GET `/api/config/mcp`. CLAUDE.md dizia "masks API keys" — não mascara.

### P1 (funcionalidade quebrada / DX ruim)
- **[BUG-002](bugs/BUG-002-mcp-shape-inconsistency.md)** — GET `/api/config/mcp` sem config retorna `mcpServers: []` (array); depois de PUT retorna `mcpServers: {}` (objeto). Frontend tem que lidar com dois tipos.
- **[BUG-003](bugs/BUG-003-mcp-invalid-payload-500.md)** — PUT com `mcpServers: "invalid"` (string) devolve 500 com traceback interno em vez de 422 tratado por Pydantic.
- **[BUG-004](bugs/BUG-004-channel-invalid-token-500.md)** — `POST /api/channels/telegram/start` com token inválido retorna 500 com detalhe cru da lib do Telegram — deveria ser 4xx e a mensagem tratada.
- **[BUG-006](bugs/BUG-006-channel-put-enabled-ignored.md)** — `PUT /api/channels/{name}` com `{ "enabled": true }` não persiste o flag (GET seguinte mostra `enabled: false`).

### P2 (higienização)
- **[BUG-005](bugs/BUG-005-ws-agent-not-found-shape.md)** — Erros do agente loop (ex: "Agent not found for user") saem no WS como `type:response` em vez de `type:error`. Frontend não consegue diferenciar erro de resposta.
- **[BUG-007](bugs/BUG-007-mcp-servers-shape-array-vs-dict.md)** — Servidor aceita `mcpServers` como array **ou** dict silenciosamente; deveria ter uma forma canônica. Faz parte do BUG-002.

## O que **não** foi testado (fora do escopo desta rodada)

- Envio real de mensagem via Telegram/WhatsApp/Discord (exige credencial válida). Testado apenas fluxo de config/start/stop e erro tratado.
- RAG ingest + search com backend externo (Pinecone/Qdrant). Testar em rodada seguinte.
- Cron jobs (`/api/cron`). Testar em rodada seguinte.
- Client identity (`resolve_client`) com mesmo sender em múltiplos canais. Requer mock de canal.
- Concorrência (2 WS simultâneos com o mesmo usuário) — testado 1 WS por vez.
- Frontend (UI/UX) — o QA rodou 100% via API. Sugestão: rodada dedicada com Playwright.

## Como reproduzir o QA

Ver [`environment.md`](environment.md) e o roteiro de cada jornada em `journeys/`.

## Notas para o agente corretor

- Trate cada bug em `bugs/BUG-XXX-*.md` como um issue separado. Cada arquivo tem: **descrição, repro, expected vs actual, arquivos afetados, sugestão de fix, prioridade**.
- Antes de corrigir, leia `docs/architecture/` para não violar decisões de design (protocol-based repos, dual-mode filesystem/db, etc.).
- Rode `pytest` após cada bug corrigido. A regressão dos bugs P0/P1 precisa vir com teste.
- Não altere contratos de API sem atualizar `nanobot/web/frontend/src/lib/api.ts`.
