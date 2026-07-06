# BUG-003 — PUT /api/config/mcp com payload inválido retorna 500 em vez de 422

- **Status:** fixed (pending commit)
- **Prioridade:** P1 (higienização + potencial vazamento de stacktrace)
- **Área:** MCP config API
- **Fix:** handler valida shape antes de processar (`mcpServers` precisa ser list; cada item precisa ser objeto com `name`) e devolve 422 com mensagem clara. `MCPServerConfig.model_validate` chamado por entrada — erro vira 422 estruturado, sem traceback. Testes: `test_put_string_payload_returns_422`, `test_put_dict_payload_returns_422`, `test_put_missing_name_returns_422`, `test_put_duplicate_name_returns_422`.

## Descrição

Payloads inválidos (ex.: `mcpServers` como string em vez de dict) devolvem `500 Internal server error` — ou seja, o handler não validou entrada antes de manipular. Deveria ser 422 (Pydantic) com uma mensagem clara.

## Reprodução

```bash
curl -s -X PUT http://localhost:18790/api/config/mcp \
  -H "Authorization: Bearer qa_alice" -H "Content-Type: application/json" \
  -d '{"mcpServers":"invalid"}'
# => {"detail":"Internal server error"}  HTTP 500
```

## Expected

```
HTTP 422
{"detail":[{"loc":["body","mcpServers"],"msg":"...","type":"..."}]}
```

## Arquivos afetados

- `nanobot/web/server.py:706-733` — o handler do PUT `/api/config/mcp` provavelmente aceita `dict` genérico e faz `.items()` sem checar tipo. Trocar por Pydantic model:

```python
class MCPConfigUpdate(BaseModel):
    mcpServers: dict[str, MCPServerConfig] = Field(default_factory=dict)

@app.put("/api/config/mcp")
async def update_mcp(payload: MCPConfigUpdate, user: User = Depends(_require_user)):
    ...
```

## Sugestão de fix

1. Criar `MCPConfigUpdate` no schema (ou onde os DTOs vivem).
2. FastAPI valida automaticamente e devolve 422.
3. Teste `test_mcp_invalid_payload_returns_422`.

## Relacionado

- [BUG-007](BUG-007-mcp-servers-shape-array-vs-dict.md) — o mesmo handler também não trata `mcpServers` como array de forma consistente.
