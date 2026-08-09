# Passagem de bastão — agente de sustentação (demanda → PR)

> Cole este arquivo inteiro no início de uma conversa nova. Ele contém o estado real
> do trabalho, o que já foi provado, o que está quebrado e as decisões de produto que
> **não devem ser re-litigadas**.

## Contexto do produto

Projeto: **Sólides Agent Hub** (`/home/carlosjunior/Documentos/Projetos/agent-sempe`), fork do
nanobot virado plataforma multiusuário de agentes. **Leia `CLAUDE.md` primeiro** — ele tem as
regras de código que valem aqui (sem comentário inline, docstring só quando o nome não basta,
registries em vez de if-elif, fonte única de verdade, refactor-on-touch, sem emoji, sem shim de
compatibilidade).

O fluxo em questão está descrito em `docs/agente-sustentacao-autonoma.md`: um agente varre o board
do Azure, entende a demanda, acha o repositório pela skill de projeto, delega a escrita do código
ao Claude Code, roda os testes e entrega um **Pull Request** para revisão humana. **Nunca faz
merge.**

## O que foi construído (três incrementos, todos entregues e testados)

1. **Jobs em segundo plano** — `nanobot/jobs/` (`runner.py`, `delivery.py`, `resume.py`), migração
   v12 (tabela `jobs`), tool `jobs`, `code_agent(background=true)`. A conclusão de um job volta
   como **turno novo** na sessão de origem (`origin_channel`/`origin_chat_id`), não como valor de
   retorno.
2. **Pendências** — migração v13 (tabela `questions`), `nanobot/questions/service.py`, tool
   `ask_human`, estado `waiting` no `work_ledger`, página **Pendências** (`InboxPage.tsx`).
   Responder no painel retoma a conversa parada, pelo mesmo mecanismo do job.
3. **Claude Code como agente de código** — `CliSpec` em `nanobot/agent/tools/code_agent.py`,
   integração `claude_code` no catálogo, binário instalado sob demanda em
   `workspace/tools/claude_code/` (~290 MB, sobrevive a recriar o container).

**Tudo está sem commit.** Rode `git status` antes de qualquer coisa.

## Estado verificado do ambiente

- Integrações ativas: `azure_devops`, `mcp_azure_devops`, `gitlab`, `claude_code` (+ duas do Start).
- Agente do fluxo: **`agent_XXXXXXXXXXXX` ("Assistente do Gestor")**, modelo `<modelo>`,
  tools `repo`, `exec`, `code_agent`, `http_call`, skills `demanda-para-pr`, `varrer-demandas`,
  `projeto-backend/frontend/admin`.
- Credencial do Claude Code: **token de assinatura** (`claude setup-token`), vai como
  `CLAUDE_CODE_OAUTH_TOKEN`. O campo `api_key` (que ativaria `--bare`) está vazio.
- Board: projeto **`Projeto`**, área **`Projeto\Área do Time`**. O tipo de item chama-se **`Problema`**
  (em português). Repositórios no GitLab: `grupo/subgrupo/projeto-backend` (backend),
  `-front`, `-admin`.
- Demanda em teste: **41235** — *"Doc de onboarding (FAQ) ao colaborador após aprovação"*,
  História de Usuário, descrição de uma frase. Está `claimed` no `work_ledger`, com branch
  `feat/41235-onboarding-faq` criado em `projeto-backend` e `projeto-frontend`, árvore limpa.
  **Já tem 4 comentários reais do agente no board** — vale limpar.

## O que está PROVADO funcionando contra os sistemas reais

| Peça | Evidência |
|---|---|
| Credencial Azure | `list_projects`, WIQL na área, `get_work_item` |
| Comentar na demanda | **HTTP 200** |
| Clone pelo GitLab | os três repos |
| Delegação ao Claude | **9s, exit 0**, leu `package.json`, respeitou "não altere arquivos" |
| Skills de projeto | as três `projeto-*` carregadas por área |
| `work_ledger` | claim / wait / resume |
| Pendência → resposta → retomada | exercitado pelo próprio usuário no painel |
| Branch por demanda | nome correto, nos repos corretos |

## Dez defeitos já corrigidos (não refazer)

1. `add_work_item_comment` dava 400 — precisa de `api-version=7.1-preview.3` (`default_query` no
   endpoint).
2. `setup_steps` do Azure ensinavam PAT só de leitura; comentar exige **Read & Write**.
3. Duas skills builtin cravavam `mcp_azure_devops_*`; o nome real deriva do slug
   (`mcp_mcp_azure_devops_*`). Trocado por "consulte a seção `Integrations & MCPs`".
4. `skills_enabled` do agente apontava para `projeto-inexistente`, inexistente.
5. Credencial do GitLab criada mas integração não ativada (são dois passos).
6. `base_url` do GitLab continha o grupo → URL duplicada no clone.
7. Claude Code **recusa `bypassPermissions` rodando como root**. Trocado por
   `--permission-mode acceptEdits --allowedTools "Read Write Edit Glob Grep Bash"`.
8. `--allowedTools` é **variádico** e engolia o prompt. Agora o prompt vai por **stdin**
   (`CliSpec.prompt_via`), o que também tira o texto da demanda do `ps`.
9. O agente **reperguntava depois de receber latitude** ("tenha liberdade criativa"). Corrigido em
   `questions/service.py::_answer_prompt` e `nanobot/prompts/QUESTIONS.md`, com teste.
10. Responder uma pendência **travava o HTTP durante o turno inteiro** ("Enviando..." congelado).
    A retomada agora roda solta (`asyncio.create_task`), com teste que falha se voltar a bloquear.

**417 testes passando, `ruff` limpo, frontend compilando.**

## Decisões de produto já tomadas (não re-litigar)

- Token do GitLab, não Azure Repos. Agente é o Assistente do Gestor. Teste vai **até o PR aberto**,
  PR **normal** (não draft).
- A delegação **pode commitar**, mas **nunca** em `main`, `master`, `develop` ou no branch default
  — trava de código em `nanobot/agent/tools/branches.py`, aplicada no `repo` e no `code_agent`.
- A delegação **não dá push**: o push é do orquestrador, que tem a credencial do git. O CLI roda com
  bash liberado; dar-lhe o token ampliaria o raio de exposição.
- **Modelo sempre `sonnet`** nessas delegações (`--model sonnet` fixo no `CliSpec`).
- Pendência não expira sozinha (sumir com pergunta perde informação); existe `cancel` explícito.
- Credencial do Claude aceita **token de assinatura OU API key** — o campo preenchido decide.

## O QUE FALTA — e a direção que o usuário deu

### 1. Multi-repo por demanda (confirmado pelo usuário)

Uma demanda pode legitimamente exigir mudança em **um ou mais repositórios** (a 41235 precisa de
backend + frontend). Hoje `demanda-para-pr` e `work_ledger` assumem **um repo, um PR por demanda**
(`complete` exige uma única `pr_url`). Precisa suportar N repos → N PRs ligados à mesma demanda,
sem quebrar a regra de "um branch por demanda por repo".

### 2. Background NÃO pode custar a experiência de chat (direção nova e importante)

O usuário foi explícito:

> "A ferramenta é um chat com agentes ainda, n podemos matar a ferramenta. (...) isso n deveria
> matar as respostas no chat, a n ser quando é algo que solicitei um lote de demandas, mas o
> usuário deveria ser informado. Se for uma demanda, deveríamos conseguir ir dando feedback no chat
> e n ficar colocando só mensagens via comentarios ou nos itens pendentes, pois o chat está aberto."

Traduzindo em requisitos:

- **Uma demanda pedida no chat** → o agente deve dar **feedback progressivo no próprio chat**
  enquanto trabalha. Não relegar tudo a comentário no board e à caixa de pendências quando há
  alguém com o chat aberto.
- **Lote de demandas** (varredura) → aí sim segundo plano é adequado — **e o usuário deve ser
  avisado disso explicitamente**.
- Em nenhum caso o processamento longo pode matar a resposta do chat.

Contexto técnico para resolver: o turno do chat web tem teto de **180s**
(`_WEB_CHAT_TIMEOUT_S` em `web/server.py`) e a entrega do texto é **uma vez, no fim** (decisão
registrada no `CLAUDE.md`). Já existe um backlog exatamente sobre isso:
**`docs/backlog/08-feedback-de-progresso-no-chat.md`** — leia antes de desenhar.

### 3. Bugs abertos

- **A.** O agente chamou `code_agent` **sem `background=true`** num turno de chat e o teto de 180s
  matou a delegação no meio (`Chat timed out after 180s`). A skill manda usar; ele ignorou.
  Relacionado ao item 2 acima — resolver junto, não isolado.
- **B.** Ele disparou **duas delegações no mesmo lote** (front + backend). Além de casar com o item
  1, isso colide no log: `code_agent._log_path()` usa timestamp com precisão de **segundo**, então
  a segunda delegação **truncou o log da primeira** (log de 0 bytes). Precisa de milissegundo + um
  discriminador.
- **C.** Depois dessas duas delegações o turno **travou** — nenhum resultado persistido, nenhum
  processo `claude` vivo, nenhuma atividade. Diagnosticar.
- **D.** `PUT /api/integrations/{slug}` faz **upsert completo**: mandar `{"enabled": true}` zera
  `credential_id` e `system_integration_id` silenciosamente. Deve rejeitar corpo parcial.

## Como rodar e testar

```bash
# testes (o container só monta nanobot/, então copie tests/ antes)
docker cp tests/. nanobot-gateway:/app/tests/
docker exec nanobot-gateway python -m pytest tests/ -q
docker exec nanobot-gateway ruff check .
cd nanobot/web/frontend && npm run build

# reiniciar (todo save de .py já reinicia via watchmedo e derruba sessões abertas)
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart nanobot-gateway
```

**Dirigir o agente como se fosse o cliente** (é assim que se reproduz o fluxo):

```bash
# pelo chat de verdade (WebSocket) — mostra tool_hint, trace e o que chega DEPOIS do turno
docker cp scripts/ws_chat_probe.py nanobot-gateway:/app/scripts/
docker exec nanobot-gateway python /app/scripts/ws_chat_probe.py \
  <usuario> agent_XXXXXXXXXXXX web:<sessao> "<mensagem>" 900
```

Para passos isolados e rápidos, um **embed token** roda um turno síncrono por HTTP:
`POST /api/agents/{id}/embed` → `POST /embed/{token}/message` com `{"content": ..., "session_key": ...}`.

Acompanhar o que o agente faz:
```bash
docker logs nanobot-gateway --since 10m 2>&1 | grep "Tool call" | cut -c1-160
docker exec nanobot-gateway sh -c 'ls -lt /root/.nanobot/workspace/agents/<usuario>/agent_XXXXXXXXXXXX/logs/'
```

## Armadilhas conhecidas

- O container roda como **root** — Claude Code recusa `bypassPermissions` nesse caso.
- Nomes de tools MCP têm o slug embutido: `mcp_mcp_azure_devops_*`. Não crave nome em skill.
- Não existe endpoint REST para **mudar estado** de work item; só via MCP `update_work_item`.
- Segredos: nunca imprima credencial. Para editar um campo de credencial sem ver o token, decifre e
  recifre **dentro do container** (`ensure_master_key` + `decrypt`/`encrypt`).
- O `git` do repo alvo tem `develop` como branch **default** — a trava de branch protegido é
  essencial ali.

## Sugestão de ordem para a próxima sessão

1. Desenhar juntos o **feedback no chat** (item 2) — é decisão de produto e destrava A.
2. Multi-repo por demanda (item 1) — mexe em `work_ledger` e na skill `demanda-para-pr`.
3. Corrigir B (nome do log) e diagnosticar C.
4. Fechar o ciclo até o MR na 41235 e avaliar contra `docs/agente-sustentacao-autonoma.md`.
5. Limpar os 4 comentários de teste na demanda 41235.
