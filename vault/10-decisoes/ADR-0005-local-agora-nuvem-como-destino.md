---
tipo: adr
status: aceita
data: 2026-08-09
decide: [arquitetura, infra]
substitui:
substituida_por:
---

# ADR-0005 — Roda local agora, com a nuvem como destino declarado

## Contexto

O produto é vendido como plataforma multi-tenant e está desenhado para isso: repositórios atrás
de Protocols, registries no lugar de cadeias de `if`, tudo escopado por usuário e por agente desde
o esquema do banco. Trocar SQLite por outro backend, no papel, é escrever novas implementações
sem mexer em interface.

A execução, porém, é de máquina única, e o acoplamento é concreto, não estilístico:

- banco é um arquivo SQLite (2,7 MB), com um escritor por vez;
- o disco local guarda estado que importa — 1,4 GB de workspace, sendo 1,2 GB o binário do Claude
  Code instalado sob demanda, 172 MB de clones de repositório, mais as páginas publicadas e os
  logs de cada delegação;
- as tarefas de fundo vivem no processo e o reaper mata órfão **por pid** depois de um restart;
- os servidores MCP são subprocessos locais presos ao ciclo de vida do gateway;
- o segredo é cifrado com um `master.key` em disco;
- a sessão fica em cache na memória do processo que atendeu o turno.

Existe pressão real para "já ir para a nuvem", e existe pressão oposta para tratar tudo como
temporário e seguir escrevendo contra o disco.

## Decisão

O produto roda local por enquanto, e a nuvem é destino declarado, não hipótese. Disso decorre uma
regra para código novo: **não assumir disco local nem processo único como se fossem permanentes.**
Estado que precisa sobreviver vai para o banco; arquivo em disco é cache ou artefato, e quem o
produz registra no banco que ele existe.

Migração para nuvem não é feita em pedaços oportunistas: acontece quando for prioridade, com o
desenho de `docs/backlog/07-cloud-multi-tenant-escala.md`.

## Consequências

- Uma entrega que só funciona com disco compartilhado é aceita hoje, desde que o que ela produz
  esteja registrado no banco. Foi o caso das páginas publicadas: o HTML continua em disco, e a
  entrega virou linha em `deliverables`.
- Continuamos com um único ponto de falha e sem escala horizontal. Assumido.
- O custo da migração fica explícito e crescente: cada nova ferramenta que escreve em disco é mais
  um item para portar.
- Decisões de hoje ficam legíveis para quem migrar depois — o que é acoplamento aceito e o que é
  descuido.

## Descartado

**Migrar agora para Postgres, fila e armazenamento de objetos.** O produto ainda está descobrindo
o próprio desenho — o modelo de dados mudou seis vezes em uma semana (migrações v11 a v16).
Migrar infraestrutura sob um esquema instável paga o custo duas vezes.

**Assumir a máquina única como permanente e simplificar.** Mais barato hoje, e transforma cada
ferramenta nova em dívida de migração. O que se ganha em velocidade agora se paga com juros no dia
em que o primeiro cliente exigir disponibilidade.

**Manter a promessa de nuvem sem regra nenhuma.** É o pior dos dois: o discurso de portabilidade
sem o comportamento, e o código escorrega para o disco por conveniência.

## Ver também

- [[zonas-de-mudanca]]
- [[trabalho-em-segundo-plano]]
