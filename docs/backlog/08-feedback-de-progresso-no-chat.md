# 08 — Feedback de progresso contínuo no chat

> **Status:** proposto, não iniciado. **Prioridade:** P2 (UX percebida do produto).
> **Tipo:** frontend + web/ws. Motivado por sessões reais em 10/07/2026 em que o usuário
> interpretou geração longa (ou fim prematuro de turno) como travamento.

## Problema (estado atual)

Durante um turno, o usuário só recebe sinal de vida em dois momentos: o balão skeleton inicial e
os chips de `tool_hint` quando o agente chama ferramentas (`web/server.py` `ws_chat` →
`on_progress`). Entre esses momentos — em especial durante gerações longas de texto do LLM (com
modelos de reasoning podem ser dezenas de segundos) — a tela fica estática e o usuário conclui que
"a IA travou". Episódios reais:

- Turno de análise de mercado (~70s, várias ferramentas + geração longa): tela parada entre chips.
- Resposta final entregue de uma vez, sem streaming — o usuário espera o texto "digitar".

Agravantes já mitigados no core (mas que a UX deve tornar visíveis, não invisíveis):

- Anúncio-sem-ação ("Vou levantar os projetos...") encerrava o turno; hoje o completion nudge
  reengaja o modelo (`agent/loop.py`), ao custo de uma chamada curta extra por turno de texto.
- Resposta final suprimida no web quando o agente usava a tool `message` (corrigido).

## Proposta

1. **Indicador persistente de atividade**: enquanto o turno está vivo (task em execução no
   `ws_chat`), mostrar estado contínuo no balão — "pensando…" durante chamadas ao LLM,
   "executando <ferramenta>…" durante tools — em vez de chips efêmeros. O backend já sabe os dois
   estados; falta emitir eventos de início/fim de fase pelo `on_progress` (ex.:
   `{"type": "phase", "phase": "thinking" | "tool", "tool": name}`).
2. **Streaming da resposta final** no canal web: hoje o texto chega de uma vez ao fim do turno
   (decisão registrada no CLAUDE.md de nunca vazar texto "de cozinha" — manter; streamar apenas a
   resposta final já decidida, ou os deltas do último assistant turn).
3. **Timeout visível**: se o turno estourar `_WEB_CHAT_TIMEOUT_S`, a UI já recebe erro; padronizar
   a mensagem com ação ("tentar de novo / dividir o pedido").
4. **Revisitar o custo do nudge universal**: medir latência/custo do nudge em turnos triviais
   (hoje +1 chamada curta por resposta de texto) e, se relevante, restringir por heurística barata
   (ex.: só nudgear quando o agente tem ferramentas habilitadas e a conversa não é small talk).
   **Insumo pronto (13/07):** o loop agora loga e persiste tokens/duração por turno em
   `sessions.metadata` (item 09 fase 0) — medir virou consulta; o mesmo dado alimenta a
   visibilidade de uso na UI (item 3 do upstream v0.2.2).

## Não-objetivos

- Streamar texto intermediário entre ferramentas (mantém a decisão "entrega uma vez, no final").
- Alterar o protocolo dos canais de chat externos (Telegram etc.) — é UX do chat web.

## Caminho de execução

1. Backend: eventos de fase no `_run_agent_loop` via `on_progress` (thinking/tool start-end).
2. Frontend (`ChatPage`): estado do balão dirigido por eventos de fase; fallback atual mantido.
3. Streaming da resposta final (SSE/ws deltas) atrás de flag.
4. Métrica simples de duração por fase no log estruturado (insumo para o item 03).
