---
tipo: adr
status: aceita
data: 2026-08-08
decide: [runtime, chat]
substitui:
substituida_por:
---

# ADR-0002 — O teto do turno avisa em vez de cancelar

## Contexto

O turno do chat web era cortado por um `wait_for` de 180 segundos. A ferramenta de delegação de
código, por outro lado, declarava teto próprio de 1080 segundos e o registro de ferramentas
respeitava essa declaração. Ou seja: a ferramenta achava que tinha 18 minutos e o socket dava 3.

Isso não era teórico. Em 08/08/2026 o agente disparou duas delegações às 17:43:42; às 17:45:31 o
teto cancelou o turno inteiro, o tratamento de cancelamento matou o grupo de processos, e o
resultado foi nenhum trabalho persistido, nenhum processo vivo e nenhum registro do que havia
sido feito.

Some-se a direção do produto: a ferramenta é um chat. Processamento longo não pode matar a
resposta, e quando alguém está com o chat aberto o retorno deve aparecer ali — não só como
comentário no board ou item na caixa de pendências.

## Decisão

O teto de 180s deixa de cancelar e passa a ser um **teto macio**: quando o turno o ultrapassa, o
chat recebe um aviso de que o trabalho segue em segundo plano, o campo de digitação é devolvido à
pessoa, e o turno continua. A resposta chega no mesmo balão quando terminar. Só o **teto duro**,
alinhado ao limite de job (1800s), cancela.

O andamento passa a ter canal próprio: notas curtas emitidas pelas ferramentas durante o turno,
por um sink em `ContextVar` — o mesmo padrão do trace, que já existia.

## Consequências

- Um turno pode ficar vivo por até 30 minutos. O socket precisa aguentar, e aguenta: o turno já
  rodava como task de fundo para o loop de recepção não parar.
- Todo frame do socket passou a levar `turn_id`. Isso resolveu de quebra uma classe de erro do
  frontend, que casava mensagens por "o último balão que está escrevendo" e errava com dois
  turnos simultâneos.
- Trabalho de fundo passou a exigir um alerta próprio, porque a pessoa pode ter saído da tela.
- A pessoa pode continuar conversando enquanto o turno anterior trabalha — o que só é seguro
  porque cada frame sabe a que turno pertence.
- Mexeu no núcleo. É uma das exceções previstas em
  [[ADR-0001-nucleo-do-agente-e-zona-congelada]]: defeito comprovado, com teste que falha antes.

## Descartado

**Mandar toda delegação para segundo plano automaticamente.** Tira a decisão do modelo, que é
bom, mas encerra o turno com "comecei" e devolve o resultado como notificação depois. Para uma
demanda pedida no chat isso é justamente a experiência de que o usuário reclamou.

**Aumentar o teto de 180 para 1800 e pronto.** Não resolve nada: só move a hora em que o
trabalho é destruído, e trava o campo de digitação por meia hora.

**Streamar o texto intermediário do modelo.** Daria sinal de vida sem nenhuma peça nova, ao custo
de mostrar raciocínio que o agente ainda vai descartar — contraria
[[entrega-unica-no-fim-do-turno]].

## Ver também

- [[trabalho-em-segundo-plano]]
- [[entrega-unica-no-fim-do-turno]]
- [[nucleo-do-agente]]
