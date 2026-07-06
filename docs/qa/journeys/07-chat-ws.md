# Jornada 07 — Chat via WebSocket

## Endpoint

- `WS /ws/chat?token=<user_id>` — `nanobot/web/server.py:1291-1370`

## Protocolo

Cliente envia:
```json
{"type":"message","content":"...","session_key":"qa","agent_id":"qa_alice:default"}
```

Servidor responde com múltiplas mensagens:
- `{"type":"progress","content":"..."}` — pensamento intermediário
- `{"type":"tool_hint","content":"tool_name(args)"}` — quando LLM invoca tool
- `{"type":"response","content":"..."}` — resposta final
- `{"type":"error","content":"..."}` — erro

## Passos executados

1. Alice conecta, envia _"Diga apenas 'ok qa'"_ → recebe `response: ok qa` ✅.
2. Bob conecta, tenta usar `agent_id=qa_alice:default` (agente do Alice) → recebe uma mensagem tipo `response` com content `"Error: Agent not found for user: qa_bob"`. **Isolamento funciona** (Bob não vê nada da Alice) mas erro deveria vir como `type:error`. Ver [BUG-005](../bugs/BUG-005-ws-agent-not-found-shape.md).
3. Token inexistente (`nao_existe`) → servidor fecha com `{"type":"error","content":"Invalid token"}` ✅.
4. Skill via conversa: Alice envia _"Salve uma skill 'qa_teste_conversa'..."_ → agente chama `save_skill` corretamente e persiste em `skills_v7` (validado com `GET /api/skills/custom`).

## Resultado

✅ **Chat funciona, isolamento funciona.** Único achado: shape de erro inconsistente (P2).

## Bugs abertos

- [BUG-005](../bugs/BUG-005-ws-agent-not-found-shape.md) — P2
