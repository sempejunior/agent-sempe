---
name: start-feedback-e-sugestao
description: Envia feedback de desenvolvimento a uma PESSOA (colega ou líder), lista os feedbacks recebidos, e envia SUGESTÃO à EMPRESA (anônima ou identificada). Use quando alguém disser "quero dar um feedback para o João", "reconhecer a Ana", "quais feedbacks eu recebi?", "tenho uma sugestão para a empresa", "quero sugerir algo anonimamente". Registra na base de RH da empresa.
metadata: {"nanobot":{"emoji":"💬","category":"DP","importance":"core","provides":"Feedback entre pessoas e sugestões à empresa","requires":{"integrations":["solides_start"]}}}
---

# Feedback entre pessoas e sugestão à empresa

Duas jornadas próximas que se confundem com facilidade. Desambigue antes de agir:

- Destinatário é uma **pessoa** (reconhecer, orientar, dar retorno a um colega ou líder) → feedback.
- Destinatário é a **empresa** (ideia, melhoria, crítica ao ambiente ou ao processo) → sugestão.

Use `http_call` com o `integration_slug` do Sólides Start ativo. O autor é sempre quem está falando —
resolvido pela credencial. **Não pergunte quem está enviando.**

## 1. Feedback a uma pessoa

Todo feedback enviado por aqui é **identificado**, não anônimo. Diga isso se a pessoa parecer supor o
contrário.

1. **Resolva o destinatário pelo nome** — nunca peça ID:

```
http_call(integration_slug=<slug>, endpoint_key="lookup_employee",
          body={"nameQuery": "João"})
```

Use o `match_score` de cada candidato para decidir: acima de ~0.9 confirme direto ("É o *João
Pereira*?"); entre ~0.6 e 0.8 sugira; abaixo disso, ou com vários candidatos parecidos, liste e peça
para escolher. Sem nenhum resultado, peça para revisar o nome.

2. Colete a mensagem e classifique como `positive` (reconhecimento) ou `constructive`
   (desenvolvimento) — pergunte só se não estiver claro no que a pessoa escreveu.

```
http_call(integration_slug=<slug>, endpoint_key="register_peer_feedback",
          body={"recipientUserId": "<userId do match>", "recipientName": "João Pereira",
                "feedbackType": "positive", "message": "..."})
```

Envie **sempre os dois campos** do destinatário (`recipientUserId` e `recipientName`), exatamente
como vieram do lookup.

3. Confirmado: diga a quem foi entregue.

## 2. Feedbacks recebidos

"quais feedbacks eu recebi?" → `list_received_feedbacks` (a credencial já limita ao próprio
destinatário). Apresente autor, tipo e mensagem, do mais recente para o mais antigo.

## 3. Sugestão à empresa

1. Colete o texto e **pergunte se deve ser anônima**, se a pessoa não disser.

```
http_call(integration_slug=<slug>, endpoint_key="submit_company_suggestion",
          body={"text": "...", "anonymous": true})
```

Com `anonymous: true` o autor é descartado no servidor — a anonimidade não depende de você omitir
nada.

2. O envio **já notifica o gestor**. Não dispare notificação adicional: gera aviso duplicado.
3. Confirmado: agradeça e encerre de forma cordial.

## Leitura das respostas

- **HTTP fora de 2xx ou `success: false`** = indisponibilidade **agora**. Diga isso e ofereça tentar
  de novo. **Nunca confirme entrega de feedback ou registro de sugestão sem a API confirmar** — a
  pessoa vai embora acreditando que o colega recebeu.
- Destinatário não resolvido: não chute um `userId`. Volte ao lookup.

## Anti-padrões

- Enviar feedback identificado sem a pessoa saber que ele é identificado.
- Reescrever a mensagem de quem está enviando: ajuste tom só se pedirem; o conteúdo é dela.
- Tratar sugestão anônima como se você soubesse quem enviou.
