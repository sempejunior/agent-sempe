# Jornada 04 — Skills customizadas (PUT direto + criação por conversa)

## Endpoints envolvidos

- `GET /api/skills/custom` — `nanobot/web/server.py:770-776`
- `PUT /api/skills/custom/{name}` — `server.py:785-798`
- `DELETE /api/skills/custom/{name}` — `server.py:778-783`
- Tabela: `skills_v7` (`nanobot/db/sqlite/migrations.py:474-491`) com `UNIQUE(user_id, name)`
- Tool `save_skill` — usada pelo agente para criar skill via conversa.

## Passos executados

### A. PUT direto

1. `GET /api/skills/custom` (Alice) — retorna `[]`.
2. `PUT /api/skills/custom/qa_saudacao` com content markdown → 200 OK.
3. `GET /api/skills/custom` — retorna skill Alice com `id=1`.
4. `GET /api/skills/custom` (Bob) — retorna `[]` ✅.
5. Bob faz `PUT /api/skills/custom/qa_saudacao` com content `"malicioso"` → 200 OK.
6. `GET /api/skills/custom` Alice ainda mostra o content original.
7. `GET /api/skills/custom` Bob mostra a nova skill dele com content `"malicioso"`.

**Conclusão:** o UNIQUE é `(user_id, name)`, então mesmo nome coexiste por usuário. Comportamento correto para multi-tenant. **Sem bug.**

### B. Criação via conversa

1. Alice envia via WS: _"Salve uma nova skill chamada 'qa_teste_conversa' que instrui o agente a responder 'PONG' quando alguém disser 'PING'. Use a ferramenta save_skill."_
2. Agente responde com `progress` + `tool_hint: save_skill("qa_teste_conversa")` + `response` confirmando.
3. `GET /api/skills/custom` (Alice) — retorna `qa_teste_conversa` com descrição correta ✅.

## Resultado

✅ **Ambos os fluxos funcionam.** A criação por conversa depende do LLM chamar `save_skill` corretamente — o prompt do agente e a descrição da tool estão bem calibrados.

## Nenhum bug aberto nesta jornada.
