---
tipo: adr
status: aceita
data: 2026-08-09
decide: [core, processo]
substitui:
substituida_por:
---

# ADR-0001 — O núcleo do agente é zona congelada

## Contexto

O produto é um fork de um motor de agente de usuário único, virado plataforma multiusuário. O
núcleo — loop, contexto, sessão, provider, registro de ferramentas — é executado por **todo
agente de todo cliente em todo turno**, e é também a parte que mais custa re-sincronizar com o
upstream.

A pressão para mexer nele é constante e sempre bem-intencionada: quase todo pedido de capacidade
nova tem uma versão "rápida" que é um `if` no loop ou um campo a mais no contexto. Essa versão é
mais curta de escrever e cobra depois — o loop não tem teste que o percorra inteiro, então o erro
aparece em produção, para todos os clientes ao mesmo tempo.

Ao mesmo tempo, congelar o núcleo por completo seria mentira: nesta mesma semana um defeito de
núcleo destruiu trabalho real — o teto de turno cancelava uma delegação de código em andamento,
sem persistir nada.

## Decisão

O núcleo é zona congelada: capacidade nova entra pelas bordas — ferramenta, skill, integração,
template ou canal —, nunca por alteração do loop, do contexto ou da sessão.

Mudança no núcleo acontece em dois casos, e só neles: **defeito comprovado** e **mudança que o
usuário pediu explicitamente conhecendo o alcance**. Nos dois, a mudança entra com teste que
falha antes e passa depois, e escopo limitado ao defeito.

## Consequências

- Capacidade nova custa mais caro no primeiro dia: às vezes é preciso inventar a borda antes de
  usá-la, em vez de estender o meio.
- Algumas coisas ficam impossíveis de fazer "direito" sem tocar no núcleo, e vão esperar. Isso é
  aceito: ficar sem a funcionalidade é mais barato que quebrar todos os clientes.
- A dívida do núcleo fica visível em vez de diluída. O que dói e não pode ser mudado agora vira
  item no `docs/backlog/09-evolucao-agent-loop.md`.
- Quem revisa ganha um critério objetivo: um diff que toca `agent/loop.py` sem teste novo é
  recusado sem discussão de mérito.
- O custo de re-sincronizar conceitos do upstream para de crescer.

## Descartado

**Liberar mudanças no núcleo com revisão mais rigorosa.** Revisão não pega o que o loop tem de
pior, que é comportamento sob concorrência e sob erro — os dois defeitos mais recentes (turno
cancelado, log de delegação sobrescrito) passariam por qualquer leitura de código atenta. Só
apareceram rodando contra sistema real.

**Congelar de verdade, sem exceção.** Deixaria o defeito do teto de turno em pé, que é
exatamente o tipo de coisa que só o núcleo pode consertar. Regra que obriga a conviver com dano
conhecido é ignorada na primeira urgência, e aí não sobra regra nenhuma.

**Extrair o núcleo para uma biblioteca versionada.** Resolveria de forma mais forte, e é caro
demais para o momento: exigiria estabilizar interfaces que ainda estão mudando por causa do
multiusuário. Fica como possibilidade quando o desenho parar de se mover.

## Ver também

- [[nucleo-do-agente]]
- [[zonas-de-mudanca]]
- [[proposta-00-regras-zonas-de-mudanca]]
