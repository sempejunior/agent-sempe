---
name: criar-paginas
description: Cria e publica páginas HTML para qualquer propósito — relatório, dashboard, explicação visual de um assunto, resumo, comparativo, one-pager, documentação — a partir de conteúdo ou dados que você já tem. Use sempre que fizer sentido entregar algo visual e navegável em vez de só texto no chat ("monte uma página com isso", "me mostra visualmente", "gera um dashboard/relatório", "faz um one-pager"). Publica com a ferramenta publish_page e devolve um link seguro para o usuário abrir.
metadata: {"nanobot":{"emoji":"🧾","category":"Geral","importance":"complementary","provides":"Publica páginas e relatórios em HTML"}}
---

# Criação de páginas

Você transforma conteúdo ou dados em uma **página HTML** clara e bonita e a publica com a
ferramenta `publish_page`, que retorna um link secreto servido com segurança (CSP travado).
Serve para qualquer propósito: relatório, dashboard, explicação de um tema, resumo,
comparativo, one-pager, etc. — **a coleta dos dados vem de outra skill/ferramenta; aqui é a
apresentação.**

**Antes de escrever HTML à mão, considere `publish_report`**: para relatórios/dashboards de
dados (seções + cards + gráficos + tabelas), ela renderiza um visual rico e consistente a
partir de conteúdo estruturado — mais barato e com qualidade garantida. Escreva o HTML você
mesmo (com esta skill) quando o layout precisar ser realmente customizado.

Tenha **liberdade para criar**: adapte layout, seções, cores e ênfases ao conteúdo e ao público.
**Não existe template fixo** — duas páginas não precisam ser iguais. O que não muda são as regras
técnicas e os princípios de qualidade abaixo.

## Regras técnicas (obrigatórias — a ferramenta exige)

- HTML **100% autocontido**: todo o CSS inline em `<style>`. **Sem `<script>`** (não é executado
  na página servida). **Sem CDN nem recursos externos** (fontes/ícones/imagens por URL). Imagens
  apenas como `data:` URI.
- Gráficos (quando houver): **barras e medidores em CSS** (largura/altura proporcional ao valor).
  Nunca use bibliotecas JS de gráfico.
- Responsivo: `max-width` no conteúdo, layout em grid/flex e ao menos uma `@media` para telas
  pequenas.

## Princípios de uma boa página

1. **Resposta primeiro.** Abra com o essencial: título + subtítulo (escopo/contexto) e, quando for
   dado/números, uma linha de **cards** com o que mais importa. Quem abre entende em segundos.
2. **Hierarquia e escaneabilidade.** Seções com títulos claros, espaço em branco, destaque para o
   que salta aos olhos (maior/menor, mudança relevante). Menos é mais.
3. **Do resumo ao detalhe.** Comece pela visão geral e desça para o detalhe (listas, tabelas). Em
   páginas longas, uma sidebar de navegação com âncoras (`#secao`) ajuda muito.
4. **Honestidade.** Deixe claro a fonte, o período e as premissas. **Nunca invente dado**; se algo
   vier vazio, mostre "sem dados" e explique. Nota curta de metodologia quando fizer sentido.
5. **Visual profissional e consistente.** Paleta sóbria, bom contraste, alinhamento. Tema escuro ou
   claro — escolha o que serve ao conteúdo e ao público.

Adeque a estrutura ao propósito: um **relatório** pede cards + rankings + tabelas; uma **explicação**
pede seções didáticas, exemplos e talvez um diagrama simples em CSS; um **comparativo** pede tabela
lado a lado. Use o bom senso.

## Arquitetura do conteúdo (escolha a estrutura pelo formato do conteúdo)

- **Grupo + indivíduos** (time + pessoas: relatório de time, PDIs de vários colaboradores, análise
  de desempenho coletiva): SEMPRE separe as duas visões. Primeiro a **visão geral do grupo** (cards
  de totais + tabela comparativa/ranking entre as pessoas), depois **uma `<section id="p-<slug>">`
  por pessoa** com o detalhe dela. Navegação por âncoras (índice no topo ou sidebar fixa com
  `href="#p-<slug>"`) — âncoras funcionam sem JS; opcionalmente destaque a seção ativa com a
  pseudo-classe CSS `:target`. Nunca misture métricas do time e de uma pessoa na mesma seção.
- **Tabela vs cards**: tabela quando compara N itens nas mesmas dimensões (pessoas × métricas);
  cards para os KPIs de UMA entidade (o time, uma pessoa); barras CSS para distribuição/ranking.
  Nunca uma parede de cards repetidos quando uma tabela compara melhor.
- **Página única vs várias**: por padrão, UMA página com seções ancoradas. Várias páginas só se o
  usuário pedir ou se o conteúdo for realmente independente por pessoa (ex.: um PDI individual para
  entregar a cada colaborador) — nesse caso publique também uma página-índice com os links.
- **Densidade**: cada seção = título + 1 linha de contexto + o dado. Sem parágrafos decorativos.
- **Página analítica** (análise de desempenho, diagnóstico): todo gráfico/tabela vem acompanhado
  de 1-2 linhas de leitura ("o que isso significa / onde agir") ao lado ou logo abaixo — nunca um
  gráfico solto sem interpretação.

## Base visual opcional (tema escuro — ponto de partida, adapte à vontade)

```html
<style>
:root{--bg:#0f1420;--panel:#161d2e;--card:#1c2538;--line:#26304a;--txt:#e6ebf5;--mut:#93a0bd;--acc:#4f8cff}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--txt)}
.wrap{max-width:1080px;margin:0 auto;padding:34px 40px}
h1{font-size:25px;margin:0 0 4px}h2{font-size:19px;margin:26px 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
.sub{color:var(--mut);font-size:13px;margin:0 0 22px}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;min-width:150px;flex:1}
.card-val{font-size:24px;font-weight:700}.card-lbl{color:var(--mut);font-size:12px;margin-top:4px}
.bar-row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}
.bar-label{width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{flex:1;background:#0e1422;border-radius:6px;height:14px;overflow:hidden}
.bar-fill{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#4f8cff,#2b5fd0)}
.bar-val{width:70px;text-align:right;color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{color:var(--mut)}
.month-chart{display:flex;gap:8px;align-items:flex-end;height:130px;padding-top:10px}
.mb-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.mb-bar-wrap{flex:1;width:60%;display:flex;align-items:flex-end}
.mb-bar{width:100%;background:linear-gradient(180deg,#4f8cff,#2b5fd0);border-radius:5px 5px 0 0;min-height:2px}
.mb-val{font-size:11px;color:var(--mut);margin-top:4px}.mb-lbl{font-size:10px;color:var(--mut)}
@media(max-width:760px){.wrap{padding:18px}.cards{flex-direction:column}}
</style>
```

Gráfico de colunas mensal: um `.mb-col` por mês, `height` do `.mb-bar` proporcional ao valor
(`height:NN%` com NN = 100 × valor / máximo do período).

Para páginas longas, considere uma sidebar fixa com links-âncora. Para tema claro, troque as
variáveis `--bg/--txt/--card` por tons claros mantendo o contraste.

## Desfecho (sempre)

Ao final, chame `publish_page(title="Título — contexto", html="<documento completo>")` e
**entregue o link ao usuário como link markdown**, exatamente como a ferramenta retornou — por
exemplo: "Pronto! [Abrir página](<link retornado>)". O link é seguro (secreto + servido com
política que bloqueia scripts). Se o pedido foi pontual, **ofereça** gerar a página em vez de
impor.
