---
name: sindicatos-beneficios
description: Investiga sindicatos e convenções coletivas (CCT) por busca ampla e monta o mapa de benefícios obrigatórios de uma categoria/região — piso, vale alimentação/refeição, plano de saúde e odontológico, seguro de vida, PLR, reajustes. Use quando pedirem "sindicato de X", "convenção coletiva", "benefícios obrigatórios", "CCT", "piso da categoria", ou um mapa de benefícios por cliente/categoria/cidade.
metadata: {"nanobot":{"emoji":"⚖️","category":"DP e Jurídico","provides":"Mapa de benefícios obrigatórios por categoria/região a partir da CCT"}}
---

# Sindicatos e benefícios obrigatórios (CCT)

Objetivo: dado um alvo (categoria profissional, segmento e cidade/UF — ou uma empresa descrita),
identificar o(s) sindicato(s), localizar a convenção coletiva vigente e extrair os **benefícios
obrigatórios** com valores e cláusulas. Quem lê é DP/RH decidindo o que a empresa precisa entregar
aos funcionários. Entrega padrão: mapa de benefícios em tabela; várias categorias → página
navegável com `publish_report`.

## 1. Defina o alvo

- A entrada pode vir de três formas — todas convergem para pares (categoria, base territorial):
  **(a)** lista de CCTs/categorias direto ("comerciários de BH, metalúrgicos de Joinville...");
  **(b)** lista de CNPJs → resolva com `cnpj_lookup` e derive os pares;
  **(c)** overview ("principais CCTs do Brasil/do estado X") → monte a matriz categoria×estado
  pelas categorias de maior volume de empregados.
- O mínimo necessário: **categoria/segmento** (ex.: comerciários, metalúrgicos, TI, saúde) +
  **base territorial** (município/UF). Se o usuário der uma empresa, deduza a categoria pela
  atividade descrita — a busca continua ampla, por categoria+região.
- Existem dois lados: sindicato **laboral** (dos empregados) e **patronal** (das empresas). O que
  define os benefícios devidos aos funcionários é a **CCT firmada entre os dois** — busque a
  convenção, não apenas o sindicato.

## 2. SEMPRE comece pela base local (`cct_search`)

A plataforma mantém uma base local de milhares de CCTs/ACTs do Mediador (texto integral,
atualizada periodicamente). Antes de qualquer busca na web:

- `cct_search` com query FTS combinando categoria e benefício/cidade (ex.:
  `comerciarios AND "vale alimentacao"`, com filtro `uf`). Acentos são ignorados.
- Achou o instrumento? Use `cct_search` com `numero_registro` + `trecho` ('piso', 'alimentação',
  'plano de saúde'...) para ler as cláusulas e extrair valores — é instantâneo e a fonte é o
  extrato oficial do MTE.
- Só vá para a web (passos 3-4) se a base não tiver o instrumento, se a vigência estiver vencida
  ou se precisar do contexto da negociação em curso. Nesse caso, registre no resultado que o
  instrumento não estava na base (insumo para o próximo sync).

## 3. Identifique os sindicatos (busca ampla na web)

- `web_search` com variações: "sindicato dos empregados {categoria} {cidade}", "sindicato
  {segmento} {UF} convenção coletiva", "{nome do sindicato} base territorial".
- Fontes com autoridade: site oficial do sindicato, federações (Fecomércio, FIESP/FIEMG, CNTC...),
  CNES do Ministério do Trabalho.
- Registre de cada candidato: nome oficial, base territorial, categorias abrangidas. Se mais de um
  sindicato disputar a mesma base, liste ambos e explique o critério de desambiguação (atividade
  preponderante da empresa).

## 4. Localize a CCT vigente (web, quando a base não resolver)

- Fonte oficial: **Sistema Mediador do MTE** (mediador.mte.gov.br) — busque por
  sindicato/categoria/município; se a página exigir formulário, use `browser`.
- Alternativas: seção "convenções" do site do sindicato; busca "convenção coletiva {categoria}
  {cidade} {ano} pdf".
- Confirme a **vigência** (data-base, início/fim do instrumento). Se só houver CCT vencida, use a
  mais recente e sinalize — reajustes retroativos na data-base são comuns.
- Leia o texto com `web_fetch`; PDF que não abrir, baixe com `exec` (curl) e extraia o texto.

## 5. Extraia os benefícios obrigatórios

**O produto deste trabalho são os VALORES das cláusulas — sem eles o relatório não serve.** Achar
o site do sindicato não basta: abra o TEXTO da convenção. "Não localizado" só é aceitável depois
de esgotar, nesta ordem: (a) busca direta "convenção coletiva {categoria} {cidade} {ano} pdf" e
leitura do PDF (baixe com `exec` curl e extraia o texto com `pdftotext` ou python se `web_fetch`
não abrir); (b) página de convenções do site do sindicato, navegando com `browser` até o
documento; (c) Mediador do MTE. Dedique várias tentativas por CCT antes de desistir — categorias
grandes (bancários/FENABAN, comerciários, metalúrgicos) SEMPRE têm CCT pública com valores.

Para cada item, capture **valor/regra**, **número da cláusula** e **vigência**:

- Piso salarial por função/faixa
- Vale alimentação e/ou refeição (valor, desconto máximo do empregado)
- Plano de saúde e odontológico (obrigatoriedade, coparticipação)
- Seguro de vida
- PLR / abono
- Auxílio creche / educação
- Adicionais (hora extra %, noturno, quebra de caixa...)
- Reajuste salarial e data-base
- Contribuições (negocial/assistencial) — sinalizar: impactam a folha

Se a cláusula não existir na CCT, escreva "não previsto na CCT" — nunca preencha por suposição.

## 6. Entregue o mapa

- Uma categoria: tabela benefício → valor/regra → cláusula → vigência, com link da fonte (Mediador
  ou PDF da CCT).
- Várias categorias/clientes: **agrupe pelo par (sindicato, CCT)** — dezenas de clientes caem na
  mesma convenção; analise cada CCT uma única vez e mapeie os clientes para ela. Consolide com
  `publish_report`.

## Modo mapa por cliente (lote de CNPJs → planilha)

Quando o pedido for "mapa de benefícios por cliente" com uma lista de CNPJs (colada na conversa ou
em arquivo no workspace):

1. **Resolva cada CNPJ** com `cnpj_lookup` → razão social, CNAE principal, município/UF.
2. **Deduplique**: agrupe os clientes por par (CNAE/segmento, município). Dezenas de clientes caem
   no mesmo par — pesquise sindicato e CCT UMA vez por par, nunca por cliente.
3. Para cada par distinto: identifique o sindicato laboral e a CCT vigente (passos 2-4 desta
   skill, começando pela base local); para cada CCT distinta: extraia os benefícios obrigatórios
   (passo 5) UMA vez.
4. **Monte a planilha** (CSV com `;`, abre no Excel) via `write_file`, uma linha por cliente:
   `cnpj; razao_social; municipio; uf; cnae; sindicato; cct_vigencia; cct_link; piso_salarial;
   vale_alimentacao; plano_saude; plano_odontologico; seguro_vida; plr; data_base; observacoes`.
   Campo sem previsão na CCT = "não previsto"; par sem CCT localizada = "não localizado —
   verificar manualmente" (nunca deixe em branco sem explicação).
5. Entregue o caminho do arquivo + um resumo: quantos clientes, quantos pares distintos, quantas
   CCTs analisadas, quantos "não localizado". Persista o progresso em arquivo a cada lote — listas
   grandes são retomáveis (`list_dir` antes de começar, para continuar de onde parou).

## Modo panorama (vários estados de uma vez)

Quando pedirem uma visão geral ("principais CCTs dos estados", "panorama sindical"), NÃO tente
cobrir tudo — seja explícito no recorte e entregue um mapa navegável:

1. **Recorte padrão** (ajuste se o usuário pedir outro): as categorias de maior volume de
   empregados — comerciários, metalúrgicos, construção civil, saúde, transporte — nos estados
   indicados (sem indicação: SP, RJ, MG, RS, PR, SC, BA, PE, GO, DF).
2. **Trabalhe em lotes por estado** e dispare as buscas de um mesmo lote em paralelo (uma busca
   por categoria+estado). Para cada par, capture: sindicato laboral, CCT vigente (link do Mediador
   ou PDF) e 3-4 destaques de benefícios (piso, VA/VR, plano de saúde, reajuste/data-base).
3. **Persista o parcial** de cada lote em arquivo no workspace (`write_file`,
   `panorama-ccts-<estado>.md`) antes de seguir — se o turno estourar o limite, o próximo turno
   retoma do que existe (`list_dir` + `read_file`).
4. **Entrega dupla, sempre**: (a) planilha CSV no workspace (mesmas colunas do modo mapa por
   cliente, uma linha por par categoria×estado) e (b) página comparativa com `publish_report` —
   uma seção por estado, tabela categoria → sindicato → CCT (link) → destaques, mais um
   comparativo nacional (maiores/menores pisos e VA). Abra com o sumário do recorte coberto e do
   que ficou de fora.
5. No modo panorama a profundidade é MENOR que na consulta individual (destaques, não o mapa
   completo de cláusulas) — diga isso no relatório e aponte que cada linha pode ser aprofundada
   sob demanda.

## Cuidados (incluir na entrega, sempre)

- Levantamento informativo, **não é parecer jurídico** — validação final é do jurídico/DP.
- ACT (acordo coletivo próprio da empresa) prevalece sobre a CCT; filiais em outra base
  territorial seguem outra CCT.
- Cite a fonte e a vigência de cada dado extraído.
