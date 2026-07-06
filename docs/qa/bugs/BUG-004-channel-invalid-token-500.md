# BUG-004 — Start de canal com token inválido devolve 500 com mensagem crua da lib

- **Status:** fixed (pending commit)
- **Prioridade:** P1 (UX ruim + expõe interno)
- **Área:** Channels API
- **Fix:** `_classify_channel_error` classifica exceções por tipo/mensagem (`InvalidToken`, `Unauthorized`, `401`, timeout, etc.) e monta payload estruturado `{error, channel, message, detail_code}` **sem incluir a credencial**. Auth error → 400; network → 503; genérico → 400. Testes: `test_start_invalid_token_returns_400`.

## Descrição

Ao chamar `POST /api/channels/telegram/start` com um token que a API do Telegram rejeita, o servidor devolve `500 Internal server error` com o texto direto da lib `python-telegram-bot`:

```json
{"detail":"Failed to start telegram: The token `111:INVALID_TOKEN_QA` was rejected by the server."}
```

Problemas:
1. O código deveria ser 4xx (é erro de dado do usuário, não do servidor).
2. **O token inválido está sendo espelhado na mensagem** — se o cliente colar um token vazando no log central, ele vira ruído em qualquer aggregator (Sentry, Datadog).
3. Sem estruturação, o frontend só consegue mostrar a string crua — sem chance de i18n / handling específico.

## Reprodução

```bash
API=http://localhost:18790
AID=agent_XYZ   # qualquer agente do Alice
curl -X PUT "$API/api/channels/telegram?agent_id=$AID" \
  -H "Authorization: Bearer qa_alice" -H "Content-Type: application/json" \
  -d '{"token":"111:INVALID_TOKEN_QA","enabled":true}'
curl -X POST "$API/api/channels/telegram/start?agent_id=$AID" \
  -H "Authorization: Bearer qa_alice"
# => 500 {"detail":"Failed to start telegram: The token ... was rejected"}
```

## Expected

```
HTTP 400 (ou 422)
{
  "error": "invalid_credential",
  "channel": "telegram",
  "message": "Telegram rejeitou o token. Verifique se copiou o token completo do @BotFather.",
  "detail_code": "AUTH_INVALID_TOKEN"
}
```

Sem espelhar o token no payload.

## Arquivos afetados

- `nanobot/web/server.py:1207-1270` — handler `start_channel`. Provavelmente hoje faz `try: await start_user_channel(...); except Exception as e: raise HTTPException(500, f"Failed to start {name}: {e}")`.
- `nanobot/channels/manager.py:135-178` — `start_user_channel` deve levantar exceções tipadas (`ChannelAuthError`, `ChannelConnectionError`, ...).
- `nanobot/channels/telegram.py` — capturar `telegram.error.InvalidToken` / `Unauthorized` e reempacotar.

## Sugestão de fix

1. Criar hierarquia `ChannelError` → `ChannelAuthError`, `ChannelNetworkError`, `ChannelConfigError`.
2. Mapear no handler para 400/401/503 apropriado.
3. Nunca incluir credencial na mensagem — apenas o `channel` e o motivo.
4. Fazer mesmo para os outros canais (Discord, Slack, WhatsApp, ...).

## Relacionado

- [BUG-006](BUG-006-channel-put-enabled-ignored.md) — durante o mesmo fluxo, `enabled: true` não é persistido.
