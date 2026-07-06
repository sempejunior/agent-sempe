# Jornada 06 — Canais per-user (Telegram usado como caso de teste)

## Endpoints envolvidos

- `GET /api/channels?agent_id=...` — `nanobot/web/server.py:1108-1161`
- `PUT /api/channels/{name}?agent_id=...` — `server.py:1163-1205`
- `POST /api/channels/{name}/start?agent_id=...` — `server.py:1207-1270`
- `POST /api/channels/{name}/stop?agent_id=...` — `server.py:1272-1286`
- ChannelManager per-user — `nanobot/channels/manager.py`
- Registry (metadata) — `nanobot/channels/registry.py`

## Passos executados

1. `GET /api/channels?agent_id=agent_840400579492` (Alice) — retorna 9 canais (telegram, discord, slack, whatsapp, email, dingtalk, feishu, qq, mochat), todos `enabled: false, running: false`.
2. `PUT /api/channels/telegram?agent_id=agent_840400579492` com `{"token":"111:INVALID_TOKEN_QA","enabled":true}` → 200 OK.
3. `GET` de volta — token mascarado corretamente (`********N_QA`), MAS `enabled: false`. Ver [BUG-006](../bugs/BUG-006-channel-put-enabled-ignored.md).
4. `POST /api/channels/telegram/start?agent_id=agent_840400579492` → **500** com detalhe cru da lib do Telegram: _"The token `111:INVALID_TOKEN_QA` was rejected by the server."_ Ver [BUG-004](../bugs/BUG-004-channel-invalid-token-500.md).
5. `POST /api/channels/telegram/stop` → 200 OK, mensagem `"telegram stopped"`.
6. `POST /api/channels/telegram/start?agent_id=agent_840400579492` como Bob → 404 `Agent not found` ✅ isolamento.

## Resultado

⚠️ **Fluxo funciona no caminho feliz, mas erros de credencial e o flag `enabled` são bugs bloqueadores para UX de cliente.**

## Bugs abertos

- [BUG-004](../bugs/BUG-004-channel-invalid-token-500.md) — P1
- [BUG-006](../bugs/BUG-006-channel-put-enabled-ignored.md) — P1

## Coisas que não deu para testar

- Envio real de mensagem (precisa de token válido do BotFather).
- Isolamento com o **mesmo** canal + mesmo agent mas usuários diferentes tentando bindar (channel binding).
