# Ambiente de QA

## Setup usado nesta rodada

- Branch: `solides-agent-hub`
- Data: 2026-07-06
- Modo: `nanobot gateway --multiuser` (dentro do container `nanobot-gateway` via `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`)
- Watchdog rodando (`watchmedo auto-restart --pattern=*.py -- nanobot gateway --multiuser`) — código Python é hot-reload
- API base: `http://localhost:18790`
- WebSocket: `ws://localhost:18790/ws/chat?token=<user_id>`
- Frontend (Vite): `http://localhost:5173`
- noVNC (para browser tool): `http://localhost:7080/vnc.html`
- DB SQLite dentro do container: `/root/.nanobot/nanobot.db`
- MCP servers ativos por padrão: `puppeteer` (7 tools)

## Usuários de teste criados

Todos autenticam com Bearer token = `user_id` (esquema atual do server).

| user_id | display_name | uso |
|---|---|---|
| `qa_alice` | QA Alice | Usuário principal, cria agentes/skills/canais |
| `qa_bob` | QA Bob | Usuário de controle, valida isolamento |

Comandos:

```bash
curl -X POST http://localhost:18790/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"qa_alice","display_name":"QA Alice","email":"alice@qa.test"}'

curl -X POST http://localhost:18790/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"qa_bob","display_name":"QA Bob","email":"bob@qa.test"}'
```

## Agentes criados durante o QA

- `qa_alice:default` — criado automaticamente no primeiro `GET /api/agents` (compat_default). Nome "Paulo", role "Especialista em DP".
- `agent_840400579492` — criado via POST, nome "Vendedor Teste".
- `agent_cdc6fb9209f7` — duplicata do anterior.
- `qa_bob:default` — default do Bob (compat_default).

## Como limpar o estado para rerodar

```bash
# Apagar usuários de QA (cascata em skills, agents, sessions, memory)
docker exec nanobot-gateway sqlite3 /root/.nanobot/nanobot.db \
  "DELETE FROM users WHERE user_id LIKE 'qa_%';"
```

## Ferramentas usadas nos testes

- `curl` para todo REST
- Script Python + `websockets` para o chat WS
- `docker logs nanobot-gateway` para inspecionar tracebacks
- `sqlite3` dentro do container para inspecionar tabelas

## Coisas que precisam estar rodando

- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
- Espere `docker logs nanobot-gateway | grep 'Agent loop started'` aparecer

## Coisas que **não** foram configuradas

- Nenhuma provider API key real. Modelo default `openai/gpt-5-mini` está respondendo, sinalizando que há key configurada no ambiente do container. Trocar quando necessário via `PUT /api/config`.
- Nenhum canal foi realmente conectado (sem token válido).
- Nenhum RAG backend externo (Pinecone etc.) configurado.
