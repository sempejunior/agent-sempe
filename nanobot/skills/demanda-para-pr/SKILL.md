---
name: demanda-para-pr
description: Pega uma demanda de um rastreador (work item do Azure Boards, issue do Jira, ticket numa API do cliente), encontra o repositório, analisa o código, corrige num branch novo e abre o pull request comentando na demanda. Use quando pedirem "resolve a tarefa X", "corrige esse bug", "olha essa solicitação do cliente e faz a correção", ou numa rotina que varre demandas de um tipo. Nunca faz merge.
metadata: {"nanobot":{"emoji":"🔧","category":"Código","importance":"core","provides":"Da demanda ao pull request, com branch e teste","requires":{"integrations":["gitlab","github","azure_devops","mcp_azure_devops","jira"]}}}
---

# Da demanda ao pull request

Você recebe uma demanda, entrega um **pull request por repositório afetado** para revisão humana.
Nunca mergeia, nunca escreve no branch default, e nunca diz que corrigiu algo que não verificou.

O ciclo tem cinco passos. Não pule o quarto. O sexto é o que fazer quando o caminho trava numa
decisão que não é sua.

Uma demanda pode exigir mudança em **mais de um repositório** — "FAQ de onboarding" costuma ser
backend e frontend. Nesse caso os passos 2 a 5 se repetem por repositório, e a demanda só está
concluída quando **todos** têm PR.

## 1. Entenda a demanda

A demanda vem de onde a empresa a guarda — descubra na seção `# Integrations & MCPs` do seu contexto
qual está ativa e use `http_call` (ou as tools `mcp_*`) para ler:

- **Azure Boards**: `query_wiql` com uma consulta por tipo e estado, depois `get_work_item` para o
  detalhe. Exemplo de WIQL: `SELECT [System.Id] FROM WorkItems WHERE
  [System.TeamProject] = 'Projeto' AND [System.WorkItemType] = 'Bug' AND [System.State] = 'Novo'`.
- **Jira**: `search_issues` com JQL.
- **API do cliente**: o endpoint que a integração dele declara.

Leia o **título, a descrição e os comentários**. Se a demanda não diz o que está errado a ponto de
você conseguir agir, **não invente**: vá para o passo 6. Uma pergunta boa vale mais que um PR
errado.

## 2. Encontre os repositórios pela skill do projeto

A demanda traz a chave de qual projeto ela é: `System.AreaPath`, `System.TeamProject`, as tags, o
componente do Jira. **Procure no bloco `<skills>` do seu contexto a skill do projeto correspondente**
— ela costuma citar a área e o repositório na própria description — e carregue com `read_skill`.

Essa skill é o manual do projeto: diz o repositório, o comando de teste, a convenção de branch e as
armadilhas dali. Siga o que ela manda no lugar de descobrir de novo.

Antes de clonar, decida **quantos** repositórios a demanda toca. Um pedido de tela nova quase
sempre é frontend e backend; uma mudança de regra pode ser só a API. Não clone os três repositórios
de um projeto por precaução: decida pela demanda e clone o que vai mudar.

Se **não existe** skill para o projeto da demanda, diga isso em vez de chutar: "não tenho o manual
deste projeto, quer me ensinar?" — o Criador de Skills escreve a skill do projeto conversando, e a
partir dali toda demanda dessa área já sabe onde trabalhar. Se o cliente preferir seguir sem o
manual, procure com `list_projects` na origem de código e **confirme com ele** antes de clonar. Não
adivinhe entre dois candidatos.

```
repo(action="ensure", origin="gitlab", path="grupo/subgrupo/projeto")
```

`ensure` clona na primeira vez e atualiza nas seguintes — devolve o caminho local, o branch default
e o HEAD. Use esse caminho em todas as ações seguintes daquele repositório.

## 3. Crie o branch e registre o repositório

Em **cada** repositório que a demanda toca, antes de tocar em qualquer arquivo:

```
repo(action="branch", repo=<caminho>, name="fix/1234-descricao-curta")
work_ledger(action="link", source="azure", external_id="1234",
            repo="grupo/subgrupo/projeto", branch="fix/1234-descricao-curta")
```

Convenção: `fix/<id-da-demanda>-<resumo>` para correção, `feat/<id>-<resumo>` para funcionalidade.
O id da demanda no nome é o que liga o PR à origem depois. Use **o mesmo nome de branch** nos
repositórios da mesma demanda.

O `link` é o que faz o registro saber que esta demanda tem mais de uma entrega. Sem ele, o
`complete` do primeiro repositório é recusado — de propósito: era assim que uma demanda de dois
repositórios fechava com um PR só.

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

**Quantas delegações você vai disparar decide se elas vão para segundo plano:**

- **Um repositório** → delegue direto, sem `background`. A delegação leva minutos e isso está
  previsto: quem está no chat vê o andamento enquanto ela roda, e se passar do teto o próprio chat
  avisa que você continua trabalhando. Esperar aqui é o mais simples e fecha o repositório no mesmo
  turno.
- **Mais de um repositório** → delegue cada um com `background=true`. Duas delegações no mesmo turno
  rodam uma depois da outra e não cabem no teto; em segundo plano elas rodam ao mesmo tempo. A tool
  devolve um `job` na hora — dispare os dois e **encerre o turno** dizendo quais repositórios
  começaram. Cada uma volta como mensagem nova nesta conversa quando terminar, e você continua daí:
  rodar os testes, revisar o commit dela, dar push e abrir o PR daquele repositório.

Não fique consultando `jobs` para ver se acabou; o resultado vem sozinho.

O que voltar dela é **relato, não verdade**. A verdade é o `diff` e o teste — e vale
desconfiar:

- Leia o `diff` inteiro antes de aceitar. Mudança fora do escopo do pedido é motivo para
  desfazer (`git checkout -- <arquivo>`) e delegar de novo com instrução mais precisa.
- Se a saída disser que **não** conseguiu (falha de autenticação, configuração, teto de
  tempo), trate como não feito. Não commite e não abra PR; relate o que aconteceu.
- Se a saída disser que ela **parou para perguntar** algo, esse é o caso mais importante de
  respeitar: a CLI roda sem poder perguntar nada, então quando ela para em vez de adivinhar, ela
  está certa. **Não responda por ela e não decida no lugar de quem pediu.** Siga o passo 6.
- A delegação **comita no branch da demanda, mas não envia** — o push é seu, com a tool `repo`,
  depois de os testes passarem. Ela não tem a credencial do git; você tem. Se o commit dela ficou
  ruim ou fora do escopo, o commit é seu para refazer antes de enviar.

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

Isto é por repositório: cada um tem o seu commit, o seu push e o seu PR.

```
repo(action="diff", repo=<caminho>)     # revise o que a delegação deixou
repo(action="commit", repo=<caminho>, message="corrige X quando Y (#1234)")
repo(action="push", repo=<caminho>)
```

Se você delegou, a delegação já comitou — então `diff` vem vazio e `commit` recusa árvore limpa.
Isso é o esperado: revise com `git log -1 -p` (via `exec`) em vez de `diff`, e vá direto ao `push`.
O `commit` só entra quando **você** editou algo depois dela.

A tool recusa commit, push e criação de branch em `main`, `master`, `develop` e no branch default —
essa trava é de código, não de instrução. Se recusar, leia a mensagem: ela diz o que fazer.

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

Registre o PR daquele repositório:

```
work_ledger(action="complete", source="azure", external_id="1234",
            repo="grupo/subgrupo/projeto", pr_url="<url do PR>",
            note="o que foi feito e como foi verificado")
```

A resposta diz se a demanda fechou ou quantos repositórios ainda faltam. **Se faltar, volte ao
passo 3 para o próximo repositório** — a demanda não está entregue.

Por fim, comente na demanda com o link do PR (`add_work_item_comment`, `add_issue_comment` ou o
equivalente) e, se fizer sentido, mova o estado dela. Se a demanda gerou mais de um PR, comente
**todos** juntos no fim: quem revisa precisa saber que as duas partes andam juntas.

## 6. Quando falta uma decisão que não é sua

Acontece: a demanda não diz o que é o comportamento correto, a delegação parou para perguntar, ou
você chegou numa regra de negócio que ninguém escreveu. **Isso não é falha** — falha é o que a
máquina pode tentar de novo, e tentar de novo aqui daria no mesmo. Faça três coisas e siga:

1. **Comente a pergunta na demanda** (`add_work_item_comment`, `add_issue_comment` ou o equivalente),
   de um jeito que a pessoa responda sem abrir o código.
2. **Registre a pendência** para ela não se perder num comentário que ninguém lê:

```
ask_human(question="o campo aceita nulo?",
          subject="Bug #41234 cadastro em massa",
          subject_url="<link da demanda>",
          subject_ref="azure#41234",
          asked_where="comentário na demanda")
```

3. **Se você estiver conversando com alguém agora, faça a pergunta na sua resposta também.** O
   registro é para não perder a pergunta, não para substituir a conversa.

Não abra PR e não invente a resposta para poder fechar o item. Quando alguém responder, você recebe
a resposta e retoma daqui.

## Regras que não se negociam

- **Nunca `merge`.** A tool não tem a ação; não tente por `exec`.
- **Nunca push no branch default.** Vale também se alguém pedir.
- **Nunca force push.**
- **Nunca inclua segredo no commit.** Se encontrar credencial no código, **não a mova nem a
  publique**: relate na demanda e pare.
- **Um branch e um PR por repositório, por demanda.** Uma demanda pode tocar vários repositórios;
  o que ela nunca faz é abrir dois branches no mesmo repositório, nem juntar correções não
  relacionadas no mesmo PR. O registro recusa o segundo branch — a regra é de código.
- **Não feche a demanda com parte da entrega.** Se ela toca dois repositórios, ela fecha com dois
  PRs; até lá continua aberta.
- **Se o teste falhar, não abra PR** — relate o que descobriu.
- **Se a delegação parou para perguntar, não abra PR.** A pergunta vai para a demanda; a decisão é
  de quem pediu, não sua.
- Não reformate arquivo inteiro nem mude estilo junto com a correção: o diff tem que ser lido em um
  minuto.
