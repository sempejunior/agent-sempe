---
name: start-saida-antecipada-revisao
description: Conduz o gestor na revisão dos pedidos de saída antecipada do time — listar quem pediu para sair mais cedo e aprovar ou recusar cada pedido, notificando a pessoa. Use quando o gestor perguntar "quem pediu para sair mais cedo?", "tenho pedidos pendentes?", "aprova o pedido da Ana", "recusa esse pedido". A decisão é registrada na base de RH da empresa.
metadata: {"nanobot":{"emoji":"✅","category":"DP","importance":"core","provides":"Listagem e decisão de pedidos de saída antecipada (gestor)","requires":{"integrations":["solides_start"]}}}
---

# Revisão de saída antecipada (gestor)

Você ajuda o **gestor** a decidir os pedidos de saída antecipada do time. Use `http_call` com o
`integration_slug` do Sólides Start ativo no seu contexto.

## 1. Listar

Gatilhos: "quem pediu para sair mais cedo?", "pedidos pendentes", "tem alguém esperando resposta?".

```
http_call(integration_slug=<slug>, endpoint_key="list_leave_early_requests",
          body={"status": "REQUESTED"})
```

Apresente em lista numerada: **nome da pessoa, data, horário de saída e motivo**. Guarde o
`requestId` de cada item — você vai precisar dele para decidir, e ele só existe aqui.

Sem pendentes: diga isso e ofereça ver os já revisados (`{"status": "ALL"}`).

## 2. Aprovar ou recusar

Gatilhos: "aprova o da Ana", "recusa o pedido 2", "pode liberar".

1. Identifique o pedido pela **listagem** (nome + data). Use o `requestId` que veio dela — **nunca
   invente um id e nunca peça id ao usuário**. Se ainda não listou nesta conversa, liste primeiro.
2. Confirme a decisão em uma linha antes de executar. Para **recusar**, peça um motivo curto: a
   pessoa vai ler essa observação.
3. Chame:

```
http_call(integration_slug=<slug>, endpoint_key="review_leave_early_request",
          body={"requestId": "<id da listagem>", "decision": "approve"})
```

`decision` aceita **`approve` ou `reject`, em minúsculas** — não confunda com o `status` que volta na
listagem (`REQUESTED`, `APPROVED`, `REJECTED`). Na recusa envie também `note`.

4. Confirmado: diga a decisão e que a pessoa foi notificada. Se a resposta trouxer
   `employeeNotified: false`, avise que a notificação automática falhou e sugira falar com a pessoa
   diretamente — a decisão valeu, o aviso não saiu.

## Leitura das respostas

- Pedido **já decidido antes**: relista com `{"status": "ALL"}` e mostre o estado atual, em vez de
  insistir.
- Pedido **não encontrado**: relista para atualizar a visão.
- **Motivo obrigatório** na recusa: colete e chame de novo.
- **HTTP fora de 2xx ou `success: false`** = indisponibilidade **agora**. Diga isso honestamente.
  **Nunca confirme uma decisão que não foi efetivada** — o time age em cima do que você disser.

## Regras

- A decisão é irreversível por aqui: não existe desfazer. Por isso a confirmação explícita antes de
  chamar é obrigatória, não uma formalidade.
- Um pedido recusado merece uma observação que a pessoa consiga entender.
- Não use o histórico de pedidos como métrica de desempenho.
