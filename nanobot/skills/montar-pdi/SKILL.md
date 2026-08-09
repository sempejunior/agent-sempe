---
name: montar-pdi
description: Monta um PDI (Plano de Desenvolvimento Individual) fundamentado em dados, no modelo Sólides — cruzando o que a pessoa entregou (de QUALQUER fonte de dados disponível), o PDI anterior dela e, quando houver, o perfil comportamental. Use quando pedirem "monte o PDI de fulano", "plano de desenvolvimento", "o que fulano deveria desenvolver", ou uma análise de desempenho voltada a desenvolvimento. A entrega padrão é uma página de PDI por pessoa.
metadata: {"nanobot":{"emoji":"🎯","category":"T&D","importance":"core","provides":"Monta PDI a partir de dados de entrega + PDI anterior"}}
---

# Montar PDI (fundamentado em dados)

Objetivo: produzir um PDI de qualidade para um colaborador, **fundamentado em dados** — não em
achismo. Você é autônomo e inteligente: descubra as fontes disponíveis, colete o que precisa,
raciocine e entregue. Evite interrogatório — só pergunte o que realmente trava (tipicamente: de
qual pessoa é o PDI, se não estiver claro).

## Fontes de dados (agnóstico — use o que houver)

Não dependa de nenhuma fonte específica; **descubra** o que está disponível e use:
- Integrações de entrega/desempenho via MCP (Azure DevOps, Jira, etc.) — confira os nomes reais
  das tools na seção `Integrations & MCPs` do seu contexto, porque eles derivam do slug. O
  que a pessoa entregou: itens concluídos, tipos, sprints, WIP, PRs.
- Um relatório/dado que o usuário forneceu ou que você já gerou.
- Documentos no RAG (`rag_search`) — inclusive o **PDI anterior** da pessoa.
- Arquivos no workspace.

Se não houver dados de entrega de nenhuma fonte, diga isso com transparência e monte o PDI com o
que há (PDI anterior + perfil), sinalizando a limitação. Nunca invente métricas.

**No Azure DevOps, use a ferramenta `azure_devops_report`** para obter a entrega — não monte a
consulta na mão. Ela recebe o nome do projeto e retorna, por pessoa, o volume de itens concluídos
no ano, story points, defeitos, lead/cycle time e retrabalho — já com a **autoria correta** (cadeia
`AssignedTo → ActivatedBy → ResolvedBy → ClosedBy`; buscar só por `AssignedTo` subconta, porque ele
é limpo após a entrega). Fluxo: descubra/pergunte o **projeto** (a org tem muitos; não chame
`list_organizations`), chame `azure_devops_report(project="<nome>")`, e use a entrada da pessoa no
resumo por pessoa que ela retorna. Atenção a **homônimos** (ex.: `lucas.cid` ≠ `lucas.silva`) —
use o identificador exato do resumo. Para consultas pontuais fora do relatório, as tools MCP do
Azure seguem disponíveis, com o nome que a seção `Integrations & MCPs` mostrar.

## Método (objetivo, não roteiro rígido — adapte)

1. Identifique a pessoa e o período.
2. **SEMPRE** recupere o **PDI anterior** dela via `rag_search` antes de propor o novo, buscando
   **pelo nome da pessoa** (ex.: `rag_search("PDI anterior <nome>")`). Extraia os objetivos que
   estavam planejados e o status. Se não existir PDI anterior, diga isso explicitamente na página.
   Busque também o modelo de trilhas (`rag_search("modelo de trilhas")`) se precisar.
3. Colete a **entrega real** da(s) fonte(s) disponível(is) para o período.
4. **Analise**: planejado × entregue; forças demonstradas (com evidência); gaps; evolução desde o
   ciclo anterior. Seja específico; cite a evidência; sinalize se o dado é simulado/parcial. Se o
   pedido incluir uma **análise de desempenho completa** (do time ou da pessoa, para gestão),
   `read_skill("analise-desempenho")` e monte-a antes dos PDIs — ela vira a base de evidências.
5. Proponha o **novo PDI** no modelo Sólides: 3–5 objetivos SMART, com competências (técnicas +
   comportamentais), ações/trilhas (lógica 70-20-10) e prazos/marcos. Se houver perfil
   comportamental e a skill `pdi_por_perfil` estiver disponível, `read_skill("pdi_por_perfil")` e
   siga a estrutura e as regras por perfil dela.
6. Para feedback, quando útil, apoie-se em `feedback_estruturado` (se disponível).
7. **Pedidos compostos** ("analise a entrega e depois monte os PDIs"): execute TODAS as etapas na
   mesma resposta — análise, depois PDIs, depois páginas — sem parar no meio para pedir
   confirmação. Só pare se algo realmente travar (ex.: não souber de quem é o PDI).

## Definição de pronto (o que É um PDI)

Uma análise de desempenho, um resumo ou uma "base de PDI" **não** é um PDI. O pedido só está
completo quando **cada pessoa** tem, na página entregue:

- 3-5 **objetivos SMART** (específicos, mensuráveis, com prazo);
- as **competências** a desenvolver em cada objetivo (técnicas e comportamentais);
- **ações concretas na lógica 70-20-10** (prática no trabalho / troca e mentoria / estudo formal);
- **prazos e marcos** de revisão;
- amarração explícita com as **evidências de entrega** e com o **PDI anterior** (o que evoluiu,
  o que continua);
- a estrutura e as regras por perfil de `pdi_por_perfil`, quando houver perfil comportamental.

Se algum desses itens faltar para alguma pessoa, o trabalho não terminou — continue.

## Entrega

Monte uma **página de PDI por pessoa** e publique com **`publish_report`** — nunca `publish_page`
para PDI (visual e densidade garantidos só na primeira):
seção de cabeçalho/contexto (cards: pessoa, período, perfil), seção do ciclo anterior
(`table` planejado × entregue + `text` de leitura), seção de forças e gaps (blocos `text` com
evidências), e uma seção por objetivo do novo PDI (`text` com competências, ações 70-20-10,
prazos e marcos). Para várias pessoas, uma seção de visão do time primeiro e depois uma seção
por pessoa (`id: "p-<slug>"`) — o menu lateral é gerado das seções. Devolva o link ao usuário
como link markdown (`[Abrir PDI](<link>)`). Use `publish_page` + `read_skill("criar-paginas")`
só para layouts fora desse padrão. Se o pedido foi pontual, responda direto e **ofereça** gerar
a página.

## Princípios

- Desenvolvimentista, nunca punitivo. PDI é acordado com a pessoa, não imposto.
- Honestidade sobre a origem e a completude dos dados (diga quando for simulado ou parcial).
- Não reduza a pessoa ao perfil. Dado sensível → uso responsável (LGPD).
