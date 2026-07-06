# BUG-007 — PUT /api/config/mcp aceita mcpServers como array sem validação

- **Status:** fixed (pending commit)
- **Prioridade:** P2 (relacionado ao BUG-002 e BUG-003)
- **Área:** MCP config API
- **Fix:** shape canônico é list; dict/string/qualquer outro tipo retorna 422 sem tocar em runtime. Ver BUG-002 e BUG-003.

## Descrição

O handler aceita silenciosamente `mcpServers` tanto como `dict` quanto como `array`. Enviar como array (`[{"name":"x","url":"..."}]`) causou instabilidade no servidor durante o QA — a conexão foi dropada (curl exit 52).

## Reprodução

```bash
curl -sv -X PUT http://localhost:18790/api/config/mcp \
  -H "Authorization: Bearer qa_alice" -H "Content-Type: application/json" \
  -d '{"mcpServers":[{"name":"x","url":"http://x"}]}'
# => curl: (52) Empty reply from server
```

Depois disso o `GET` seguinte pode falhar até o watchdog reiniciar o processo.

## Expected

422 rejeitando o array com mensagem clara.

## Fix conjunto com BUG-002 e BUG-003

- Definir `MCPConfigUpdate` Pydantic model com `mcpServers: dict[str, MCPServerConfig]`.
- FastAPI valida → responde 422 com detalhe.
- Não abre exceção em runtime.

## Arquivos afetados

- `nanobot/web/server.py:706-733`

## Investigar também

- Se o crash veio do processo mesmo (`watchdog` reiniciar → downtime) ou apenas do request. Rodar `docker logs nanobot-gateway --since 5m` na hora do repro e capturar traceback.
