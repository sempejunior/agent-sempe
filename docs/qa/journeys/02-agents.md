# Jornada 02 — CRUD de agentes com isolamento multiusuário

## Endpoints envolvidos

- `GET /api/agents` — `nanobot/web/server.py:348-353`
- `POST /api/agents` — `nanobot/web/server.py:361-391`
- `GET /api/agents/{agent_id}` — `server.py:407-410`
- `PATCH /api/agents/{agent_id}` — `server.py:412-436`
- `DELETE /api/agents/{agent_id}` — `server.py:454-459`
- `POST /api/agents/{agent_id}/duplicate` — `server.py:393-400`
- `GET /api/agents/templates` — `server.py:355-359`

## Passos executados

1. `GET /api/agents` como `qa_alice` — retorna 1 agente `qa_alice:default` (criado automaticamente na primeira leitura via `_ensure_default_agent`).
2. `GET /api/agents` como `qa_bob` — retorna apenas `qa_bob:default`. Zero vazamento cross-user.
3. `POST /api/agents` (Alice) com payload custom — cria `agent_840400579492`.
4. `GET /api/agents/agent_840400579492` como Bob → **404 Agent not found** ✅.
5. `PATCH .../agent_840400579492` como Bob → **404** ✅.
6. `DELETE .../agent_840400579492` como Bob → **404** ✅.
7. `PATCH` como Alice → OK, `description` atualizada.
8. `POST /api/agents/agent_840400579492/duplicate` como Alice → cria `agent_cdc6fb9209f7`.
9. `GET /api/agents/templates` → retorna templates `blank`, `sales_b2b`, `support_n1`, `rh_triage`, ...

## Resultado

✅ **CRUD completo funciona, isolamento por `user_id` é respeitado.**

## Observações

- O `is_default: 1` é armazenado como int mas retorna como `true/false` (bool) — OK.
- `agent_config` é merged em PATCH (`_merge_agent_config`) — bom comportamento para não perder campos.
- Templates hardcoded em `server.py` — se um cliente Sólides quiser novo template, hoje é PR no código. Considerar mover para DB.

## Nenhum bug crítico. Sugestão de melhoria não bloqueante: mover templates para DB/config.
