---
tipo: adr
status: aceita
data: 2026-08-09
decide: [produto, chat]
substitui:
substituida_por:
---

# ADR-0004 — O histórico pertence à pessoa, e o agente segue a conversa

## Contexto

Não havia lista de conversas na tela. As sessões eram carregadas no login, na troca de agente e
depois de cada turno, e nenhum componente as renderizava — dado morto no estado do frontend.

Reabrir uma conversa também não mostrava o que o agente tinha feito: o endpoint devolvia apenas
mensagens de `user` e de `assistant` **sem** `tool_calls`. Na conversa da demanda 41235 isso
significava descartar 63 chamadas de ferramenta que estavam gravadas no banco desde sempre.

A primeira versão escopou a lista pelo agente selecionado, seguindo o resto da API. Na prática
escondia a maior parte do histórico da pessoa: das 46 conversas dela, apareciam 7, e qual conjunto
aparecia dependia de um dropdown.

## Decisão

O histórico é da pessoa e cruza todos os agentes dela. Cada conversa mostra qual agente a
conduziu, e a lista tem filtro por agente. **Abrir uma conversa seleciona o agente dela** — dentro
de uma conversa gravada não se troca de agente; para falar com outro, começa-se uma conversa nova.

A busca de mensagens deixa de depender do agente no cabeçalho e resolve a conversa entre os
agentes do usuário. O que continua barrado é atravessar **usuário**.

O endpoint de mensagens para de filtrar: devolve `tool_calls`, `tool_call_id`, `name` e
`timestamp`, e a tela mostra por turno, colapsado, o que o agente fez.

## Consequências

- Conversa de agente excluído continua no histórico, com o nome real marcado como excluído. Apagar
  o agente não apaga o que foi conversado.
- O isolamento passa a ser por usuário, não por agente. É uma superfície a menos e um teste a
  mais: existe teste explícito de que outra pessoa não lê nem lista a conversa.
- O limite gravado de resultado de ferramenta subiu de 500 para 4000 caracteres. Guardava-se o
  argumento inteiro da chamada (1,1 MB no banco) e jogava-se a resposta fora — assimetria
  indefensável para auditoria. Custo estimado: alguns MB.
- Auditoria mostra ordem e hora do turno, **não** duração por ferramenta: todas as mensagens de um
  turno são gravadas juntas e compartilham o horário.
- Dois testes que cravavam a regra anterior (conversa de um agente não servida a outro) foram
  substituídos, não adaptados.

## Descartado

**Manter a lista escopada pelo agente ativo.** É coerente com o resto da API e esconde o
histórico da pessoa atrás de um dropdown. Foi implementado e derrubado no mesmo dia.

**Permitir trocar de agente dentro de uma conversa gravada.** A conversa foi conduzida por um
agente, com as ferramentas e o prompt dele; continuar com outro produz um histórico que nenhum
dos dois teria produzido.

**Guardar o resultado de ferramenta inteiro.** Auditoria perfeita, e um único `exec` com saída
grande grava megabytes por turno no mesmo banco que serve o chat.

## Ver também

- [[entrega-unica-no-fim-do-turno]]
- [[agente-e-instancia-independente]]
