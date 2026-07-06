# Jornada 03 — Tools built-in habilitadas por agente

## Endpoints envolvidos

- `GET /api/skills/builtin?agent_id=...` — `nanobot/web/server.py:735-754`
- `GET /api/skills?agent_id=...` — `server.py:756-759`
- `PUT /api/skills?agent_id=...` — `server.py:761-768`

## Passos executados

1. `GET /api/skills/builtin?agent_id=agent_840400579492` — retornou catálogo com skills built-in (`clawhub`, `weather`, ...) e tools/skills disponíveis.
2. `GET /api/skills?agent_id=agent_840400579492` — retornou `{"tools_enabled": ["web_search","rag_search"]}` (o que foi passado na criação).
3. `PUT /api/skills?agent_id=agent_840400579492` com `{"tools_enabled":["exec","read_file","save_memory"]}` — 200 OK.
4. `GET /api/skills?agent_id=agent_840400579492` — retornou `["exec","read_file","save_memory"]` ✅ persistido.
5. `GET /api/skills?agent_id=agent_840400579492` como `qa_bob` → **404** ✅.

## Resultado

✅ **Habilitar/desabilitar tools no agente funciona e é isolado por dono.**

## Observações

- Ao chamar o agente via WS depois de reduzir tools, o agente continuou funcionando normalmente. Não testei se `exec` realmente sumiu do prompt do LLM — feito indiretamente via `ContextBuilder`. Sugestão de rodada 2: fazer o LLM tentar chamar uma tool que foi desabilitada e ver o comportamento.
- Catálogo built-in vem misturado com skills built-in — pode confundir na UI. Confirmar se `CapabilitiesPage.tsx` separa isso claramente.

## Nenhum bug aberto.
