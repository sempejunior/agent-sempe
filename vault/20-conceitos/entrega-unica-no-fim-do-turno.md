---
tipo: conceito
data: 2026-08-09
tags: [produto, chat]
---

# A resposta é entregue uma vez, no fim

O texto do assistente chega ao usuário uma única vez, quando o turno termina. O que acontece no
meio — chamadas de ferramenta, resultados, o raciocínio de cozinha — não vira mensagem.

Importa porque um agente com ferramentas produz muito texto intermediário que parece resposta e
não é: um plano que ele abandona duas iterações depois, um resultado que ele reinterpreta. Quem
lê o meio recebe informação que o próprio agente já descartou, e acredita nela.

Isso **não** significa deixar a tela parada. Andamento tem um canal próprio — notas curtas que
descrevem o que está acontecendo agora e morrem com o turno — e o histórico gravado permite
reabrir a conversa e ver cada ferramenta com seus argumentos. São três coisas diferentes:
a resposta (uma, no fim), o andamento (efêmero) e a auditoria (permanente, sob demanda).

**Quando não se aplica:** nos canais de chat externos, onde a ferramenta `message` envia mesmo e
substitui a resposta final. E não se aplica ao aviso de que o trabalho seguiu em segundo plano,
que é sobre o turno, não sobre o assunto.

## Ver também

- [[trabalho-em-segundo-plano]]
- [[ADR-0002-teto-do-turno-avisa-em-vez-de-cancelar]]
- [[ADR-0004-historico-pertence-a-pessoa]]
