# Jornada QA — Sólides Agent Hub (completa)

**Objetivo**: exercitar todo o fluxo de criação, customização e uso de agentes com os templates Sólides, skills embutidas, skills próprias e a Base RAG.

**Pré-requisitos**
- Stack rodando: `docker compose -f docker-compose.dev.yml up -d`
- Frontend acessível em `http://localhost:18790`
- Usuário QA criado (ex.: `qa_alice`) via signup
- Chromium com CDP disponível se for testar `browser` (opcional)

**Notação**
- ✅ = resultado esperado
- ⚠️ = comportamento a observar (não trava, mas anotar)
- ❌ = bug se acontecer — abrir issue

---

## Fase 1 — Onboarding e navegação (5 min)

### C1.1 Login e visão geral
1. Abrir `http://localhost:18790` → logar como `qa_alice`.
2. Confirmar sidebar mostra **logo Sólides + "Agent Hub v2.5"** no topo.
3. Clicar cada item do menu e confirmar que nenhuma rota estoura.
   - ✅ Sem console errors.
   - ⚠️ Se algum menu redirecionar pra `chat` sem motivo, anotar.

### C1.2 Store de templates
1. Sidebar → **Agent Store**.
2. ✅ Topo mostra card destacado **"Em branco — Criar do zero"**.
3. ✅ Grid mostra **7 templates Sólides** com ícones distintos:
   - Consultor de Perfil Comportamental — 🧠 Brain
   - Assistente Sólides Ponto — 🕐 Clock
   - Analista de DP — 📄 FileText
   - Consultor Jurídico Trabalhista — ⚖️ Scale
   - R&S com Fit Comportamental — 🔍 UserSearch
   - T&D e PDI Comportamental — 🎓 GraduationCap
   - Clima e Engajamento — 😊 Smile
4. ✅ Cada card carrega badge de categoria no canto superior direito.
5. ✅ Em telas grandes (>1440px) vê pelo menos 3 cards lado a lado (não empilhado).

---

## Fase 2 — Criar agente do zero (blank) (5 min)

### C2.1 Wizard sem template
1. Agent Store → **Em branco** → **Criar do zero**.
2. Step 1 já preenchido com `blank` → **Próximo**.
3. **Step 2 Identidade**
   - Nome: `Ana Teste`
   - Papel: `Assistente de RH`
   - Descrição: `Ajuda em dúvidas rápidas do time de RH.`
   - **Ícone**: buscar `assistente` → escolher **Sparkles**. Trocar para busca `chat` → escolher **Message Circle**. Trocar de volta para **Sparkles**.
   - ✅ Ícone selecionado aparece em destaque no topo do picker
   - ✅ Highlight roxo no ícone escolhido
4. **Step 3 Personalidade**
   - Persona: `Você é a Ana, prática e direta. Fala em português.`
   - Diretrizes: deixar vazio
5. **Step 4 Ferramentas**
   - ✅ Botão **Recolher tudo** funciona → todas as seções fecham
   - ✅ **Expandir tudo** reabre
   - Colapsar todas exceto Memória e Web
   - Marcar `save_memory`, `search_memory`, `web_search`, `web_fetch`
   - ⚠️ Badge de cada categoria mostra `X/Y` ativas
6. **Step 5 Skills & Conhecimento**
   - RAG **desligado**
   - Chip "Habilitadas neste agente (0)" com texto "Nenhuma skill habilitada"
   - Busca vazia → ✅ lista mostra qualquer skill custom que exista, **sem categoria "sistema"** aparecendo
7. **Step 6 Canais**: nada
8. **Criar agente**.

### C2.2 Conversar com Ana
1. Menu topo → **Conversar**.
2. ✅ Header do chat mostra ícone Sparkles (não iniciais "AT").
3. Enviar: `"Qual foi a última coisa que te contei?"`
   - ✅ Ana responde admitindo que não tem memória prévia
4. Enviar: `"Guarda pra mim: meu chefe é o Bruno."`
   - ✅ Ana chama `save_memory` (bolha de ferramenta aparece)
5. Enviar: `"Quem é meu chefe?"`
   - ✅ Ana chama `search_memory` e responde "Bruno"
6. Enviar: `"Busca no Google 'salario medio analista RH Brasil 2025'"`
   - ✅ Usa `web_search`

---

## Fase 3 — Template Sólides completo (Profiler) (10 min)

### C3.1 Aplicar template
1. Agent Store → **Consultor de Perfil Comportamental** → **Usar este template**.
2. ✅ Wizard vai para Step 2 com nome, papel, descrição, ícone **Brain** já preenchidos.
3. Percorrer sem mudar nada até criar.
4. Nome sugerido: aceitar padrão do template ou trocar para `"Consultor Profiler QA"`.
5. **Criar agente**.

### C3.2 Verificar materialização
1. Sidebar → **Minhas Skills**.
   - ✅ Aparecem `interpretar_perfil_profiler` e `plano_gestao_por_perfil`
2. Sidebar → **Bases RAG / FAQ**.
   - ✅ Base populada com chunks do glossário Profiler
   - Fazer busca por `"executor"` → deve retornar chunk

### C3.3 Conversar
1. Selecionar o agente Profiler → **Conversar**.
2. Perguntas para rodar (uma por vez):
   - `"O que caracteriza um perfil Comunicador?"` → ✅ usa `rag_search`, cita glossário
   - `"Como devo dar feedback pra um Executor?"` → ✅ aplica skill `plano_gestao_por_perfil`
   - `"Monta um plano semanal de gestão pra um Analista"` → ✅ resposta estruturada
   - `"E se eu não souber o perfil do colaborador?"` → ✅ sugere próximos passos (Profiler)

---

## Fase 4 — Template Sólides Ponto (5 min)

### C4.1 Criar
1. Agent Store → **Assistente Sólides Ponto** → aplicar → **Criar**.

### C4.2 Perguntas de teste
1. `"Um colaborador esqueceu de bater ponto no almoço. Qual o procedimento correto pela Portaria 671?"`
   - ✅ Skill `regras_ponto_portaria_671` aciona, cita normativa
2. `"Meu funcionário fez 42h extras no mês, isso é legal?"`
   - ✅ Usa `calculo_banco_horas` e cita limite CLT
3. `"Quantos dias tenho para corrigir uma marcação errada?"`
   - ✅ Resposta consistente com Portaria 671

---

## Fase 5 — Template Jurídico (governança) (5 min)

### C5.1 Criar Jurídico
1. Agent Store → **Consultor Jurídico Trabalhista** → **Criar**.

### C5.2 Disclaimer obrigatório
1. `"Empregado faltou 3 dias sem justificativa, posso demitir por justa causa?"`
   - ✅ Resposta **começa** com disclaimer "não substitui parecer advocatício"
   - ✅ Cita artigos da CLT via RAG
   - ✅ Sugere próximos passos (documentar, RH, advogado)
2. `"Me redige uma advertência formal para essa situação"`
   - ✅ Skill `redacao_juridica_formal` produz texto formal
3. `"Qual o risco de eu não seguir esse processo?"`
   - ✅ Skill `analise_risco_trabalhista` estrutura resposta

---

## Fase 6 — Customizar template (mix de domínios) (10 min)

### C6.1 Recrutador com skills extras
1. Agent Store → **R&S com Fit Comportamental** → aplicar.
2. **Step 5 Skills**:
   - Buscar `"ponto"` → habilitar `regras_ponto_portaria_671`
   - Filtro categoria `"Jurídico"` → habilitar `analise_risco_trabalhista`
   - Chip R&S: remover `fit_comportamental_profiler` clicando no X
   - ✅ Chip do topo atualiza em tempo real
3. Criar como `"Recrutador Full-Stack QA"`.

### C6.2 Testar mix
1. `"Estou contratando analista de ponto. Que perguntas fazer na entrevista e que riscos trabalhistas checar na proposta?"`
   - ✅ Resposta usa `triagem_curriculo` + `analise_risco_trabalhista` + `regras_ponto_portaria_671`

---

## Fase 7 — Skill própria + integração (10 min)

### C7.1 Criar skill custom
1. Sidebar → **Minhas Skills** → **Nova skill** (ou botão do wizard).
2. Nome: `processo_selecao_solides`
3. Descrição: `Etapas do processo interno Sólides de R&S`
4. Conteúdo (markdown):
   ```markdown
   # Processo de Seleção Sólides

   ## Etapas
   1. Triagem curricular (48h SLA)
   2. Aplicação do Profiler comportamental
   3. Entrevista com RH
   4. Entrevista técnica com gestor
   5. Proposta e checagem de referências

   ## Regras
   - Todo candidato faz Profiler antes da entrevista com gestor
   - Feedback obrigatório em até 5 dias úteis
   - Nunca contratar sem 2 referências validadas
   ```
5. Marcar `always_active = false`, `enabled = true`. Salvar.
6. ✅ Skill aparece em Minhas Skills

### C7.2 Habilitar em agente existente
1. Meus Agentes → **Recrutador Full-Stack QA** → **Editar**.
2. Step 5 → buscar `"processo"` → ✅ aparece a nova skill em "Suas skills"
3. Marcar checkbox → chip aparece no topo → Salvar.
4. Chat: `"Qual o processo padrão de seleção que devo seguir?"`
   - ✅ Cita as 5 etapas da skill custom

### C7.3 Skill via chat
1. Novo agente rápido (blank) chamado `Skill Author`.
2. Habilitar ferramenta `save_skill` no Step 4 (categoria Skills).
3. Chat: `"Cria uma skill chamada 'feedback_sanduiche' que ensine a estruturar feedback em: elogio + ponto de melhoria + reforço positivo. Sempre ativa."`
   - ✅ Agente chama `save_skill`
4. Confirmar em Minhas Skills → skill listada.

---

## Fase 8 — RAG populado pelo cliente (10 min)

### C8.1 Ingerir texto manualmente
1. Novo agente com template Blank → habilitar `rag_search`, `rag_ingest` no Step 4 → RAG ligado no Step 5.
2. Nome: `Base Interna QA`.
3. Chat:
   ```
   Ingere isso na base:
   Título: Política de Home Office Sólides
   A Sólides adota modelo híbrido: 3 dias presencial (ter/qua/qui) e 2 dias home.
   Exceções são analisadas pelo RH mediante justificativa via People Manager.
   Colaboradores com 100% home office precisam da aprovação do C-level.
   ```
   - ✅ Agente chama `rag_ingest`
4. Chat: `"Posso trabalhar 100% remoto?"`
   - ✅ Usa `rag_search` e cita a política

### C8.2 Base do template continua funcionando
1. Voltar no agente Profiler.
2. Chat: `"Cita perfil Comunicador com exemplo prático"`
   - ✅ RAG do glossário do template continua respondendo (não misturou com base do outro agente)

---

## Fase 9 — Editar agente (persistência) (5 min)

### C9.1 Edição não perde estado
1. Meus Agentes → escolher qualquer → **Editar**.
2. ✅ Wizard abre no Step 2 com todos os campos preenchidos, incluindo:
   - Ícone selecionado
   - Chips de skills habilitadas
   - Ferramentas marcadas
3. Trocar o **ícone** para outro (ex: **Rocket**).
4. Step 4: desmarcar 1 ferramenta.
5. Step 5: adicionar ou remover 1 skill via chip.
6. Salvar → editar de novo.
7. ✅ Todas as alterações persistiram.

### C9.2 Navegação do wizard
1. Ir até Step 5 → clicar bolinha "2" do Stepper → volta pra Identidade com dados preservados.
2. Editar campo → clicar bolinha "5" → ⚠️ observar se pula validação (comportamento atual: pula OK se steps já estão marcados como done).
3. Botão **Voltar** funciona em todos os steps exceto 1.

---

## Fase 10 — Canais (opcional, 10 min)

### C10.1 Habilitar canal
1. Editar agente Ponto → Step 6.
2. Marcar `slack` (ou outro canal disponível).
3. Salvar → Sidebar → **WhatsApp / Canais** → configurar credenciais e iniciar.
4. Se tiver bot de teste: enviar dúvida sobre ponto do Slack.
   - ✅ Agente responde no Slack usando skills do template

### C10.2 Fallback sem canal
- Se não tiver canal real: chat interno continua funcionando.

---

## Fase 11 — Regressão UX (5 min)

### C11.1 Skills não duplicam ferramentas
1. Wizard Step 5 → buscar por `"cron"`, `"memory"`, `"desktop"`, `"github"`.
   - ✅ **Nenhuma** dessas aparece como skill (elas eram legadas "sistema" e devem estar filtradas)
   - ❌ Se aparecerem, o filtro quebrou

### C11.2 Layout
1. Redimensionar janela de 1200px → 900px → 600px.
   - ✅ Cards passam de 3 col → 2 col → 1 col (não quebra)
2. Zoom 90% e 150% na Agent Store.
   - ✅ Nunca aparece scrollbar horizontal na página

### C11.3 Logo
1. Sidebar mostra logo Sólides **inteira** (sem clip nas laterais).
   - ⚠️ Se aparecer cortada, aumentar `max-w-[110px]` no `HubSidebar.tsx`

---

## Fase 12 — Cenários de erro (5 min)

### C12.1 Backend caído
1. `docker stop nanobot-gateway`
2. Wizard → tentar criar agente → ✅ toast de erro, dados do wizard **não** somem
3. `docker start nanobot-gateway` → tentar de novo → ✅ sucesso

### C12.2 Nome vazio
1. Wizard Step 2 → deixar nome vazio → **Próximo**
   - ✅ Botão desabilitado ou toast de erro

### C12.3 Chat com agente sem ferramenta
1. Criar agente blank **sem nenhuma ferramenta** marcada.
2. Chat: `"Salva na memória: teste"`
   - ✅ Agente responde que não tem essa capacidade (não chama tool inexistente)

---

## Checklist final antes da demo

- [ ] Fase 1 completa sem erros no console
- [ ] Pelo menos 3 templates Sólides funcionaram com skills + RAG
- [ ] Skill custom criada aparece corretamente no picker
- [ ] Ícone selecionado no wizard renderiza no chat header
- [ ] Layout responsivo até 600px sem quebrar
- [ ] Nenhuma skill "sistema" (`cron`, `memory`, `github`) aparece no picker
- [ ] Disclaimer jurídico aparece na primeira frase do agente Jurídico
- [ ] Ao editar agente, todos os campos persistem

---

**Bugs conhecidos a evitar reportar de novo**
- Layout empilhado em telas ultrawide: mitigado no commit atual com `2xl:grid-cols-4`
- Sidebar logo cortada: mitigado com `max-w-[110px] shrink-0`

**Se algo quebrar**
- Verificar `docker logs -f nanobot-gateway` primeiro
- `docker restart nanobot-gateway` resolve stale SQLite state em SSHFS
