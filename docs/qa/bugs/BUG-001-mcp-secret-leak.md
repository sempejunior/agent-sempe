# BUG-001 — Secret de MCP (bearer/api_key) volta em texto puro no GET

- **Status:** fixed (pending commit)
- **Prioridade:** P0 (segurança / vazamento de credencial)
- **Área:** MCP config API
- **Detectado em:** `GET /api/config/mcp` após `PUT` com `auth_token`
- **Fix:** `_mask_mcp_servers` mascara `auth_token`/`auth_password` no GET; PUT preserva valor original quando o cliente reenvia string mascarada. Testes: `tests/test_mcp_config_endpoint.py`.

## Descrição

O README do QA + CLAUDE.md dizem que o endpoint `PUT /api/config/mcp` "masks API keys" no retorno. Na prática, `auth_token` (bearer), `auth_password` (basic) e `auth_api_key` estão sendo devolvidos em **texto puro** no `GET` seguinte. Qualquer usuário com token válido consegue vazar segredos que salvou anteriormente. Em um cenário multi-tenant Sólides, se um agente ou script leaka o body do GET, o segredo do cliente vai junto.

## Reprodução (100% reprodutível)

```bash
API=http://localhost:18790
TOKEN="qa_alice"

curl -s -X PUT $API/api/config/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mcpServers":{"http_srv":{"url":"http://localhost:9999","auth_type":"bearer","auth_token":"super_secret_xyz"}}}'

curl -s $API/api/config/mcp -H "Authorization: Bearer $TOKEN"
```

**Actual:**
```json
{"mcpServers":{"http_srv":{"url":"http://localhost:9999","auth_type":"bearer","auth_token":"super_secret_xyz"}}}
```

**Expected (por analogia com o canal Telegram):**
```json
{"mcpServers":{"http_srv":{"url":"http://localhost:9999","auth_type":"bearer","auth_token":"********_xyz"}}}
```

## Arquivos afetados / onde investigar

- `nanobot/web/server.py:700-733` — implementação do GET e PUT `/api/config/mcp`.
- Comparar com o comportamento de canais em `server.py:1108-1161` (que **já** mascara `token` via alguma função tipo `_mask_secret`).
- Aplicar mesma máscara para `auth_token`, `auth_password`, `auth_api_key` (e qualquer campo secreto do `MCPServerConfig` em `config/schema.py:265-278`).

## Sugestão de fix

1. Centralizar uma função `_mask_secrets_mcp(mcp_config: dict) -> dict` em `server.py` (ou reusar a que já mascara token de canal).
2. Aplicá-la no retorno de `GET /api/config/mcp`.
3. No `PUT`, se o campo secreto vier com o mesmo prefixo/sufixo do valor mascarado (padrão `********...`), **manter o valor anterior** — para não sobrescrever o secret quando o frontend faz round-trip.
4. Adicionar teste em `tests/test_mcp_config_secrets.py`:
   - PUT com secret → GET retorna mascarado
   - PUT com valor mascarado → DB permanece com o secret original

## Testes de regressão sugeridos

```python
async def test_mcp_secret_is_masked_on_get(client, alice_token):
    await client.put("/api/config/mcp", json={
        "mcpServers": {"x": {"url":"http://x","auth_type":"bearer","auth_token":"topsecret"}}
    }, headers={"Authorization": f"Bearer {alice_token}"})
    r = await client.get("/api/config/mcp", headers={"Authorization": f"Bearer {alice_token}"})
    assert "topsecret" not in r.text
    assert r.json()["mcpServers"]["x"]["auth_token"].startswith("*")
```
