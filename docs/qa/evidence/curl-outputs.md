# Evidências (curl outputs)

Este arquivo guarda os outputs crus dos endpoints testados, para o agente corretor conseguir reproduzir/comparar sem precisar rerodar tudo.

## Auth

```
POST /api/auth/register {"user_id":"qa_alice",...}
=> 200 {"token":"qa_alice","user":{"user_id":"qa_alice","display_name":"QA Alice","email":"alice@qa.test","status":"active"}}

POST /api/auth/register  (duplicado)
=> 409 {"detail":"User already exists"}

GET /api/me  (sem header)
=> 401 {"detail":"Missing or invalid Authorization header"}

GET /api/me Authorization: Bearer nao_existe
=> 401 {"detail":"User not found"}
```

## Agents

```
GET /api/agents  Bearer qa_alice
=> 200 [{"agent_id":"qa_alice:default","name":"Paulo","is_default":true, ...}]

POST /api/agents  Bearer qa_alice  {"name":"Vendedor Teste", "tools_enabled":["web_search","rag_search"], ...}
=> 200 {"agent_id":"agent_840400579492","name":"Vendedor Teste", ...}

GET /api/agents/agent_840400579492  Bearer qa_bob
=> 404 {"detail":"Agent not found"}

PATCH /api/agents/agent_840400579492  Bearer qa_bob  {"name":"HACKED"}
=> 404 {"detail":"Agent not found"}

DELETE /api/agents/agent_840400579492  Bearer qa_bob
=> 404 {"detail":"Agent not found"}
```

## Tools

```
GET /api/skills?agent_id=agent_840400579492  Bearer qa_alice
=> 200 {"tools_enabled":["web_search","rag_search"]}

PUT /api/skills?agent_id=agent_840400579492  Bearer qa_alice  {"tools_enabled":["exec","read_file","save_memory"]}
=> 200 {"tools_enabled":["exec","read_file","save_memory"]}
```

## Skills custom

```
PUT /api/skills/custom/qa_saudacao  Bearer qa_alice  {content, description, ...}
=> 200 {"ok":true}

GET /api/skills/custom  Bearer qa_bob
=> 200 []   (isolado)

PUT /api/skills/custom/qa_saudacao  Bearer qa_bob  {"content":"malicioso", ...}
=> 200 {"ok":true}   (skill do Bob, não sobrescreve a da Alice — UNIQUE(user_id,name))
```

## MCP (BUG-001, BUG-002, BUG-003, BUG-007)

```
GET /api/config/mcp  Bearer qa_alice  (default)
=> 200 {"mcpServers":[]}       <-- BUG-002: shape default é array

PUT /api/config/mcp  Bearer qa_alice  {"mcpServers":{"echo_test":{"command":"echo","args":["hi"],"env":{}}}}
=> 200 {"ok":true}

GET /api/config/mcp  Bearer qa_alice
=> 200 {"mcpServers":{"echo_test":{...}}}     <-- shape virou dict

PUT com http+bearer secret
=> 200 {"ok":true}
GET
=> 200 {"mcpServers":{"http_srv":{"url":"http://localhost:9999","auth_type":"bearer","auth_token":"super_secret_xyz"}}}
    <-- BUG-001: secret vaza em texto puro

PUT /api/config/mcp {"mcpServers":"invalid"}
=> 500 {"detail":"Internal server error"}     <-- BUG-003

PUT /api/config/mcp {"mcpServers":[{"name":"x"}]}
=> (conexão dropada, curl exit 52)            <-- BUG-007
```

## Channels

```
GET /api/channels?agent_id=agent_840400579492  Bearer qa_alice
=> 200 [{"name":"telegram","enabled":false,"running":false,...}, ...9 channels]

PUT /api/channels/telegram?agent_id=agent_840400579492  {"token":"111:INVALID_TOKEN_QA","enabled":true}
=> 200 {"ok":true}
GET after
=> ... "enabled":false ...      <-- BUG-006

POST /api/channels/telegram/start
=> 500 {"detail":"Failed to start telegram: The token `111:INVALID_TOKEN_QA` was rejected by the server."}
    <-- BUG-004 (500 + token espelhado)

POST /api/channels/telegram/start  Bearer qa_bob
=> 404 {"detail":"Agent not found"}   (isolamento OK)
```

## WS chat

```
alice → agent_id=qa_alice:default → "Diga apenas 'ok qa'"
=> response: "ok qa"   ✅

bob → agent_id=qa_alice:default (não é dele) → "impersonate"
=> {"type":"response","content":"Error: Agent not found for user: qa_bob"}   <-- BUG-005 (type errado)

token inexistente
=> {"type":"error","content":"Invalid token"}   ✅

alice → "Salve uma skill qa_teste_conversa..."
=> progress + tool_hint: save_skill(...) + response
GET /api/skills/custom
=> mostra qa_teste_conversa persistida ✅
```
