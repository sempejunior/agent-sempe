# Jornada 05 — MCP servers per-user

## Endpoints envolvidos

- `GET /api/config/mcp` — `nanobot/web/server.py:700-704`
- `PUT /api/config/mcp` — `server.py:706-733`
- Config schema: `nanobot/config/schema.py:265-278` (`MCPServerConfig`)
- Tool para o agente registrar MCP: `nanobot/agent/tools/mcp_config.py`

## Passos executados

1. `GET /api/config/mcp` (Alice, sem config) — retorna `{"mcpServers": []}` — **array**.
2. `PUT /api/config/mcp` com stdio `echo_test` → 200 OK.
3. `GET /api/config/mcp` (Alice) — retorna `{"mcpServers": {"echo_test": {...}}}` — **objeto**. Ver [BUG-002](../bugs/BUG-002-mcp-shape-inconsistency.md).
4. `GET /api/config/mcp` (Bob) — retorna `{"mcpServers": []}` ✅ isolado.
5. `PUT /api/config/mcp` (Alice) com HTTP + `auth_type: bearer` + `auth_token: super_secret_xyz` → 200 OK.
6. `GET /api/config/mcp` — o token volta **em texto puro** (`super_secret_xyz`). Ver [BUG-001](../bugs/BUG-001-mcp-secret-leak.md).
7. `PUT` com `mcpServers: "invalid"` (string) → **500 Internal Server Error**. Ver [BUG-003](../bugs/BUG-003-mcp-invalid-payload-500.md).
8. `PUT` com `mcpServers: [{...}]` (array em vez de dict) → conexão dropada temporariamente (curl exit 52). Ver [BUG-007](../bugs/BUG-007-mcp-servers-shape-array-vs-dict.md).

## Resultado

🔴 **Três bugs abertos.** MCP é caminho crítico do produto (o diferencial "clientes plugam seus MCPs") — deve ser prioridade.

## Bugs abertos

- [BUG-001](../bugs/BUG-001-mcp-secret-leak.md) — P0 segurança
- [BUG-002](../bugs/BUG-002-mcp-shape-inconsistency.md) — P1
- [BUG-003](../bugs/BUG-003-mcp-invalid-payload-500.md) — P1
- [BUG-007](../bugs/BUG-007-mcp-servers-shape-array-vs-dict.md) — P2 (relacionado ao BUG-002)
