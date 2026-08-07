---
name: varrer-demandas
description: Varre um rastreador buscando demandas de um tipo (bugs novos, requisições de suporte, débito técnico), pula as que já foram trabalhadas e resolve as novas até um teto por execução, cada uma terminando em pull request. Use numa rotina agendada, ou quando pedirem "veja as tarefas do tipo X e resolva".
metadata: {"nanobot":{"emoji":"🔁","category":"Código","importance":"core","provides":"Varredura autônoma de demandas, uma por PR, sem repetir trabalho","requires":{"integrations":["gitlab","github","azure_devops","mcp_azure_devops","jira"]}}}
---

# Varrer demandas e resolver o que é novo

Você roda sozinho, provavelmente de madrugada, provavelmente de novo amanhã. Duas coisas decorrem
disso e organizam tudo o que vem abaixo: **você não lembra do que fez ontem** — quem lembra é o
`work_ledger` — e **ninguém vai ler um relatório de 40 linhas**, então o que você fez precisa estar
no PR e no registro, não na sua resposta.

## 1. Liste as demandas do tipo pedido

Use a integração ativa do rastreador. No Azure Boards, WIQL por tipo e estado:

```
SELECT [System.Id] FROM WorkItems
WHERE [System.TeamProject] = 'Killer' AND [System.WorkItemType] = 'Bug'
  AND [System.State] = 'Novo' AND [System.AreaPath] UNDER 'Killer\Start 2.0'
```

No Jira, JQL equivalente. Ordene do mais antigo para o mais novo: uma demanda parada há duas semanas
importa mais que a de hoje.

## 2. Peça o claim antes de qualquer trabalho

```
work_ledger(action="claim", source="azure", external_id="41234", title="<título>")
```

- **Claim concedido** → é sua, siga.
- **"PULE"** → já está `done`, ou outra execução está com ela agora. Não trabalhe, não comente na
  demanda, passe para a próxima. Isto é o que evita abrir um segundo PR para o mesmo bug.

Faça o claim **item a item, na hora de trabalhar** — não reserve os doze de uma vez. Se você morrer
no meio, os que não começaram continuam livres para a próxima execução.

## 3. Respeite o teto por execução

**Resolva no máximo 2 demandas por execução**, e menos se cada uma for grande. Não é timidez: uma
demanda consome clone, delegação, testes, commit, push e PR, e a rotina tem teto de tempo. Estourar
o teto no meio da terceira demanda deixa branch empurrado sem PR — pior do que não ter começado.

Quando parar por causa do teto, diga quantas ficaram na fila. Elas serão as primeiras da próxima
execução, porque ainda não têm claim.

## 4. Resolva a demanda

Para cada demanda reservada, siga a skill `demanda-para-pr` — ela é o procedimento completo: ler a
demanda, achar a skill do projeto pela área/tags, `repo ensure`, branch, delegar ao `code_agent`,
rodar os testes, revisar o diff, commitar, push e abrir o PR.

Ao delegar, **preencha os campos do `code_agent`**, não só o `instruction`: `expected` (como fica o
comportamento correto), `verify` (o comando de teste que a skill do projeto declara) e `constraints`
(as convenções e armadilhas dali). É o que separa um PR aproveitável de um chute.

## 5. Feche o registro — sempre

Terminou com PR aberto:

```
work_ledger(action="complete", source="azure", external_id="41234",
            pr_url="<url do MR>", branch="fix/41234-...",
            note="causa, o que mudou, e o teste que rodou")
```

Não conseguiu:

```
work_ledger(action="fail", source="azure", external_id="41234",
            note="o que exatamente travou")
```

**Um item reservado e não fechado é o pior estado possível** — fica bloqueado até o claim expirar.
Se travou, registre a falha; uma execução futura tenta de novo, e o `note` diz por quê. Motivos
legítimos de falha: demanda sem informação suficiente, delegação que não autenticou, teste vermelho
que você não conseguiu resolver, repositório sem skill de projeto.

O `complete` **exige a URL do PR**. Se você não tem URL, você não concluiu — use `fail`. Não invente
uma URL para fechar o item.

## 6. Relate curto

No fim, três linhas: **quantas resolvidas** (com os links dos PRs), **quantas puladas** e por quê,
**quantas falharam** e o motivo. Quem quiser detalhe abre o PR ou consulta
`work_ledger(action="list")`.

## Regras que não se negociam

- **Nunca trabalhe um item sem claim concedido.**
- **Nunca `complete` sem PR.** Sem PR é `fail`.
- **Nunca merge**, nunca push no branch default, nunca force push.
- **Uma demanda, um branch, um PR.** Não junte duas demandas porque o arquivo é o mesmo.
- **Teste vermelho não vira PR.** Registre `fail` e siga.
- Se a demanda não tem informação para agir, comente nela pedindo o que falta, registre `fail` com
  esse motivo, e siga. Uma pergunta boa vale mais que um PR errado.
