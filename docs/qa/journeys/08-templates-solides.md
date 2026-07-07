# Jornada 08 — Sólides Agent Hub (templates)

Roteiro para validar o catálogo de templates Sólides (Profiler, Ponto, DP, Jurídico, R&S, T&D, Clima) que substituiu os 6 templates genéricos hardcoded. Cobre o fluxo completo: DB → API → UI → chat.

## Pré-requisitos

- Stack rodando: `make dev` ou `docker compose up -d`.
- Gateway em `http://localhost:18790`.
- Frontend em `http://localhost:5174` (dev, HMR) ou `http://localhost:18790` (build servido).
- Dois usuários seedados: `qa_alice` e `qa_bob` (Bearer token = user_id).
- Provider LLM configurado para conseguir chat (opcional para cenários 1–6).

## Como executar

Cada cenário lista:
- **Setup** — o que preparar.
- **Passos** — sequência de comandos ou cliques.
- **Resultado esperado** — o que deve acontecer.
- **Anti-caso** — o que NÃO pode acontecer.

Rode em ordem — cenários posteriores assumem estado dos anteriores.

---

## 1. Migration v9 populou o catálogo

**Setup**: primeiro boot da stack, ou banco recém-limpo.

**Passos**:
```bash
docker exec nanobot-gateway python -c "
import asyncio, aiosqlite
async def main():
    async with aiosqlite.connect('/root/.nanobot/nanobot.db') as db:
        db.row_factory = aiosqlite.Row
        c = await db.execute('SELECT MAX(version) FROM _schema_version')
        print('version:', (await c.fetchone())[0])
        c = await db.execute('SELECT COUNT(*) FROM agent_templates')
        print('templates:', (await c.fetchone())[0])
        c = await db.execute('SELECT COUNT(*) FROM agent_template_skills')
        print('skills:', (await c.fetchone())[0])
        c = await db.execute('SELECT COUNT(*) FROM agent_template_knowledge')
        print('knowledge:', (await c.fetchone())[0])
asyncio.run(main())
"
```

**Resultado esperado**:
```
version: 9
templates: 8
skills: 14
knowledge: 7
```

**Anti-caso**: se `templates: 0` mas as tabelas existem, o seed post-migration não rodou. Verificar log de startup por erro em `_seed_agent_templates_if_empty`.

---

## 2. Listagem via API retorna 8 templates com metadata

**Passos**:
```bash
curl -s -H "Authorization: Bearer qa_alice" \
  http://localhost:18790/api/agents/templates | python -m json.tool
```

**Resultado esperado**: array de 8 objetos, cada um com `id, name, role, description, category, tags, icon, system_prompt, tools, rag_enabled, starter_prompts, model_recommended, skills_count, knowledge_count, display_order, created_at`.

Categorias presentes: `Geral, Comportamental, Ponto, DP, Jurídico, R&S, T&D, Engajamento`.

**Anti-caso**: erro 401 sem header, erro 500 se factory não expôs `agent_templates`, ou lista vazia.

---

## 3. Detalhe expõe skills e knowledge sources (sem conteúdo integral)

**Passos**:
```bash
curl -s -H "Authorization: Bearer qa_alice" \
  http://localhost:18790/api/agents/templates/profiler_consultor | python -m json.tool
```

**Resultado esperado**:
- Campos do template + `skills: [{name, description, always_active}, ...]` (sem `content`).
- `knowledge_sources: [{source: "profiler_glossario"}]`.
- HTTP 404 se pedir template inexistente.

**Anti-caso**: retorno expondo `content` completo da skill (aumenta payload sem necessidade no listing) ou `knowledge_sources` como array de strings simples.

---

## 4. Aplicar template Profiler cria agente populado

**Setup**: Alice ainda não aplicou nenhum template.

**Passos**:
```bash
curl -s -X POST -H "Authorization: Bearer qa_alice" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sofia","role":"Consultora Profiler","description":"Perfil comportamental","metadata":{"template":"profiler_consultor"}}' \
  http://localhost:18790/api/agents
```

**Resultado esperado** no agente retornado:
- `metadata.template = "profiler_consultor"`
- `avatar = "brain"` (icon do template)
- `tools_enabled = ["rag_search", "web_search", "write_file"]`
- `agent_config.skills_enabled = ["interpretar_perfil_profiler", "plano_gestao_por_perfil"]`
- `agent_config.rag.enabled = true`
- `bootstrap["AGENTS.md"]` com ~900 chars (o system_prompt Sólides)

**Anti-caso**: `skills_enabled` vazio, `rag.enabled` ausente, `bootstrap` sem AGENTS.md, ou avatar em branco.

---

## 5. Skills viraram registros no catálogo do usuário

**Passos**:
```bash
curl -s -H "Authorization: Bearer qa_alice" \
  http://localhost:18790/api/skills/custom | python -m json.tool
```

**Resultado esperado**: lista contém `interpretar_perfil_profiler` e `plano_gestao_por_perfil`, cada uma com `content` markdown > 1KB, `always_active` respeitando o template (Profiler: interpretar=True, plano=False).

**Anti-caso**:
- Skills ausentes (materialização falhou).
- Skills com content vazio (pego somente o nome).
- `always_active` sempre False (perdeu a flag).

---

## 6. Knowledge foi ingerido no RAG do usuário

**Passos**:
```bash
docker exec nanobot-gateway python -c "
import asyncio, aiosqlite
from nanobot.db.sqlite.rag_repo import SQLiteRetrieverRepository
async def main():
    async with aiosqlite.connect('/root/.nanobot/nanobot.db') as db:
        db.row_factory = aiosqlite.Row
        repo = SQLiteRetrieverRepository(db)
        for q in ['executor', 'planejador estabilidade', 'DISC']:
            hits = await repo.search('qa_alice', q, top_k=2)
            print(f'query={q!r}: {len(hits)} hits')
asyncio.run(main())
"
```

**Resultado esperado**: cada query retorna ≥ 1 hit apontando para `metadata.source = "profiler_glossario"` e `metadata.template = "profiler_consultor"`.

**Anti-caso**: 0 hits para termos comuns do glossário → ingest falhou ou FTS5 não foi rebuild.

---

## 7. Isolamento entre usuários

**Setup**: Alice já aplicou Profiler (cenários 4-6).

**Passos**:
```bash
# Bob aplica um template diferente
curl -s -X POST -H "Authorization: Bearer qa_bob" \
  -H "Content-Type: application/json" \
  -d '{"name":"DP Bob","role":"Analista","description":"DP","metadata":{"template":"dp_analista"}}' \
  http://localhost:18790/api/agents

# Skills do Bob:
curl -s -H "Authorization: Bearer qa_bob" http://localhost:18790/api/skills/custom | python -m json.tool

# Skills da Alice não mudam:
curl -s -H "Authorization: Bearer qa_alice" http://localhost:18790/api/skills/custom | python -m json.tool
```

**Resultado esperado**:
- Bob passa a ter `folha_pagamento_basico` e `admissao_rescisao_checklist`.
- Alice permanece só com as skills do Profiler (sem contaminação).
- RAG de Bob tem chunk com `source=esocial_eventos_frequentes` mas RAG de Alice não.

**Anti-caso**: skills de um usuário aparecerem no outro; chunks compartilhados.

---

## 8. Blank template não gera side effects

**Passos**:
```bash
curl -s -X POST -H "Authorization: Bearer qa_alice" \
  -H "Content-Type: application/json" \
  -d '{"name":"Vazio","role":"L","description":"Sem template","metadata":{"template":"blank"}}' \
  http://localhost:18790/api/agents | python -m json.tool
```

**Resultado esperado**:
- Agente criado normalmente.
- `agent_config.skills_enabled` = `None` (não força enable de nada).
- `bootstrap` vazio (sem AGENTS.md sobrescrito).
- Sem novas skills materializadas para Alice.

**Anti-caso**: aplicar blank remove skills previamente existentes ou adiciona skills a partir do template.

---

## 9. Template inexistente é ignorado (não quebra criação)

**Passos**:
```bash
curl -s -X POST -H "Authorization: Bearer qa_alice" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bogus","role":"X","description":"X","metadata":{"template":"nao_existe"}}' \
  http://localhost:18790/api/agents | python -m json.tool
```

**Resultado esperado**: HTTP 200, agente criado com `metadata.template = "nao_existe"` mas sem side effects (mesmo comportamento do blank).

**Anti-caso**: HTTP 500 ou criação abortada.

---

## 10. Frontend — hub agrupado por categoria

**Passos** (browser em `http://localhost:5174` como `qa_alice`):

1. Abra o menu lateral > **Agent Hub**.
2. Observe o título "Sólides Agent Hub" e o subtítulo "Agentes prontos para o time de Gente & Gestão".
3. Confirme os grupos por categoria, na ordem: `Comportamental, R&S, T&D, Ponto, DP, Jurídico, Engajamento, Geral`.
4. Verifique que cada card mostra:
   - Ícone, nome, papel, descrição.
   - Badge "2 skills" (ou 0 no blank).
   - Badge "Base de conhecimento" quando `rag_enabled`.
   - Até 3 badges de tools + contador "+N" quando ultrapassa.

**Anti-caso**: cards fora de categoria, título antigo "Agent Store", grupos com contagem errada.

---

## 11. Frontend — aplicar template abre o Studio com skills marcadas

**Passos**:
1. No hub, clique em **Usar este template** no card do "Consultor de Perfil Comportamental".
2. Confirme redirecionamento para o Agent Studio no **step 2 (Identidade)**.
3. Nome/papel/descrição/avatar pré-preenchidos.
4. Preview readonly aparece: **"Prompts sugeridos"** com as 3 starter prompts.
5. Avance ao **step 4 (Capacidades)** — as 2 skills do template devem estar marcadas.
6. RAG deve estar habilitado.

**Anti-caso**: step 4 sem skills marcadas, starter prompts não exibidos.

---

## 12. Frontend — criar agente materializa DB

**Passos**:
1. Continuando do cenário 11: revise, chegue ao **step 5**, escolha canais (ou nenhum), clique em **Criar**.
2. Volte para **Meus agentes** — o novo agente deve aparecer.
3. No terminal, valide a materialização:
```bash
curl -s -H "Authorization: Bearer qa_alice" http://localhost:18790/api/agents | python -m json.tool
```

**Resultado esperado**: novo agente com `agent_config.skills_enabled` populado e `bootstrap.AGENTS.md` presente.

---

## 13. Chat — starter prompts orientam o agente (opcional)

**Setup**: provider LLM configurado.

**Passos**:
1. Abra o chat do agente Profiler recém-criado.
2. Envie: *"Como liderar um colaborador com perfil Executor sem gerar atrito?"*
3. Observe o comportamento:
   - Resposta em pt-BR, tom consultivo.
   - Cita os 4 perfis ou referencia o Profiler.
   - Se `rag_search` for chamado, a resposta traz insights do glossário (ex.: motivadores/riscos do Executor).

**Anti-caso**: resposta em inglês, tom genérico sem contexto Sólides, ignora completamente o RAG apesar de estar habilitado.

---

## 14. Chat — skill sempre-ativa entra em ação

**Setup**: mesmo agente Profiler (skill `interpretar_perfil_profiler` marcada como `always_active=True`).

**Passos**:
1. Envie: *"Segue relatório: perfil Executor 71%, Analista 22%. Como interpretar?"*

**Resultado esperado**: o agente segue a estrutura da skill:
1. Dominante + secundário.
2. Comportamento observável.
3. Como liderar.
4. Riscos.
5. Desenvolvimento sugerido.

**Anti-caso**: resposta livre sem seguir o template markdown definido na skill.

---

## 15. Chat — skill on-demand só entra quando o pedido bate

**Passos**:
1. No mesmo chat, envie: *"Monte um plano de gestão trimestral para a Marcela, Planejadora."*
2. A skill `plano_gestao_por_perfil` (always_active=False) deve orientar a saída em markdown com seções fixas (Reconhecimento, 1:1, Delegação, Feedback, Crise, Desenvolvimento).

**Anti-caso**: resposta corrida sem estrutura, ou skill aplicada a pergunta que não pediu plano.

---

## 16. Cross-template — Jurídico traz disclaimer

**Setup**: novo agente a partir do template `juridico_trabalhista`.

**Passos**:
1. Envie: *"Podemos demitir um colaborador em home office por baixa performance?"*

**Resultado esperado**:
- Análise estruturada (Situação, Hipótese, Fundamento, Risco, Mitigações).
- Linguagem probabilística ("tende a", "há risco de").
- **Disclaimer obrigatório** ao final: *"Esta orientação é informativa e não substitui parecer de advogado trabalhista..."*

**Anti-caso**: conclusão categórica ("pode fazer" / "não pode"), ausência do disclaimer.

---

## 17. Cross-template — Ponto responde com cenários práticos

**Setup**: agente a partir de `ponto_assistente`.

**Passos**:
1. Envie: *"Esqueci de bater o ponto na saída ontem, o que faço?"*

**Resultado esperado**: resposta explica o fluxo Sólides Ponto de solicitação de ajuste + cita Portaria 671/2021 (histórico de alterações rastreável) + encerra com nota sobre convenção coletiva.

---

## 18. Regressão — templates antigos não quebram

**Setup**: `blank`, `sales_b2b`, `support_n1`, `rh_triage`, `skill_author`, `content_writer`.

**Passos**:
```bash
for tpl in sales_b2b support_n1 rh_triage skill_author content_writer; do
  echo "=== $tpl ==="
  curl -s -X POST -H "Authorization: Bearer qa_alice" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Reg-$tpl\",\"role\":\"X\",\"description\":\"X\",\"metadata\":{\"template\":\"$tpl\"}}" \
    http://localhost:18790/api/agents | python -c "import json,sys; a=json.load(sys.stdin); print('ok', a['agent_id'])"
done
```

**Resultado esperado**: cada chamada retorna HTTP 200 e cria um agente vazio (comportamento equivalente ao template inexistente). O `metadata.template` fica registrado para telemetria futura.

**Anti-caso**: 500 ou 404 por template legado.

---

## 19. Idempotência — reaplicar template sobrescreve skill do usuário

**Setup**: Alice já tem `interpretar_perfil_profiler` do cenário 4. Suponha que ela editou o conteúdo.

**Passos**:
1. Edite a skill via UI ou API para inserir uma palavra reconhecível.
2. Crie outro agente com o mesmo template Profiler:
```bash
curl -s -X POST -H "Authorization: Bearer qa_alice" \
  -H "Content-Type: application/json" \
  -d '{"name":"Segundo","role":"X","description":"X","metadata":{"template":"profiler_consultor"}}' \
  http://localhost:18790/api/agents
```
3. Recarregue a skill.

**Resultado esperado**: skill volta ao conteúdo original do template (upsert por nome). RAG ganha um segundo chunk com o mesmo `source` (duplicado — comportamento conhecido, ver Riscos).

**Anti-caso**: comportamento inconsistente entre reaplicações.

---

## 20. Ruff + pytest verdes

**Passos**:
```bash
pytest tests/db/test_agent_template_repo.py tests/db/test_template_application.py -q
ruff check nanobot/db nanobot/web tests/db
```

**Resultado esperado**: 18 testes verdes, ruff sem erros nos diretórios modificados.

---

## Riscos conhecidos e não-testados aqui

- **RAG duplicado** ao reaplicar template (cenário 19): aceitável na 1ª iteração; permite dedupe futuro via `metadata.template`.
- **Skill sobrescrita** ao reaplicar template: comportamento intencional (template é fonte-verdade quando aplicado), mas potencialmente surpreendente. Se conflitante, o produto pode passar a pedir confirmação.
- **Portaria 671 pode mudar**: o knowledge do template `ponto_assistente` é snapshot; atualização exige nova migration ou edição no DB.
- **Testes de chat (13–17) exigem provider LLM**. Sem provider configurado, marque como "não avaliado" e valide apenas os passos de setup (cenários 4–12).

## Comandos rápidos de reset

Se quiser reaplicar seed (útil quando o conteúdo dos templates é atualizado no código):
```bash
docker exec nanobot-gateway python -c "
import asyncio, aiosqlite
async def main():
    async with aiosqlite.connect('/root/.nanobot/nanobot.db') as db:
        await db.execute('DELETE FROM agent_template_knowledge')
        await db.execute('DELETE FROM agent_template_skills')
        await db.execute('DELETE FROM agent_templates')
        await db.commit()
asyncio.run(main())
"
docker compose restart nanobot-gateway
```
Ao subir de novo, o `_seed_agent_templates_if_empty` roda outra vez com o conteúdo atual do módulo Python.
