# 09 — Evolução do agent loop

> **Status:** fase 0 entregue (13/07/2026); frente 6 parcial; frentes 1-5 e 7-8 não iniciadas.
> **Prioridade:** P2 (1 e 3 tocam casos de uso Sólides diretamente; 2 e 4 são pré-escala).
> **Tipo:** arquitetura do core. Origem: revisão do loop + análise das releases do nanobot
> upstream desde o fork (v0.1.4 → v0.2.2, fev–jun/2026) + varredura de mercado.

## Contexto

O fork sincronizou com o upstream pela última vez em 04/03/2026. Desde então o upstream evoluiu o
core em direções que este produto precisa (goal mode, AutoCompact, fallback de modelos,
confiabilidade de longa duração), e o mercado consolidou padrões (tool calls paralelas, context
engineering com orçamento de tokens, subagentes de primeira classe, checklist persistida para
tarefas longas). Como o fork divergiu estruturalmente (SQLite multi-tenant vs filesystem
single-user), nada aqui é merge direto — são reimplementações do conceito.

**Fase 0 (entregue):** retry/backoff + erro tipado no provider (`ProviderError`; erro de LLM não
vira mais resposta), timeout na chamada do LLM (`providers.request_timeout_s`, default 120s) e por
tool call (180s), tool calls independentes em paralelo (`ToolRegistry.execute_calls`,
`Tool.parallel_safe`), contabilidade de tokens por turno (log estruturado +
`sessions.metadata.token_usage`).

## Frentes

### 1. Goal mode para tarefas longas (conceito do upstream v0.2.0)

**Problema:** o único mecanismo de persistência de intenção é o completion nudge ("releia o
pedido"). Pedidos multi-parte ("relatório da equipe + PDI por pessoa") dependem do modelo se
lembrar do pedido inteiro sob pressão de contexto; não há decomposição nem checklist.
**Proposta:** tool `long_task` marca a conversa com um objetivo sustentado (+ checklist de etapas);
o objetivo ativo é espelhado no Runtime Context de todo turno (sobrevive a compactação e cadeias
longas de ferramentas) até `complete_goal`. Timeout de turno alarga automaticamente com goal ativo.
**Caminho:** estado do goal em `sessions.metadata`; injeção no `_build_runtime_context`
(`agent/context.py`); tools novas registradas via `build_tool_registry`; UI mostra goal ativo no
header do chat.

### 2. Concorrência dos canais

**Problema:** `AgentLoop.run()` é um consumidor serial único (`agent/loop.py`) — um turno lento de
UM cliente no Telegram bloqueia todos os tenants de todos os canais. O web chat já roda turnos como
tasks concorrentes; as duas metades do produto têm modelos opostos.
**Proposta:** turnos do bus como tasks concorrentes com limite por usuário (semáforo), mantendo
serialização por sessão (mensagens do mesmo chat em ordem).
**Caminho:** `run()` despacha para pool; lock por session_key; requer a frente 3 do item 03
(timeouts, já parcialmente coberto pela fase 0).

### 3. Subagentes de primeira classe

**Problema:** subagentes rodam com config GLOBAL do servidor, não a do usuário/agente solicitante
(`agent/loop.py` constrói `SubagentManager` uma vez com config do processo) — em multiuser é
provider/modelo/ferramentas errados. Sem limite de concorrência, sem registro, sem cancelamento;
reinício do processo perde tasks em voo silenciosamente.
**Proposta:** subagente herda o `UserContext` do solicitante (provider, modelo, tools habilitadas),
cap de concorrência por usuário, registro em DB (tabela de tasks com status), API de
status/cancelamento, anúncio de resultado como hoje.
**Mercado:** subagentes paralelos com especialização (prompt/modelo/tools próprios) são o padrão
2026 (Claude Code, Codex, Devin).

### 4. Orçamento de tokens + AutoCompact (conceito do upstream v0.2.1)

**Problema:** janela de histórico é por contagem de mensagens (`memory_window`), sem contabilidade
de tokens; resultado de ferramenta entra INTEIRO no contexto vivo (pode estourar a janela do
modelo), mas é truncado a 500 chars ao persistir (`_TOOL_RESULT_MAX_CHARS`) — o modelo vê uma coisa
neste turno e outra no seguinte. Estouro de contexto hoje vira `ProviderError`
(`context_window_exceeded`) sem recuperação.
**Proposta:** usar o `token_usage` da fase 0 para (a) disparar consolidação por tokens e não por
contagem, (b) compactar automaticamente ao se aproximar do limite do modelo (AutoCompact), (c)
truncar resultados grandes de ferramenta ANTES de ir ao modelo com o mesmo limite usado na
persistência, eliminando a assimetria; (d) retry pós-compactação quando `context_window_exceeded`.

### 5. `fallback_models` por agente (conceito do upstream v0.2.0)

**Problema:** endpoint primário instável derruba o turno mesmo com retry (ex.: indisponibilidade
do modelo, não da rede).
**Proposta:** lista opcional `fallback_models` no `agent_config`; quando `ProviderError` com
`retryable=True` esgota as tentativas, o loop tenta o próximo modelo da lista antes de desistir.

### 6. Cron/heartbeat multi-tenant confiáveis (conceito do upstream v0.2.1)

**Parcialmente entregue (13/07/2026):** o `on_cron_job` do gateway não passava user/agente — jobs
criados na UI executavam sem contexto (completavam em 2ms sem efeito); corrigido em
`cli/commands.py` com roteamento igual ao do web server.
**Problema (restante):** job de cron que falha não tem retry (one-shot falho é perdido); erro no
cálculo do próximo run desabilita o job silenciosamente; heartbeat é UM por processo lendo
`HEARTBEAT.md` do filesystem — não existe heartbeat por agente/tenant.
**Proposta:** retry com backoff e idempotência por execução; falha de agendamento vira alerta, não
desabilitação silenciosa; heartbeat vira job de cron por agente (como o upstream fez), com
definição no `agent_config`.

### 7. Cancelamento e steering de turno

**Problema:** não há como o usuário parar um turno em andamento (só o timeout de 180s do web);
cancelamento no meio pode deixar sessão/memória parcialmente salvas.
**Proposta:** botão "parar" no chat web (cancela a task do turno com salvamento do parcial);
mensagem nova do usuário durante turno ativo opcionalmente interrompe e reorienta (steering).

### 8. Carregamento dinâmico de ferramentas

**Problema:** com integrações MCP o catálogo passa fácil de 40–50 tools por agente; pesquisa de
mercado mostra que a precisão de escolha do modelo degrada bem antes disso (5 tools bem escopadas >
50 no contexto).
**Proposta:** selecionar por turno um subconjunto relevante (por embedding das descrições ou
grupos por capacidade), mantendo um conjunto-base sempre presente. Ganho duplo: escolha melhor e
menos tokens de definição por chamada.

## Ordem sugerida

1 e 3 primeiro (casos de uso Sólides: tarefas longas de RH e delegação), depois 2 e 4
(pré-requisitos de escala), 5–8 oportunísticos. As frentes 2 e 6 têm dependências no item
[03](03-confiabilidade-observabilidade.md); a 4 consome o `token_usage` da fase 0.

## Não-objetivos

- Re-litigar decisões documentadas: entrega única no final do turno (CLAUDE.md), mecânica do nudge
  (recém-calibrada), estratégia de cache_control.
- Merge literal do upstream — a divergência estrutural torna isso inviável; portamos conceitos.
