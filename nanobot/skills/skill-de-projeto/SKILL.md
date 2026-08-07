---
name: skill-de-projeto
description: Molde para escrever a skill de um projeto ou repositório — o manual que ensina um agente onde está o código, como rodar os testes, quais convenções seguir e como resolver os problemas típicos dali. Use quando o cliente quiser ensinar sobre os repos de uma equipe, ou preparar o agente para atender tasks de suporte e sustentação de um sistema.
metadata: {"nanobot":{"emoji":"📓","category":"Skills","importance":"core","provides":"O formato da skill que ensina um projeto ao agente"}}
---

# O molde da skill de projeto

Uma skill de projeto é o **manual de um repositório**. Quem a lê é um agente que acabou de receber
uma demanda e precisa saber onde trabalhar, como verificar o que fez, e o que já deu errado ali
antes. É o que separa "procura o repo e adivinha" de "sabe exatamente o que fazer".

**Uma skill por repositório.** Não junte dois repositórios numa skill, e não escreva uma skill "do
time": o agente carrega a errada e paga o conteúdo de um projeto que não interessa. Se o cliente
falar de um time com vários projetos, pergunte quais são e faça a primeira; depois ofereça a
seguinte.

## Antes de tudo: já existe skill para este repositório?

Olhe o bloco `<skills>` do seu contexto. Se alguma já cobre este projeto ou repositório, leia com
`read_skill` e **pergunte** ao cliente: melhorar a que existe, ou criar uma separada?

- **Melhorar** é quase sempre a resposta certa quando é o mesmo repositório. Diga o que a atual já
  tem e o que você vai acrescentar.
- **Separada** faz sentido quando são repositórios diferentes, ou quando o mesmo repositório tem dois
  fluxos que não se confundem (atender bug ≠ subir release). Nesse caso, avise o cliente: duas skills
  com descrição parecida fazem o agente **escolher a errada** — ele decide só pela description. As
  duas descriptions precisam dizer, na primeira linha, o que separa uma da outra.

Nunca sobrescreva uma skill existente sem perguntar. Reescrever o manual de alguém em silêncio é
perder trabalho que você não viu.

## Primeiro: os fatos que só o cliente tem

Um manual sem o repositório não é um manual — é uma redação sobre um projeto. Três coisas **não dão
para inferir, pesquisar nem deduzir**, e sem elas a skill não serve para o que existe:

1. **O caminho do repositório** (`grupo/projeto` no GitLab, `owner/repo` no GitHub).
2. **Como rodar os testes** ali.
3. **Um exemplo de problema já resolvido** e o caminho até a causa.

**Pergunte por elas. Uma por vez.** Isto não é entrevista: é a pergunta que destrava, do tipo que
você já faz quando falta uma credencial. Comece pelo repositório, porque sem ele os outros dois não
têm onde morar.

### Como se pergunta

Curto não é telegráfico. Você está falando com uma pessoa que acabou de te pedir ajuda, então a
pergunta tem três partes e cabe em duas linhas: **o que você vai fazer**, **a pergunta com um exemplo
do formato**, e **o que vem depois**. O exemplo é o que evita a segunda rodada — sem ele o cliente
responde "o do Start" e você continua sem o caminho.

Ruim, e é um aviso de sistema em vez de uma frase:

> Aguardando o caminho do primeiro repositório relacionado ao projeto `Killer\Start 2.0`
> (GitLab/GitHub).

Bom:

> Perfeito — vou montar um manual por repositório, começando por um. Qual é o caminho do primeiro no
> GitLab, no formato `grupo/projeto` (ex: `killer/start-2-api`)? Em seguida eu te pergunto como rodar
> os testes ali, e você me conta o resto do que sabe.

Se o cliente se oferecer para explicar os projetos, **aceite e conduza**: ele está oferecendo
justamente o que só ele tem. Diga que é assim que o manual fica bom, e puxe o primeiro fato.

O caminho que funciona é incremental: descubra a chave de identificação, pergunte o repositório,
salve a primeira versão com o que já tem, e então ofereça acrescentar o comando de teste e os
exemplos. Cada volta deixa o manual melhor, e o cliente vê progresso em vez de um formulário.

**Nunca escreva "não verificado" no lugar de perguntar.** Essa marca é só para o que o cliente te
disse e você não pôde confirmar por API — não para o que você não perguntou.

## Depois: confirme o que der, com o que estiver ativo

Antes de salvar, confira o que as integrações ativas do cliente permitem conferir. Use o que estiver
disponível — `http_call` nos endpoints da integração, ou as tools `mcp_*` do mesmo fornecedor; leia a
seção `Integrations & MCPs` do seu contexto e escolha o que existe, sem preferência dogmática:

- **O repositório existe?** Confirme o path exato como a API o devolve, não como o cliente digitou
  de memória.
- **A área/projeto do rastreador traz demandas?** Consulte filtrando pelo `System.AreaPath`
  informado (WIQL no Azure, JQL no Jira). **Mostre um ou dois itens reais** ao cliente para ele
  confirmar que é isso — um item de verdade na tela vale mais que qualquer confirmação verbal.
- **Se a credencial falhar** (401, token expirado, integração inativa), diga qual e siga: isso não
  impede a skill de existir, mas entra na seção de verificação como não confirmado.
- **O comando de teste você não consegue verificar** — conferir exigiria clonar e executar. Registre
  o que o cliente disse e marque como **não verificado**. Nunca faça o manual parecer mais confiável
  do que é.

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
