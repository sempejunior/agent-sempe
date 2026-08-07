---
name: demanda-para-pr
description: Pega uma demanda de um rastreador (work item do Azure Boards, issue do Jira, ticket numa API do cliente), encontra o repositório, analisa o código, corrige num branch novo e abre o pull request comentando na demanda. Use quando pedirem "resolve a tarefa X", "corrige esse bug", "olha essa solicitação do cliente e faz a correção", ou numa rotina que varre demandas de um tipo. Nunca faz merge.
metadata: {"nanobot":{"emoji":"🔧","category":"Código","importance":"core","provides":"Da demanda ao pull request, com branch e teste","requires":{"integrations":["gitlab","github","azure_devops","mcp_azure_devops","jira"]}}}
---

# Da demanda ao pull request

Você recebe uma demanda, entrega um **pull request** para revisão humana. Nunca mergeia, nunca
escreve no branch default, e nunca diz que corrigiu algo que não verificou.

O ciclo tem cinco passos. Não pule o quarto.

## 1. Entenda a demanda

A demanda vem de onde a empresa a guarda — descubra na seção `# Integrations & MCPs` do seu contexto
qual está ativa e use `http_call` (ou as tools `mcp_*`) para ler:

- **Azure Boards**: `query_wiql` com uma consulta por tipo e estado, depois `get_work_item` para o
  detalhe. Exemplo de WIQL: `SELECT [System.Id] FROM WorkItems WHERE
  [System.TeamProject] = 'Killer' AND [System.WorkItemType] = 'Bug' AND [System.State] = 'Novo'`.
- **Jira**: `search_issues` com JQL.
- **API do cliente**: o endpoint que a integração dele declara.

Leia o **título, a descrição e os comentários**. Se a demanda não diz o que está errado a ponto de
você conseguir agir, **não invente**: comente na demanda pedindo o que falta e pare. Uma pergunta
boa vale mais que um PR errado.

## 2. Encontre o repositório pela skill do projeto

A demanda traz a chave de qual projeto ela é: `System.AreaPath`, `System.TeamProject`, as tags, o
componente do Jira. **Procure no bloco `<skills>` do seu contexto a skill do projeto correspondente**
— ela costuma citar a área e o repositório na própria description — e carregue com `read_skill`.

Essa skill é o manual do projeto: diz o repositório, o comando de teste, a convenção de branch e as
armadilhas dali. Siga o que ela manda no lugar de descobrir de novo.

Se **não existe** skill para o projeto da demanda, diga isso em vez de chutar: "não tenho o manual
deste projeto, quer me ensinar?" — o Criador de Skills escreve a skill do projeto conversando, e a
partir dali toda demanda dessa área já sabe onde trabalhar. Se o cliente preferir seguir sem o
manual, procure com `list_projects` na origem de código e **confirme com ele** antes de clonar. Não
adivinhe entre dois candidatos.

```
repo(action="ensure", origin="gitlab", path="grupo/subgrupo/projeto")
```

`ensure` clona na primeira vez e atualiza nas seguintes — devolve o caminho local, o branch default
e o HEAD. Use esse caminho em todas as ações seguintes.

## 3. Crie o branch antes de tocar em qualquer arquivo

```
repo(action="branch", repo=<caminho>, name="fix/1234-descricao-curta")
```

Convenção: `fix/<id-da-demanda>-<resumo>` para correção, `feat/<id>-<resumo>` para funcionalidade.
O id da demanda no nome é o que liga o PR à origem depois.

## 4. Analise, corrija e **prove**

Explore com as ferramentas de arquivo e com `exec` (`grep -rn`, `ls`, ler testes existentes). Edite
com `edit_file` — mudança mínima que resolve o problema, no estilo do código que já está lá.

### Quando delegar a escrita

Se a tool `code_agent` estiver disponível, você pode entregar a escrita a um agente
especialista de terminal, que trabalha no repositório clonado:

- **Delegue** quando a mudança exige explorar o código: mais de dois ou três arquivos, um
  padrão que você precisa descobrir antes de imitar, ou uma correção onde a causa não está
  óbvia.
- **Não delegue** ajuste de uma ou duas linhas que você já localizou. Você faz mais rápido,
  mais barato, e com menos chance de mudança fora do escopo.

A instrução que você escreve é o que determina a qualidade do resultado. Escreva como
explicaria a um desenvolvedor que acabou de chegar: **o problema**, o **resultado esperado** e
**como verificar**. Cite os arquivos em `focus` quando já souber onde olhar.

```
code_agent(repo=<caminho>, instruction="...", focus=["calc/desconto.py"])
```

O que voltar dela é **relato, não verdade**. A verdade é o `diff` e o teste — e vale
desconfiar:

- Leia o `diff` inteiro antes de aceitar. Mudança fora do escopo do pedido é motivo para
  desfazer (`git checkout -- <arquivo>`) e delegar de novo com instrução mais precisa.
- Se a saída disser que **não** conseguiu (falha de autenticação, configuração, teto de
  tempo), trate como não feito. Não commite e não abra PR; relate o que aconteceu.
- A delegação **não commita nem envia** — isso continua seu, com a tool `repo`, depois de os
  testes passarem.

Depois **rode a verificação que o repositório oferece**, com `exec`: a suíte de testes, o lint, o
build. Descubra qual é (`package.json`, `pyproject.toml`, `Makefile`) em vez de supor.

- **Teste passou** → siga.
- **Teste falhou** → conserte e rode de novo, ou pare. **Não abra PR com teste vermelho.**
- **Não existe teste, ou o toolchain não está instalado** (Java, .NET, Go não vêm na imagem) → diga
  isso **explicitamente** na descrição do PR: "não verificado — sem suíte executável neste
  ambiente". O revisor precisa saber o que você não provou.

Se o teste que falha é o que revela o bug, escrever o teste primeiro e mostrá-lo passando depois é o
melhor PR que você pode entregar.

## 5. Commit, push e o pull request

```
repo(action="diff", repo=<caminho>)     # revise antes de commitar
repo(action="commit", repo=<caminho>, message="corrige X quando Y (#1234)")
repo(action="push", repo=<caminho>)
```

A tool recusa commit e push no branch default, e recusa árvore limpa. Se recusar, leia a mensagem —
ela diz o que fazer.

Abrir o PR é `http_call` na origem, porque isso é a única parte específica de fornecedor:

- **GitLab**: `create_merge_request` com `source_branch`, `target_branch` (o default), `title`,
  `description`.
- **GitHub**: `create_pull_request` com `head`, `base`, `title`, `body`.
- **Azure Repos**: `create_pull_request` com `sourceRefName` e `targetRefName` no formato
  `refs/heads/<branch>`.

A descrição do PR precisa ter, nesta ordem: **o que estava errado**, **o que você mudou e por quê**,
**como verificou** (comando e resultado, ou a declaração de que não verificou), e o **link da
demanda**. Um revisor deve conseguir decidir sem abrir o código.

**Se a escrita foi delegada, diga isso na descrição** — qual agente escreveu e que você revisou
o diff. Quem revisa precisa saber quanto do código passou por julgamento humano antes de chegar
ali.

Por fim, comente na demanda com o link do PR (`add_work_item_comment`, `add_issue_comment` ou o
equivalente) e, se fizer sentido, mova o estado dela.

## Regras que não se negociam

- **Nunca `merge`.** A tool não tem a ação; não tente por `exec`.
- **Nunca push no branch default.** Vale também se alguém pedir.
- **Nunca force push.**
- **Nunca inclua segredo no commit.** Se encontrar credencial no código, **não a mova nem a
  publique**: relate na demanda e pare.
- **Uma demanda, um branch, um PR.** Não junte correções não relacionadas.
- **Se o teste falhar, não abra PR** — relate o que descobriu.
- Não reformate arquivo inteiro nem mude estilo junto com a correção: o diff tem que ser lido em um
  minuto.
