# BUG-006 — PUT /api/channels/{name} com {enabled: true} não persiste o flag

- **Status:** fixed (pending commit) — adotado opção (a)
- **Prioridade:** P1 (funcionalidade quebrada)
- **Área:** Channels API
- **Fix:** PUT agora ignora explicitamente o campo `enabled` (só persiste credenciais). `enabled` passa a ser controlado por `/start` (marca true no sucesso) e `/stop` (limpa). Também remove a precondição "só inicia se enabled=true" — start requer apenas os campos obrigatórios preenchidos. Testes: `test_put_ignores_enabled_flag`, `test_start_marks_enabled_on_success`, `test_stop_clears_enabled_flag`.

> Nota UX: `ChannelsPanel.tsx` continua enviando `enabled` no PUT (agora silenciosamente descartado). O fluxo do usuário (toggle → save → dialog de start) continua funcionando porque o dialog dispara `/start`. Toggle "off" no frontend não mais chama `/stop` automaticamente — user precisa clicar em "Parar". Tratar num PR separado de polish do front.

## Descrição

Ao chamar `PUT /api/channels/telegram?agent_id=X` com body `{"token":"...","enabled":true}`, a chamada devolve `200 OK`, mas o `GET` seguinte mostra `enabled: false`. Ou o handler está ignorando o campo, ou está resetando para `false` por algum motivo (fluxo típico: "só marca `enabled` como `true` depois que o `start` der certo").

Independente da intenção, o comportamento não é documentado nem consistente com o payload.

## Reprodução

```bash
API=http://localhost:18790
AID=agent_XYZ
curl -X PUT "$API/api/channels/telegram?agent_id=$AID" \
  -H "Authorization: Bearer qa_alice" -H "Content-Type: application/json" \
  -d '{"token":"111:INVALID_TOKEN_QA","enabled":true}'
# => 200 {"ok":true}

curl "$API/api/channels?agent_id=$AID" -H "Authorization: Bearer qa_alice" \
  | jq '.[] | select(.name=="telegram") | {enabled, running, config_complete}'
# => {"enabled": false, "running": false, "config_complete": true}
```

## Expected

Uma de duas coisas:

**(a)** Se `enabled` deve ser controlado só via `POST /start`/`/stop`:
- Documentar (`nanobot/channels/registry.py` fields).
- Ignorar explicitamente (`_ = payload.pop("enabled", None)`) e não aceitar no schema.

**(b)** Se `enabled` deve ser persistido:
- Corrigir o handler para gravar.

Recomendo (a) — segue o princípio de que canal está "enabled" quando `start` funcionou.

## Arquivos afetados

- `nanobot/web/server.py:1163-1205` — handler PUT `/api/channels/{name}`.
- Frontend `nanobot/web/frontend/src/components/ChannelsPanel.tsx` — verificar se manda `enabled: true` no save. Se sim, remover.

## Sugestão de fix

1. Decidir (a) ou (b). Recomendo (a).
2. Se (a): validar payload com schema que só aceita os campos de credencial (`token`, `proxy`, ...). Não mencionar `enabled`.
3. Se (b): persistir corretamente e refletir no GET.
4. Teste.
