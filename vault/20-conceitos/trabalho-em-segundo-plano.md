---
tipo: conceito
data: 2026-08-09
tags: [runtime, jobs]
---

# Trabalho que sobrevive ao turno

Trabalho que leva mais tempo que um turno de conversa vira um **job**: a ferramenta registra a
tarefa, devolve um identificador na hora, e a conclusão volta depois como **turno novo** na
sessão que pediu — não como valor de retorno.

Importa porque a alternativa não existe: uma delegação de código leva minutos, e segurar o turno
esperando trava o worker, estoura o teto e, quando o teto cancela, destrói o trabalho já feito
sem registrar nada. O job desacopla "quem pediu" de "quanto demora".

O que faz a conclusão achar o caminho de volta são duas colunas, `origin_channel` e
`origin_chat_id`, gravadas quando o job nasce. Delas se remonta a chave da sessão, e o resultado
entra na conversa certa. As pendências (perguntas esperando decisão humana) usam exatamente o
mesmo mecanismo.

**Quando se aplica:** delegação de código, varredura de board, qualquer coisa cujo tempo dependa
de um sistema de terceiro.

**Quando não se aplica:** quando alguém está olhando a tela e o trabalho cabe no turno. Aí o
melhor é fazer ali, com feedback progressivo — mandar para segundo plano por precaução transforma
uma resposta em uma notificação, o que é pior para quem esperava conversar.

## Ver também

- [[ADR-0002-teto-do-turno-avisa-em-vez-de-cancelar]]
- [[entrega-unica-no-fim-do-turno]]
- [[nucleo-do-agente]]
