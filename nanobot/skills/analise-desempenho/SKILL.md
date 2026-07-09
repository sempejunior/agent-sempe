---
name: analise-desempenho
description: Produz uma análise de desempenho rica, em nível de gestão, de um time e/ou de pessoas — com gráficos, tipos de demanda, tempo por etapa, tamanhos, tendência mensal e leitura interpretada (forças, riscos, recomendações). Use quando pedirem "análise de desempenho", "como está o time/fulano", "avaliação do time", ou quando um relatório de entrega precisar virar leitura de gestão. Fonte de dados agnóstica; a entrega padrão é uma página navegável.
metadata: {"nanobot":{"emoji":"📈","category":"Geral","importance":"core","provides":"Análise de desempenho interpretada, por time e por pessoa"}}
---

# Análise de desempenho (nível gestão)

Objetivo: transformar dados de entrega em uma **leitura de gestão** — não um despejo de números.
Quem lê é um gestor decidindo onde agir. Cada número precisa de um "e daí?": o que ele indica,
comparado a quê, e o que fazer a respeito.

## 1. Colete os dados (fonte agnóstica)

Descubra e use o que houver: integrações MCP (Azure DevOps, Jira, Databricks, bancos de
dados...), tools de relatório, `http_call` em APIs configuradas, RAG, arquivos do workspace ou
dados que o usuário colou. Adapte as dimensões da análise ao que a fonte oferece. Exemplo: se a
fonte for Azure DevOps, `azure_devops_report` já traz por pessoa itens, story points, tipos,
tamanhos, lead/cycle, tempo por etapa (`etapas_dias`), retrabalho e itens por mês; do projeto,
`por_mes`, `por_sprint` e WIP com aging. Se faltar uma dimensão em qualquer fonte, diga isso na
página — nunca preencha com suposição.

## 2. O que uma análise rica contém

**Visão do time** (sempre primeiro):
- Tendência mensal de entrega (itens e SP) — gráfico de colunas por mês, com leitura: aceleração,
  queda, sazonalidade, pico e provável causa.
- Distribuição por tipo de demanda (história, débito técnico, falha, habilitador...) — barras +
  leitura: o time está construindo produto ou apagando incêndio?
- Previsibilidade: carryover por sprint, itens sem estimativa — leitura: o planejamento é confiável?
- Saúde do WIP: total, não atribuídos, aging — leitura: sobrecarga, dispersão, bloqueio.

**Por pessoa** (uma seção por pessoa, com menu de âncoras):
- Volume e densidade: itens, story points, tamanho das demandas (P/M/G) — quem pega demanda
  grande e quem fatia; compare com a mediana do time, não só o absoluto.
- Perfil de demanda: tipos que a pessoa mais atende — especialista ou generalista? Está presa em
  sustentação?
- Fluxo: lead vs cycle (a diferença ≈ tempo em fila) e **tempo por etapa** (`etapas_dias`:
  desenvolvimento, code review, teste...) — barras + leitura: onde o trabalho dela empaca.
- Qualidade: retrabalho, reaberturas, defeitos — em % do volume dela, não só o número bruto.
- Ritmo mensal (`meses`) — constância vs picos; cruzamento com carryover.
- WIP atual e aging — está afogada agora?

**Síntese** (fecha a análise):
- 3-5 leituras do time (forças e riscos, com evidência).
- Por pessoa: 1 força + 1 risco/gap + 1 recomendação acionável para o gestor.
- Hipóteses de causa marcadas como hipótese, não como fato.

## 3. Regras de interpretação

- **Todo gráfico tem leitura**: 1-2 linhas ao lado dizendo o que aquilo significa e o que fazer.
- **Compare para significar**: número da pessoa vs mediana do time; mês vs média do ano.
- Volume ≠ valor: alto volume com retrabalho alto é sinal de dispersão, não de produtividade.
- Não rotule pessoas; descreva padrões de trabalho observáveis e evidenciados.
- Dado sensível (LGPD): a análise é para gestão responsável, nunca para exposição ou punição.

## 4. Entrega

Publique com **`publish_report`** (ela renderiza o visual — menu lateral, cards, gráficos —
você só fornece o conteúdo). Estrutura de referência das seções:
1. `overview` — visão do grupo: cards de totais, `columns` com a tendência temporal, `bars` de
   distribuições, `table` comparativa — cada bloco com `reading`.
2. Uma seção por pessoa (`id: "p-<slug>"`) — cards dela, `bars` de tipos/tamanhos/etapas,
   `columns` do ritmo dela, e um bloco `text` com a leitura (força, risco, recomendação).
3. `sintese` — blocos `text` com as leituras do time e recomendações ao gestor.

Preencha `reading` em todo bloco de dado — é onde mora a análise. Devolva o link como link
markdown. Use `publish_page` (com `read_skill("criar-paginas")`) apenas se o usuário pedir um
layout que fuja desse padrão. Se o pedido incluir PDIs, siga com `read_skill("montar-pdi")` na
mesma resposta — a análise vira a base de evidências do PDI.
