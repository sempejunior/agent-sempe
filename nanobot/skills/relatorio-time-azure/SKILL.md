---
name: relatorio-time-azure
description: Gera relatório de desempenho/entrega de um time no Azure DevOps (itens concluídos no ano, ranking, story points, lead/cycle time, retrabalho, defeitos, sprints e WIP) e publica como página. Use quando pedirem "relatório do time", "desempenho", "produtividade", "velocidade", "AVD" de um projeto/time do Azure DevOps.
metadata: {"nanobot":{"emoji":"📊","category":"Geral","importance":"complementary","provides":"Relatório e dados de entrega do time (Azure DevOps)","requires":{"integrations":["mcp_azure_devops","azure_devops"]}}}
---

# Relatório de time (Azure DevOps)

A análise pesada é feita pela ferramenta **`azure_devops_report`** — ela faz o trabalho certo
que uma sequência de tool-calls não faz: puxa os itens **concluídos no ano**, atribui autoria pela
cadeia `AssignedTo → ActivatedBy → ResolvedBy → ClosedBy` (o `AssignedTo` é limpo após a entrega,
então buscar só por ele subconta), calcula lead/cycle time, retrabalho, defeitos, por pessoa e por
sprint, e **publica a página**, retornando o link + um resumo por pessoa.

## Como fazer

1. **Descubra o projeto.** A ferramenta recebe o nome do projeto (a organização tem muitos). Se o
   usuário não disse, pergunte em UMA linha ("Qual projeto do Azure DevOps?") ou use o que ele já
   mencionou. Não chame `list_organizations` (falha auth) — a org já vem na credencial.
2. **Chame a ferramenta:** `azure_devops_report(project="<nome>")` (opcional `year`, e
   `no_flow=true` para uma versão rápida sem métricas de fluxo).
3. **Entregue o link** que a ferramenta retornou, formatado como link markdown
   (`[Abrir relatório](<link>)`), e destaque 2-3 números do resumo (top do ranking, total de
   itens, WIP). Não invente dados — use só o que a ferramenta trouxe.

A ferramenta retorna **dados organizados** (por pessoa — incl. itens por mês, tempo por etapa,
tamanhos e lead/cycle; por sprint; por mês do projeto com itens + story points; WIP por pessoa
com aging; tipos; estados) além da página padrão. Se o usuário pedir um **recorte diferente**
(um subtime, uma métrica específica, um comparativo, um top-N, uma evolução mês a mês, um foco em
retrabalho/defeitos), **reorganize esses dados você mesmo** e monte a visão com `publish_report`
(visual rico garantido; você só estrutura o conteúdo) — não fique preso ao formato padrão. Se o pedido
for uma **análise de desempenho** interpretada (leitura de gestão, por pessoa e do time), use
`read_skill("analise-desempenho")`. Se a ferramenta não achar itens, confirme o nome do projeto. Para
consultas pontuais fora do relatório, os tools `mcp_azure_devops_*` seguem disponíveis. Nunca
invente dados — use só o que a ferramenta trouxe.
