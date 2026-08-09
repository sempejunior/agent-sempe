---
tipo: adr
status: aceita
data: 2026-08-08
decide: [sustentacao, storage]
substitui:
substituida_por:
---

# ADR-0003 — Uma demanda entrega em vários repositórios

## Contexto

O registro de demandas trabalhadas guardava `branch` e `pr_url` como colunas escalares, sob chave
única `(user_id, source, external_id)`. Isso codificava "uma demanda, um PR".

A realidade contradisse na primeira demanda séria: a 41235 ("FAQ de onboarding ao colaborador")
exige mudança no backend e no frontend. Com o modelo escalar, o segundo PR sobrescrevia o
primeiro em silêncio, e a demanda podia ser fechada tendo entregue metade.

A regra "uma demanda, um branch, um PR" existia como frase nas skills, e frase em prompt não é
garantia — o mesmo agente que recebia a instrução de usar segundo plano a ignorou no dia anterior.

## Decisão

A demanda passa a ter uma tabela filha `work_item_repos`, com índice único
`(work_item_id, repo)`. O claim continua sendo da **demanda** — é ele que impede duas execuções
de pegarem o mesmo item. Cada repositório afetado é declarado com a ação `link` no momento em que
o branch é criado, e concluído com `complete` por repositório. A demanda só chega a `done` quando
todo repositório declarado tem PR.

As colunas escalares `branch` e `pr_url` saem de `work_items`.

## Consequências

- A regra "um branch por demanda por repositório" virou índice único: o banco recusa o segundo
  branch, em vez de depender de o modelo lembrar.
- `complete` com um repositório que não foi declarado é recusado, e a mensagem manda declarar
  antes. Estrito de propósito — é o que impede fechar a demanda esquecendo a segunda metade.
- As duas skills (`demanda-para-pr` e `varrer-demandas`) tiveram de ser reescritas junto. Modelo
  de dados e doutrina que discordam deixam o agente com duas verdades.
- A varredura passa a contar custo por repositório, não por demanda: uma demanda de dois
  repositórios custa quase o dobro dentro do teto da rotina.
- Uma entrega parcial fica visível como parcial, em vez de virar um `done` mentiroso.

## Descartado

**Alargar a chave única para `(user_id, source, external_id, repo)`.** Seria menos código, e
quebra o significado do claim: dois processos poderiam reservar a mesma demanda para
repositórios diferentes e trabalhar em cima um do outro.

**`complete` acumulativo, sem declarar antes.** O agente iria acumulando PRs e decidiria sozinho
quando a demanda acabou. Nada garantiria que ele não esquecesse o segundo repositório — que é
exatamente o defeito que se está corrigindo.

**Manter as colunas escalares como "PR principal".** Um valor escalar ao lado da tabela filha é
uma segunda fonte de verdade, e ela desincroniza.

## Ver também

- [[capacidade-referenciada-nao-copiada]]
- [[trabalho-em-segundo-plano]]
