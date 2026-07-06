# BUG-005 — Erro do agent loop volta no WS como type:response em vez de type:error

- **Status:** fixed (pending commit)
- **Prioridade:** P2 (higienização, atrapalha frontend)
- **Área:** WebSocket `/ws/chat`
- **Fix:** handler captura `ValueError` do loop e envia `{type:"error", code, content, session_key}`. `code` é `agent_not_found`, `user_not_found` ou `invalid_request`; exceções genéricas viram `internal_error`. Frontend (`store.ts`) já distingue `type === "error"`. Testes: `tests/test_ws_chat.py`.

## Descrição

Quando um usuário tenta usar um `agent_id` que não pertence a ele, o WebSocket devolve:

```json
{"type":"response","content":"Error: Agent not found for user: qa_bob","session_key":"..."}
```

Isso é uma **resposta bem-sucedida** aos olhos do frontend (o `type` é `response`), então o chat renderiza `"Error: Agent not found for user: qa_bob"` como se fosse uma mensagem do agente. Deveria ser `{"type":"error", "code":"agent_not_found", ...}`.

## Reprodução

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:18790/ws/chat?token=qa_bob") as ws:
        await ws.send(json.dumps({
            "type":"message","content":"x",
            "session_key":"qa","agent_id":"qa_alice:default"
        }))
        print(await ws.recv())
        # => {"type":"response","content":"Error: Agent not found for user: qa_bob",...}

asyncio.run(main())
```

## Expected

```json
{"type":"error","code":"agent_not_found","content":"Agent not accessible","session_key":"..."}
```

## Arquivos afetados

- `nanobot/web/server.py:1291-1370` — endpoint `/ws/chat`.
- `nanobot/client/loop.py` — `ClientAwareAgentLoop._process_message`. Deve levantar exceção específica em vez de retornar string.

## Sugestão de fix

1. Levantar `AgentAccessError` no `ClientAwareAgentLoop` quando `agent_id` não pertence ao user.
2. No handler WS, capturar e enviar como `{"type":"error","code":"...","content":"..."}`.
3. Teste WS que valide o tipo.

## Nota adicional

O isolamento em si funciona (Bob nunca acessa dados de Alice). Este bug é só sobre **como o erro é comunicado**.
