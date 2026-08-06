---
name: cruzar-entrega-e-pessoas
description: Cruza fatos de ENTREGA (kanban, board, sprints, WIP — de qualquer fonte que a empresa use: Azure DevOps, Jira, MCP, API própria) com fatos de PESSOAS (avisos de presença, pedidos de saída, feedbacks, ocorrências, perfil) e produz uma leitura de gestão sobre o time. Use quando pedirem "cruze o kanban com os avisos de presença", "quem está sobrecarregado?", "com quem eu preciso conversar essa semana?", "como está o time considerando entrega e RH".
metadata: {"nanobot":{"emoji":"🔀","category":"Geral","importance":"core","provides":"Leitura de gestão cruzando entrega com fatos de pessoas"}}
---

# Cruzar entrega e pessoas

Objetivo: uma leitura que **nenhuma das duas fontes dá sozinha**. O kanban mostra o que está travado;
a base de RH mostra o que está acontecendo com a pessoa. Junto, aponta onde um gestor deveria
conversar. Quem lê é um gestor decidindo onde agir — não um relatório para arquivar.

## 1. Descubra as fontes (agnóstico)

Não dependa de nenhuma fonte específica. Olhe a seção `# Integrations & MCPs` do seu contexto e use
o que existir:

**Entrega**
- `azure_devops_report` quando houver Azure DevOps: traz por pessoa os itens concluídos, story
  points, tipos, lead/cycle time, retrabalho — e `wip_por_pessoa`, o que está **em andamento com
  envelhecimento**. É a peça central: WIP velho é o sinal de travamento.
- Tools `mcp_*` de board, Jira ou similar, para detalhe de item específico.
- `http_call` numa API que a empresa cadastrou.

**Pessoas**
- `http_call` na base de RH da empresa. **Use só os `endpoint_key` que aparecem no seu contexto** —
  não presuma um endpoint que não está listado. Tipicamente: pedidos de saída antecipada (pendentes
  e já decididos) e a resolução de nome para pessoa.
- `rag_search` para políticas, PDI anterior, perfil comportamental.
- Se um sinal que você gostaria de ter não está exposto pela integração (por exemplo, o histórico de
  avisos de atraso e falta), **diga isso no relatório** em vez de contornar. A ausência de um sinal
  não é a ausência do problema.

Se um dos dois lados não existir, **diga isso e entregue o que der**, sinalizando a limitação. Meia
leitura declarada vale mais que uma leitura inteira inventada.

## 2. Junte por pessoa, explicitamente

O nome que vem do kanban é o nome de uma conta de ferramenta; o da base de RH é o de um vínculo
empregatício. **Eles não são a mesma coisa até você confirmar.**

1. Para cada pessoa relevante da entrega, resolva o nome na base de RH (`lookup_employee` ou
   equivalente) e guarde o `userId` do match.
2. Só afirme algo sobre uma pessoa quando o match foi confirmado.
3. **Quem não casou, você lista como não casado** — sempre, em uma seção própria do relatório
   ("Sem correspondência na base de RH"), com o nome como aparece na ferramenta de entrega. Essa
   seção é **obrigatória mesmo quando é a maioria** das pessoas, e especialmente quando é: uma lista
   que esconde os não-casados parece completa e não é. Nunca inferir vínculo por semelhança de nome.

## 3. Leia, não despeje

Cada número precisa de um "e daí": o que indica, comparado a quê, e o que fazer. Por pessoa:

- **Entrega**: o que concluiu no período, o que está em WIP e **há quanto tempo**.
- **Pessoas**: avisos e pedidos no mesmo período, feedbacks recebidos.
- **Leitura**: o que a combinação sugere, em uma ou duas frases.
- **Ação sugerida**: uma conversa, uma redistribuição, um acompanhamento — algo que o gestor faça
  amanhã.

Priorize: quem tem WIP envelhecido **e** eventos de presença recentes vem primeiro; depois quem tem
só um dos dois; quem não tem nenhum sinal não precisa aparecer em detalhe.

## 4. Entregue como página

Use `publish_report` (ou `publish_page` quando quiser um layout livre) e entregue o link. Uma tabela
por pessoa com as colunas acima, mais um bloco de destaques no topo com os 2-3 casos que merecem
conversa. Deixe explícito o período analisado e as fontes usadas.

## Guardrails (diga em voz alta no resultado)

- WIP alto somado a avisos de presença é **sinal para conversar**, não evidência de desempenho e
  jamais base para medida disciplinar. Escreva isso no relatório, não só no chat.
- **Nada de inferência sobre saúde, vida pessoal ou motivo de falta.** Um aviso de falta é um fato de
  comunicação; a causa não é sua para interpretar.
- Amostra pequena se declara pequena. Duas semanas de dados não sustentam conclusão sobre uma pessoa.
- Não use esta leitura para ranquear pessoas nem para alimentar decisão de promoção ou desligamento —
  se pedirem isso, explique o limite e ofereça o caminho certo (análise de desempenho com critérios
  acordados, PDI).
- Não invente métrica que a fonte não deu. Se a ferramenta não expõe envelhecimento de WIP, diga que
  não expõe.
