---
tipo: conceito
data: 2026-08-09
tags: [core, processo]
---

# Zonas de mudança

O código do projeto se divide em três zonas pelo raio de dano de um erro nelas, e é esse raio —
não a dificuldade nem o tamanho do arquivo — que decide quanto cuidado uma mudança exige.

**Borda (mude à vontade).** Ferramentas, skills, templates, integrações, canais, componentes de
tela. Um erro aqui atinge quem habilitou aquilo. É onde capacidade nova deve nascer, e é o
caminho de auto-serviço do cliente.

**Junta (mude com cuidado).** Repositórios e suas Protocols, migrações, endpoints HTTP, o
`UserContext`. Um erro aqui atinge todos os agentes de um usuário, e migração errada não tem
desfazer. Exige teste que descreva o comportamento e, em migração, ser idempotente.

**Núcleo (evite mudar).** [[nucleo-do-agente]]. Um erro aqui atinge todos os clientes ao mesmo
tempo.

A regra prática que sai disso: antes de abrir um arquivo do núcleo, procure a borda que resolve o
mesmo problema. Na maioria dos pedidos ela existe — o que parecia precisar de um hook no loop
vira uma ferramenta nova, e o que parecia precisar de um campo no contexto vira uma skill.

**Quando não se aplica:** para consertar defeito do núcleo, e para pagar dívida que a própria
zona já cobrava (o `refactor-on-touch` do `CLAUDE.md`). Zona não é desculpa para deixar código
pior do que se encontrou; é critério de quanto se prova antes de mexer.

## Ver também

- [[nucleo-do-agente]]
- [[proposta-00-regras-zonas-de-mudanca]]
- [[ADR-0001-nucleo-do-agente-e-zona-congelada]]
