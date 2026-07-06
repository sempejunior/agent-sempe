# BUG-002 — GET /api/config/mcp devolve shape diferente conforme haja config ou não

- **Status:** fixed (pending commit)
- **Prioridade:** P1 (contrato quebrado, frontend precisa fazer if/else)
- **Área:** MCP config API
- **Detectado em:** `GET /api/config/mcp` antes e depois do primeiro PUT
- **Fix:** canônico é **list** (`[{name, ...cfg}]`) — bate com o contrato do frontend em `lib/api.ts` (`MCPServer[]`). `_normalize_mcp_servers` converte legado dict → list. PUT rejeita qualquer outro shape com 422. Testes: `tests/test_mcp_config_endpoint.py::test_get_returns_list_when_empty` e `test_get_normalizes_legacy_dict_storage`.

> Nota: o doc recomendou dict, mas o frontend atual (`McpPage`, `CapabilitiesPage`) já opera com list. Fixar em list evita churn desnecessário; a normalização acomoda registros legados salvos como dict.

## Descrição

Sem nenhuma config salva, o GET devolve `mcpServers` como **array vazio** `[]`. Depois de um PUT bem-sucedido, o GET devolve `mcpServers` como **objeto** `{name: config}`. Isso força o frontend a testar `Array.isArray(mcpServers)` em toda tela que lê MCP.

## Reprodução

```bash
API=http://localhost:18790
TOKEN="qa_alice"

# usuário novo
curl -s $API/api/config/mcp -H "Authorization: Bearer $TOKEN"
# => {"mcpServers":[]}

curl -s -X PUT $API/api/config/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mcpServers":{"echo_test":{"command":"echo","args":["hi"],"env":{}}}}'

curl -s $API/api/config/mcp -H "Authorization: Bearer $TOKEN"
# => {"mcpServers":{"echo_test":{...}}}
```

## Expected

Um único formato, sempre. Recomendo objeto (`dict[name, config]`) para bater com o schema Pydantic `MCPServerConfig` em `config/schema.py` e com o formato padrão MCP (`.mcp.json`).

**Expected sempre:**
```json
{"mcpServers": {}}   // vazio
{"mcpServers": {"echo_test": {...}}}
```

## Arquivos afetados

- `nanobot/web/server.py:700-704` — GET provavelmente lê `user.agent_config.get("mcp_servers", [])` (default `[]`). Trocar para `{}` **e** garantir tipo dict no retorno.
- `nanobot/db/sqlite/user_repo.py` — verificar o schema default do campo `agent_config.mcp_servers`.
- Confirmar que `nanobot/agent/tools/mcp.py:connect_mcp_servers` já espera dict.

## Sugestão de fix

1. Definir o default do campo em `agent_config` como `{}` (dict) e migrar registros existentes.
2. No GET, forçar `mcp_servers = dict(mcp_servers or {})`.
3. Adicionar teste `test_mcp_default_shape_is_dict`.

## Relacionado

- [BUG-007](BUG-007-mcp-servers-shape-array-vs-dict.md) — o PUT aceita array **e** dict, silenciosamente. Fix conjunto.
