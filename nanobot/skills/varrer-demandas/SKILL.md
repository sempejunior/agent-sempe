---
name: varrer-demandas
description: Varre um rastreador buscando demandas de um tipo (bugs novos, requisições de suporte, débito técnico), pula as que já foram trabalhadas e resolve as novas até um teto por execução, cada uma terminando em pull request nos repositórios que ela toca. Use numa rotina agendada, ou quando pedirem "veja as tarefas do tipo X e resolva".
metadata: {"nanobot":{"emoji":"🔁","category":"Código","importance":"core","provides":"Varredura autônoma de demandas, com PR por repositório afetado, sem repetir trabalho","requires":{"integrations":["gitlab","github","azure_devops","mcp_azure_devops","jira"]}}}
---

# Varrer demandas e resolver o que é novo

Você roda sozinho, provavelmente de madrugada, provavelmente de novo amanhã. Duas coisas decorrem
disso e organizam tudo o que vem abaixo: **você não lembra do que fez ontem** — quem lembra é o
`work_ledger` — e **ninguém vai ler um relatório de 40 linhas**, então o que você fez precisa estar
no PR e no registro, não na sua resposta.

## 1. Antes de pegar demanda nova, veja se alguém respondeu

Demanda parada esperando resposta vale mais que demanda nova: ela já tem trabalho investido e
alguém do outro lado esperando.

```
ask_human(action="list")
```

Para cada pendência em aberto que tenha `subject_url`, abra o assunto e **leia os comentários**. Se
a resposta chegou:

```
ask_human(action="answer", question_id=<id>, answer="<o que a pessoa respondeu>")
work_ledger(action="resume", source="azure", external_id="41234")
```

O `resume` é o que tira a demanda do estado de espera e reserva ela para você — sem ele o `claim`
continua recusando. Aí siga o fluxo normal a partir do passo 5. Se ninguém respondeu ainda, deixe
como está e passe para a próxima; não cobre, não repergunte.

## 2. Liste as demandas do tipo pedido

Use a integração ativa do rastreador. No Azure Boards, WIQL por tipo e estado:

```
SELECT [System.Id] FROM WorkItems
WHERE [System.TeamProject] = 'Projeto' AND [System.WorkItemType] = 'Bug'
  AND [System.State] = 'Novo' AND [System.AreaPath] UNDER 'Projeto\Área do Time'
```

No Jira, JQL equivalente. Ordene do mais antigo para o mais novo: uma demanda parada há duas semanas
importa mais que a de hoje.

## 3. Peça o claim antes de qualquer trabalho

```
work_ledger(action="claim", source="azure", external_id="41234", title="<título>")
```

- **Claim concedido** → é sua, siga.
- **"PULE"** → já está `done`, outra execução está com ela agora, ou ela está aguardando a resposta
  de alguém. Não trabalhe, não comente na demanda, passe para a próxima. Isto é o que evita abrir um
  segundo PR para o mesmo bug — e o que evita re-trabalhar o que está esperando resposta.

Faça o claim **item a item, na hora de trabalhar** — não reserve os doze de uma vez. Se você morrer
no meio, os que não começaram continuam livres para a próxima execução.

## 4. Respeite o teto por execução

**Resolva no máximo 2 demandas por execução**, e menos se cada uma for grande. Não é timidez: uma
demanda consome clone, delegação, testes, commit, push e PR **em cada repositório que ela toca**, e
a rotina tem teto de tempo. Uma demanda de dois repositórios custa quase o dobro de uma de um só —
conte assim. Estourar o teto no meio da terceira demanda deixa branch empurrado sem PR — pior do
que não ter começado.

Quando parar por causa do teto, diga quantas ficaram na fila. Elas serão as primeiras da próxima
execução, porque ainda não têm claim.

## 5. Resolva a demanda

Para cada demanda reservada, siga a skill `demanda-para-pr` — ela é o procedimento completo: ler a
demanda, achar a skill do projeto pela área/tags, decidir **quais repositórios** ela toca, e então,
em cada um: `repo ensure`, branch, `work_ledger link`, delegar ao `code_agent`, rodar os testes,
revisar o commit que ela fez, push e abrir o PR.

Ao delegar, **preencha os campos do `code_agent`**, não só o `instruction`: `expected` (como fica o
comportamento correto), `verify` (o comando de teste que a skill do projeto declara) e `constraints`
(as convenções e armadilhas dali). É o que separa um PR aproveitável de um chute.

**Aqui você delega sem `background`, um repositório de cada vez.** Ninguém está esperando na tela, e
a rotina tem tempo de sobra para a delegação inteira — esperar é o mais simples e mantém a demanda
fechada dentro da mesma execução. Se a demanda toca dois repositórios, resolva um, feche o PR dele,
e só então vá para o outro; disparar as duas de uma vez é o que faz a execução estourar o teto no
meio.

Se a demanda não tem informação para agir, ou se a delegação **parar para perguntar** algo em vez de
adivinhar, siga o passo 6 da `demanda-para-pr` e depois o passo 6 daqui. Não decida no lugar de quem
pediu para poder fechar o item.

## 6. Feche o registro — sempre

Terminou com PR aberto — um `complete` por repositório:

```
work_ledger(action="complete", source="azure", external_id="41234",
            repo="grupo/subgrupo/projeto", pr_url="<url do MR>",
            note="causa, o que mudou, e o teste que rodou")
```

A demanda fecha sozinha quando o último repositório declarado recebe o PR. Enquanto a resposta
disser que faltam repositórios, **a demanda não está entregue** — não relate como resolvida.

Falta a resposta de uma pessoa (a demanda não diz o que é o correto, a delegação parou para
perguntar, ninguém definiu a regra):

```
work_ledger(action="wait", source="azure", external_id="41234",
            note="aguarda a regra de nulo, perguntado na demanda")
```

Travou por algo que a máquina pode tentar de novo (delegação que não autenticou, teste vermelho que
você não resolveu, repositório sem skill de projeto):

```
work_ledger(action="fail", source="azure", external_id="41234",
            note="o que exatamente travou")
```

**A diferença entre `wait` e `fail` importa e não é cosmética.** `fail` diz "tente de novo amanhã";
`wait` diz "não adianta tentar até alguém responder" — e o `claim` respeita isso, então uma demanda
em espera não é re-trabalhada. Marcar como falha o que está esperando resposta faz a próxima
execução repetir o mesmo trabalho e chegar na mesma parede.

**Um item reservado e não fechado é o pior estado possível** — fica bloqueado até o claim expirar.
Feche sempre: `complete`, `wait` ou `fail`.

O `complete` **exige a URL do PR**. Se você não tem URL, você não concluiu. Não invente uma URL para
fechar o item.

## 7. Relate curto

No fim, quatro linhas: **quantas resolvidas** (com os links dos PRs), **quantas aguardando resposta**
e o que falta em cada uma, **quantas puladas** e por quê, **quantas falharam** e o motivo. As que
estão aguardando são as que precisam de gente — não deixe essa linha de fora. Quem quiser detalhe
abre o PR, ou consulta `work_ledger(action="list")` e `ask_human(action="list")`.

## Regras que não se negociam

- **Nunca trabalhe um item sem claim concedido.**
- **Nunca `complete` sem PR.** Sem PR é `fail`.
- **Nunca merge**, nunca push em `main`, `master`, `develop` ou no branch default, nunca force push.
- **Um branch e um PR por repositório, por demanda.** Não junte duas demandas porque o arquivo é o
  mesmo, e não abra dois branches no mesmo repositório para a mesma demanda.
- **Demanda com entrega parcial não é demanda resolvida.** Se ela toca dois repositórios e só um tem
  PR, ela continua aberta e assim deve ser relatada.
- **Teste vermelho não vira PR.** Registre `fail` e siga.
- **O que espera uma pessoa é `wait`, nunca `fail`.** Registrar espera como falha faz a próxima
  execução repetir o trabalho e bater na mesma parede.
- Se a demanda não tem informação para agir, registre a pendência com `ask_human`, comente na demanda
  pedindo o que falta, marque `wait` e siga. Uma pergunta boa vale mais que um PR errado.
