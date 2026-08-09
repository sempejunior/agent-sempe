---
tipo: conceito
data: 2026-08-09
tags: [core, arquitetura]
---

# Núcleo do agente

O núcleo é o pedaço de código que todo agente de todo cliente executa em todo turno: o loop
(`agent/loop.py`), a montagem de contexto (`agent/context.py`), a sessão (`session/manager.py`),
a camada de provider (`providers/`) e o registro de ferramentas (`agent/tools/registry.py`).

Importa distinguir isso do resto porque o raio de dano é diferente por natureza. Uma ferramenta
nova quebra quem a habilitou. Uma linha errada no loop quebra todo mundo ao mesmo tempo — todos
os agentes, todos os canais, todas as rotinas — e quebra em produção antes de quebrar em teste,
porque o loop é o caminho que nenhum teste percorre inteiro.

O núcleo tem outra propriedade: ele é o que o fork herdou do upstream e o que mais custa
re-sincronizar. Quanto mais ele diverge por conveniência local, mais caro fica trazer qualquer
conceito novo de lá.

**Quando isto se aplica:** ao decidir onde encaixar uma capacidade nova. A resposta quase sempre
é uma das bordas — ferramenta, skill, integração, template —, e a borda existe justamente para
absorver o pedido sem tocar no meio.

**Quando não se aplica:** quando o defeito *é* do núcleo. Aí mexer é o único conserto honesto, e
a diferença está no processo, não na permissão — muda com teste que falha antes e passa depois,
e a mudança é do defeito, não do escopo em volta dele. O teto de turno que cancelava trabalho
([[ADR-0002-teto-do-turno-avisa-em-vez-de-cancelar]]) foi exatamente esse caso.

## Ver também

- [[zonas-de-mudanca]]
- [[ADR-0001-nucleo-do-agente-e-zona-congelada]]
- [[capacidade-referenciada-nao-copiada]]
