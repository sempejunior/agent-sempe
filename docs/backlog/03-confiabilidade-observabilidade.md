# 03 — Confiabilidade e observabilidade

> **Status:** proposto, não iniciado. **Prioridade:** P1.
> **Tipo:** robustez de runtime + operação. Ver contexto em [00](00-avaliacao-e-roadmap.md).

## Problema (estado atual)

- **LLM sem timeout explícito** (`litellm_provider.py:222`): só o caminho web tem guarda externa de
  180s; cron/canais podem travar no default do provider (~10min).
- **Tool-call sem timeout** (`loop.py:412`): um MCP travado paralisa o turno inteiro (só exec/http/
  web_fetch se autolimitam).
- **Sem retry/idempotência**: cron roda o job 1× (falhou, perdeu); crash no meio do turno deixa
  `messages`/`memories` parciais (commits incrementais) sem dedupe no replay.
- **Escritas multi-passo não atômicas**: `create_agent` grava skills + RAG + linha do agente em
  commits separados; falha no meio deixa estado inconsistente.
- **Shutdown frágil**: depende de `KeyboardInterrupt`; sob `docker stop` (SIGTERM) o `asyncio.gather`
  pode pendurar até o SIGKILL.
- **Rate limiter em memória por-processo** (`user_context.py:383`): perde no restart, não compartilha
  entre réplicas; o embed público divide a cota do **dono** sem throttle por visitante.
- **Observabilidade**: loguru no sink default (texto, sem JSON/rotação), **sem correlação
  request/tenant**, **sem métricas/tracing/error-tracking**, `/api/health` é stub (não checa DB/deps).

## Escopo

### Confiabilidade
- **Timeout explícito** no LLM (`acompletion(timeout=...)`) e **por tool-call** (`asyncio.wait_for`
  em `_tools.execute`); MCP com timeout próprio.
- **Retry + idempotência**: chave de idempotência por turno; cron com retry/back-off e marcação de
  execução; replay não duplica efeitos.
- **Transações atômicas** nas escritas multi-passo (uma transação por operação de negócio).
- **Graceful shutdown** por **SIGTERM** (fechar consumer/canais/mcp, drenar turnos em andamento);
  parar de usar `os._exit` no fluxo de serviço.
- **Rate limiter distribuído** (Redis, quando o 07 entrar) + **throttle por visitante/IP** no embed
  (não queimar a cota do dono).

### Observabilidade
- **Logging estruturado (JSON)** com `request_id` + `tenant_id`/`user_id` via `contextvar`,
  propagado pro agent loop e tools; níveis por ambiente.
- **Métricas** (Prometheus): latência de turno, chamadas de LLM/tool, erros, fila (com o 07).
- **Tracing** (OpenTelemetry) ligando request → turno → tool calls.
- **Error tracking** (Sentry) com scrubbing de PII (alinha com 06).
- **Health real**: `/health` (liveness) + `/ready` (checa DB e, com 03, Redis/fila).

## Reusa
- O timeout de 180s do web-chat e o modelo de turno em background-task (`server.py`) — estender pros
  outros caminhos.
- `RateLimiter` existente — trocar o backing por Redis e adicionar dimensão por visitante.

## Verificação
- LLM/tool travado **aborta** com erro claro (não pendura). Cron falho re-tenta e não duplica.
  `docker stop` encerra limpo dentro do grace. Logs carregam `request_id`+`tenant_id`; um trace
  cobre request→tool. `/ready` fica vermelho se o DB cair. Embed não consegue estourar a cota do dono.
