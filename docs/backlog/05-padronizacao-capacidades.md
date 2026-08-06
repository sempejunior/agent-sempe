# 05 — Padronização de Capacidades (tools / skills / templates / integrações)

> **Status:** Fase 1 **executada** (catálogo único de tools, `GET /api/tools/catalog`, frontend
> sem listas hardcoded, distinção infraestrutura × permissão). Fases 0, 2, 3 e 4 seguem propostas.
> **Tipo:** refactor de arquitetura (faseado).
> Documento de referência: estado atual (a bagunça), o modelo-alvo, as regras de
> padronização por tipo, como adicionar cada coisa depois de padronizado, e o caminho
> faseado pra chegar lá.

---

## 1. Princípio único

**Referenciar, não copiar. Um lar por capacidade.**

Toda a confusão de hoje vem de **copiar conteúdo entre camadas** (seed → tabela → linha por
usuário → bootstrap do agente). Cada cópia deriva sozinha e precisa de uma migração pra
reconciliar. A regra é: cada capacidade tem **um** dono; as outras camadas **apontam por nome/id**.

| Capacidade | Único lar (source of truth) | Como o resto referencia |
|---|---|---|
| **Tool** | Código: subclasse de `Tool` + entrada no catálogo backend | por `id` (string) |
| **Skill** | Builtin: `nanobot/skills/*/SKILL.md` (git) · Usuário: DB `skills` | por `nome` em `skills_enabled` |
| **Template** | Seed `agent_templates_solides.py` (catálogo re-sincronizável) | por `template_id` |
| **Integração/MCP** | Catálogo `integrations/catalog.py` + `user_integrations` (DB) | por `slug`/`system_integration_id` |

Regra de ouro dos agentes: **um agente criado é uma instância independente do usuário.**
Mudança em template/skill afeta agentes **novos**; os existentes são do usuário pra editar.
(É isso que elimina as migrações que mutavam agentes retroativamente.)

---

## 2. Estado atual (o que precisa mudar)

### 2.1 Skill — vive em 5-6 lugares
1. Builtin FS `nanobot/skills/<nome>/SKILL.md` (`BUILTIN_SKILLS_DIR`, `agent/skills.py:15`).
2. Workspace FS `workspace/skills/*` (modo FS/legado).
3. DB `skills` (por usuário, coluna `origin` = user|solides).
4. Seed do template: `SOLIDES_TEMPLATES[*]["skills"][*]["content"]` (markdown inline).
5. Tabela `agent_template_skills` (cópia do seed).
6. Por nome em `agent_config.skills_enabled` (sem conteúdo).

O mesmo `pdi_por_perfil` existe como (4)→(5)→(3, copiado por usuário na criação do agente). Editar
o seed **não** propaga. `_TEMPLATE_RECOMMENDED_SKILLS` (`web/server.py:44-55`) é uma **4ª fonte**
de "quais skills o template pré-seleciona", separada de `agent_template_skills`, e aponta pra
builtins que não têm linha nenhuma. Precedência de nome muda conforme o modo (DB vs FS). `origin`
congela no upsert. **9 migrações/fixups existem só pra reconciliar isso.**

### 2.2 Tool — id hardcoded em 3-6 lugares, sem fonte única
`factories` (`user_context.py:273`), registro FS (`loop.py:145`), `lib/tools.ts:41`,
`AgentStudioPage.tsx BUILTIN_TOOLS:61`, listas `tools` dos templates, literais em migrações.
Drift real: `azure_devops_report` só no Studio; `save_skill` só no `tools.ts`;
`http_call`/`read_skill`/`screenshot` em nenhum frontend; `spawn` só em modo FS. Tools
"forçadas" (`publish_page`, `publish_report`, `read_skill`, `azure_devops_report`, memory, rag)
ignoram o toggle **silenciosamente** — o usuário acha que desligou, mas continua on.
O `Tool` base (`tools/base.py`) **não tem metadado de UI** (label/categoria) — por isso o
frontend mantém listas paralelas.

### 2.3 Template — "DB é source of truth após seed" gerou sprawl
9 funções em `migrations.py` só pra reconciliar: `_seed_agent_templates_if_empty`,
`_backfill_missing_templates`, `_backfill_template_guardrails`, `_refresh_skill_author_prompt`,
`_refresh_pdi_prompt`, `_consolidate_pdi_templates`, `_enable_analise_desempenho_skill`,
`_fixup_v10_template_guardrails`, `_fixup_v11_skill_origin`. Cada mudança de template vira uma
migração SQL bespoke, guardada por marcador, que edita a linha do catálogo **e** as cópias
derivadas nos agentes.

### 2.4 Integração/MCP — dois gatings
MCP de config estático é filtrado por `mcp_servers_enabled` (`loop.py:316-332`); MCP do catálogo
por-usuário (`_ensure_user_mcp`) **não** é filtrado. Dois caminhos, um só conceito de gate.

### 2.5 Como o cliente adiciona capacidade hoje (fora de escopo mudar agora)
Tool nativa exige Python. Sem código, o cliente só: (a) ativa integração do catálogo, ou
(b) cadastra MCP server via `save_mcp_server`/`mcp_servers`. `http_call` custom está
"not implemented". **Decisão: manter assim por enquanto** — MCP é o caminho externo;
não construir no-code builder agora.

---

## 3. Modelo-alvo e regras de padronização (por tipo)

### 3.1 Tools
**Padrão:** a classe `Tool` é auto-descrita; existe **um** catálogo no backend; o frontend
consome via endpoint. Nunca mais listas hardcoded no front.

- `tools/base.py` ganha atributos de classe opcionais (com default, não quebra nada):
  `label`, `category`, `warn: bool`, `hidden: bool`, e gating declarativo
  (`forced: bool`, `requires_display`, `requires_integration`, `requires_retriever`, …).
- Novo `agent/tools/catalog.py` = **a lista única** (classe → metadado → regra de disponibilidade).
  `build_tool_registry` e `_register_default_tools` derivam dela; some a duplicação de literais.
- `GET /api/tools/catalog` serializa (id, label, category, warn, forced, hidden).
- Frontend: `tools.ts` e `BUILTIN_TOOLS` **deletados**, substituídos por fetch do endpoint.
- Tools `forced` aparecem como "sempre ativa" (não-togglável), em vez de toggle ignorado.
- **Adicionar tool depois disso** = 1) escrever a classe; 2) uma entrada no catálogo. Fim.

### 3.2 Skills
**Padrão:** dois lares só — **builtin** (FS, git) e **usuário** (DB). Templates **referenciam
por nome**. Nada de conteúdo inline em seed nem cópia por usuário.

- Skills "Sólides" que hoje moram no seed do template viram **builtin FS** (git), iguais a
  `montar-pdi`: `pdi_por_perfil`, `feedback_estruturado`, `interpretar_perfil_profiler`,
  `plano_gestao_por_perfil`, `regras_ponto_portaria_671`, etc.
- Template passa a ter só `skills: [nomes]` (referência). Some o shape com `content`; a tabela
  `agent_template_skills` é aposentada (para de ser lida/escrita; DROP em limpeza posterior).
- `POST /api/agents` **para de copiar** skills pro DB do usuário. `skills_enabled` é só uma lista
  de nomes resolvidos contra {builtin FS, DB usuário}.
- `_TEMPLATE_RECOMMENDED_SKILLS` é **dobrado dentro do `skills` do próprio template** (fonte única).
- Coluna `origin` sai (derivável: DB = user, FS = builtin).
- **Um resolver + validação no boot**: todo nome referenciado tem que resolver; senão, warning
  (hoje falha silenciosa).
- **Adicionar skill Sólides depois disso** = criar `nanobot/skills/<nome>/SKILL.md` e citar o nome
  no `skills` do template. **Skill de usuário** = UI/`save_skill` → DB. Só isso.

### 3.3 Templates
**Padrão:** catálogo **re-sincronizável** do seed; nunca mais migração bespoke por template.

- Seed = source of truth do **catálogo**. No boot, **upsert idempotente por id** com hash de
  conteúdo (re-sincroniza só o que mudou) — substitui `_seed_..._if_empty` + os `_backfill_*`.
- Templates são read-only na UI (confirmar) → não há "edição de admin" a preservar.
- **Agente é instância independente**: mudança de template afeta só agentes novos. Aposentar os
  reconciliadores que mutavam agentes (`_refresh_pdi_prompt`, `_enable_analise_desempenho_skill`,
  `_refresh_skill_author_prompt`, `_consolidate_pdi_templates`). Ficam no histórico (não
  re-executam), só não se criam novos nesse padrão.
- **Mudar um template depois disso** = editar o seed. O boot re-sincroniza. Zero migração.

### 3.4 Integrações/MCP
**Padrão:** um só gating. O MCP do catálogo por-usuário (`_ensure_user_mcp`) passa pelo **mesmo**
filtro `mcp_servers_enabled` do MCP estático. `slug`/`system_integration_id` continuam a chave
única (catálogo ↔ `user_integrations`). Sem feature nova de cliente agora.

---

## 4. Caminho faseado

Ordenado por risco. **0, 1, 4 são seguros** (sem tocar dados) — ok até pra gravar vídeo.
**2, 3 mexem em dados** — fazer com cópia do banco e migração não-destrutiva.

- **Fase 0 — ADR**: promover este doc a `docs/architecture/capabilities.md` + link no `CLAUDE.md`. Zero código.
- **Fase 1 — Catálogo de tools único** ✅ **feita**: `agent/tools/catalog.py` é a fonte única
  (id → metadado de UI → regra de disponibilidade → construtor); `build_tool_registry` deriva dela;
  `GET /api/tools/catalog` serializa; `lib/tools.ts` e `BUILTIN_TOOLS` deletados e as duas telas
  consomem o endpoint. Os metadados ficaram no `ToolSpec` em vez de na classe `Tool` — assim as ~20
  classes de tool não precisaram ser tocadas e continua existindo um lar só.
  A regra de produto ficou explícita no catálogo: **infraestrutura** (`permission=False`) é sempre
  registrada quando suas dependências existem e nunca aparece como escolha; **permissão**
  (`permission=True`) é o que tem consequência fora do sandbox (`exec`, `computer`, `browser`,
  `screenshot`, `cron`, `message`, `save_mcp_server`) e só entra via `tools_enabled`. Isso eliminou
  os 7 toggles que o cliente desmarcava e continuavam ligados. Capacidade de fornecedor
  (`azure_devops_report`) passou a seguir a integração ativa via `integrations=(...)`, em vez de ser
  um switch morto na lista.
- **Fase 4 — Gating de MCP unificado**: `_ensure_user_mcp` respeita `mcp_servers_enabled`. Isolado.
- **Fase 2 — Skills em dois lares**: mover skills de template pra builtin FS; template referencia por nome; parar cópia por usuário; dobrar `_TEMPLATE_RECOMMENDED_SKILLS`; remover `origin`; resolver único + validador de boot; dedup das linhas `origin='solides'`. Migração validada em cópia.
- **Fase 3 — Templates re-sincronizáveis**: upsert idempotente do seed por hash; aposentar os reconciliadores bespoke. Depende da Fase 2.

## 5. Verificação (quando executar)

- A cada fase: `pytest tests/` + `ruff check` no container; editar `.py` em lote (o watchmedo
  reinicia o gateway e derruba a sessão — cuidado durante demo).
- Fase 1: `GET /api/tools/catalog` lista todos os ids; front renderiza dele; `azure_devops_report`/
  `save_skill` consistentes; tool forçada some do toggle.
- Fase 2: contra cópia do banco → criar agente PDI: `skills_enabled` resolve (builtin/DB), sem cópia
  nova; validador não loga órfão; chat: agente PDI ainda monta análise + PDI.
- Fase 3: subir contra cópia → templates re-sincronizam do seed sem quebrar agentes já criados;
  2º boot é no-op (hash igual).
- Fase 4: agente com `mcp_servers_enabled` restrito → tools de MCP do catálogo respeitam o filtro.

## 6. Ganho esperado

- Adicionar/remover **tool**: 1 lugar (classe + catálogo) em vez de 3-6.
- Adicionar **skill**: 1 arquivo (builtin) ou 1 linha na UI (usuário); template só cita o nome.
- Mudar **template**: editar o seed; zero migração bespoke.
- **9 funções de reconciliação** em `migrations.py` deixam de crescer (as novas mudanças não usam
  mais esse padrão).
- Frontend sem listas hardcoded que driftam do backend.
