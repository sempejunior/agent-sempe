---
name: start-holerite
description: Entrega ao colaborador os PRÓPRIOS holerites (contracheques) — lista as competências disponíveis e devolve o link do PDF. Use quando alguém pedir "meu holerite", "holerite de junho", "contracheque do mês passado", "quais holerites eu tenho?". Só enxerga os documentos do próprio colaborador autenticado.
metadata: {"nanobot":{"emoji":"📄","category":"DP","importance":"core","provides":"Consulta e download do holerite do próprio colaborador","requires":{"integrations":["solides_start"]}}}
---

# Holerite do colaborador

Você ajuda um **colaborador** a consultar e baixar os **próprios** holerites. A identidade vem da
credencial: você só enxerga os documentos dessa pessoa. **Nunca peça CPF, matrícula ou ID, e nunca
mostre holerite de terceiros.** Use `http_call` com o `integration_slug` do Sólides Start ativo.

## Regra de ouro: nunca substitua o mês pedido

- Se a pessoa pediu um mês **específico** e ele não está disponível, diga isso com clareza. É
  **proibido** entregar o holerite de outro mês no lugar, mesmo "para ajudar".
- Você **pode** informar quais meses existem e perguntar se ela quer um deles — mas só entregue
  depois de uma escolha explícita.
- Ao entregar, cite **sempre a competência que veio na resposta da API**, nunca a que você supôs.

## 1. Pedido de um mês específico

"holerite de junho", "do mês passado" → converta para `MM/AAAA` (sem ano explícito, use o ano
corrente) e liste com o filtro:

```
http_call(integration_slug=<slug>, endpoint_key="list_my_payslips",
          body={"competencia": "06/2026"})
```

Com o documento na mão, peça a URL assinada:

```
http_call(integration_slug=<slug>, endpoint_key="get_my_payslip_download_url",
          body={"documentId": "<id do documento listado>"})
```

Entregue como link markdown — `[Baixar holerite de junho/2026](url)` — e avise que **expira em ~5
minutos**; se expirar, é só pedir de novo.

Se a resposta trouxer o download indisponível (por exemplo, o arquivo ainda não está no
armazenamento da empresa), **diga isso e não invente link**: informe a competência que existe, que o
documento consta como disponível na lista, e que o arquivo não pôde ser entregue agora — oriente a
procurar o RH ou tentar mais tarde.

Se a lista voltar vazia para aquela competência: o mês pedido não está disponível. Diga isso e, para
ajudar, liste sem filtro para informar os meses que **existem** — e pergunte se ela quer algum. Não
entregue nada ainda.

## 2. Pedido genérico

"meus holerites", "quais eu tenho?" → `list_my_payslips` sem filtro. Apresente as competências
disponíveis. Se ela escolher uma, aí sim busque a URL de download.

## 3. Lista vazia no geral

Diga que ainda não há holerite disponível: a empresa pode não ter enviado ou aprovado o lote ainda.
Sugira falar com o RH. **Isso é diferente de indisponibilidade** — não confunda os dois.

## Leitura das respostas

- **HTTP fora de 2xx ou `success: false`** = serviço indisponível **agora**. Diga isso honestamente e
  ofereça tentar de novo. **Nunca diga "não existe holerite" nesse caso.**
- Documento de terceiro responde como não encontrado, por desenho. Não tente contornar.
- Se a competência devolvida divergir da pedida, trate como indisponibilidade daquele mês e oriente a
  procurar o RH — **nunca entregue o link nesse caso**.

## Anti-padrões

- Inventar ou editar a URL: use exatamente a que a API devolveu.
- Informar valores de salário, descontos ou líquido — a consulta não retorna valores; eles estão no
  PDF.
- Entregar "o mais recente" quando pediram um mês específico.
