---
name: skill-de-projeto
description: Molde para escrever a skill de um projeto ou repositório — o manual que ensina um agente onde está o código, como rodar os testes, quais convenções seguir e como resolver os problemas típicos dali. Use quando o cliente quiser ensinar sobre os repos de uma equipe, ou preparar o agente para atender tasks de suporte e sustentação de um sistema.
metadata: {"nanobot":{"emoji":"📓","category":"Skills","importance":"core","provides":"O formato da skill que ensina um projeto ao agente"}}
---

# O molde da skill de projeto

Uma skill de projeto é o **manual de um repositório**. Quem a lê é um agente que acabou de receber
uma demanda e precisa saber onde trabalhar, como verificar o que fez, e o que já deu errado ali
antes. É o que separa "procura o repo e adivinha" de "sabe exatamente o que fazer".

Uma skill por projeto. Não junte dois repositórios numa skill: o agente carrega a errada e paga o
conteúdo de um projeto que não interessa.

## Antes de escrever: confirme com a API

Você tem `http_call`. Use antes de salvar, para não gravar um manual que aponta para o lugar errado:

- **O repositório existe?** `gitlab.get_project`, `github.get_repo`, ou o equivalente no Azure.
  Confirme o path exato como a API o devolve, não como o cliente digitou de memória.
- **A área/projeto do rastreador traz demandas?** `azure_devops.query_wiql` filtrando pelo
  `System.AreaPath` informado, ou `jira.search_issues`. **Mostre um ou dois itens reais** ao cliente
  e pergunte se é isso — um item de verdade na tela vale mais que qualquer confirmação verbal.
- **O que você não conseguir verificar, escreva como não verificado.** O comando de teste é o caso
  típico: conferir exigiria clonar e executar, o que você não faz. Registre o que o cliente disse e
  marque com a palavra **não verificado**. Nunca faça o manual parecer mais confiável do que é.

## As seções da skill que você vai escrever

### 1. Identificação — o que faz uma demanda ser deste projeto
A chave que o agente vai ter em mãos quando abrir a demanda: `System.TeamProject`,
`System.AreaPath`, tags, chave ou componente do Jira, palavras que aparecem no título.

**Isto também precisa estar na `description` da skill.** A description é o único campo que o agente
vê ao escolher entre as skills disponíveis — se ela não citar a área e o repo, ele não acha esta
skill a partir da demanda. Exemplo de description que funciona:

> Manual do projeto Start 2.0 — demandas da área `Killer\Start 2.0` no Azure Boards, código em
> `grupo/start-vibecode` no GitLab. Use ao atender bug ou requisição dessa área.

Curta e específica. Description longa é paga em todo prompt de todo agente que enxerga a skill.

### 2. Onde está o código
A origem (`gitlab`, `github`, `azure_devops`) e o path exato, como a API o confirmou. Se o projeto
tem mais de um repositório, diga **qual serve para quê** — front, API, migrações.

### 3. Como verificar
O comando de teste, o de lint, o de build. O que significa passar. Qual toolchain é necessário — e
se ele não existe na imagem do agente (Java, .NET, Go não vêm), diga isso aqui, porque muda o que o
agente pode prometer no PR.

### 4. Convenções
Padrão do nome de branch, formato da mensagem de commit, o branch alvo do MR/PR, quem revisa.

### 5. Exemplos: problema → como se resolve
A parte mais valiosa. Dois ou três casos reais, cada um em poucas linhas:

> **"Cliente não consegue lançar ponto retroativo"** — quase sempre é regra de data em
> `services/ponto/validacao.py`. Confirme a data do lançamento antes de mexer em qualquer coisa;
> já teve caso em que o erro estava no fuso, não na regra.

O que faz um exemplo útil é o **caminho até a causa**, não a descrição da tela. Peça ao cliente um
caso que ele já resolveu, e escreva o raciocínio dele.

### 6. Armadilhas
O que já quebrou, o arquivo gerado que ninguém edita à mão, a migração que não roda em máquina
local, o teste que falha por motivo conhecido e não é culpa da mudança.

### 7. Verificado em `<data>`
O que você confirmou por API, e **o que não** — nomeando cada coisa. Quem ler daqui a seis meses
precisa saber a idade da informação.

## Regras de custo

- **Description curta**, com a chave de identificação. É o índice, não o resumo.
- **Nunca marque skill de projeto como "Sempre no contexto"** (`always_active`). Conteúdo integral
  em todo prompt, para cada projeto — o oposto do desenho: a skill é lida quando a demanda chega.
- **Manual enxuto.** Cada turno em que o agente usa a skill ele a relê. Escreva o que muda a decisão
  e nada além.

## Ao terminar

Salve com `save_skill` e diga ao cliente **em qual agente habilitar** a skill — ela nasce sem estar
habilitada em nenhum, e o agente que atende demandas não a enxerga até isso ser feito. Se ele tem
mais projetos para ensinar, ofereça o próximo: uma skill por vez, cada uma com sua identificação.
