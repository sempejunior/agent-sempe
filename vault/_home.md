---
tipo: home
data: 2026-08-09
projeto: solides-agent-hub
---

# Sólides Agent Hub

Plataforma onde um cliente monta os próprios agentes de IA — escreve o prompt, liga skills,
conecta as ferramentas dele — em cima de um núcleo Sólides de agentes de RH prontos. É um fork
do nanobot, que era um motor de agente de usuário único, virado produto multiusuário.

O código vive em `/home/carlosjunior/Documentos/Projetos/agent-sempe`. As regras de escrita de
código estão em `CLAUDE.md`, na raiz do repositório, e **não são repetidas aqui** — este vault
guarda o porquê, não o como.

## As duas pessoas que usam isto

Toda decisão de produto se resolve perguntando para qual das duas ela é:

- **Quem constrói** (o admin do cliente): usa o Agent Studio, as Skills e as Integrações para
  criar agentes a partir de templates, escrever skills e ligar ferramentas — sem escrever código.
- **Quem conversa** (as pessoas do cliente): fala com esses agentes pelo chat web ou por
  Telegram, WhatsApp, Discord e Slack, com memória e sessões isoladas por pessoa.

## Como o sistema funciona, de fora para dentro

Uma mensagem entra por um **canal** (o chat web por WebSocket, ou um adaptador de plataforma) e
vira um evento no **bus**. O **agent loop** monta o contexto daquele turno — prompt base, skills
disponíveis como índice, memória, RAG —, chama o modelo pela camada de provider (LiteLLM), e
executa as ferramentas que o modelo pedir, em paralelo quando são independentes. No fim do turno
a resposta sai pelo bus de volta ao canal.

O que torna isso multiusuário é o `UserContext`: para cada par usuário+agente, o sistema monta na
hora um conjunto próprio de sessões, memória, RAG, skills e **apenas as ferramentas que aquele
agente habilitou**. Um agente é uma linha na tabela `agents` com seu prompt, suas tools e sua
configuração — ver [[agente-e-instancia-independente]].

As capacidades vêm de quatro lugares, cada uma com uma casa só — ver
[[capacidade-referenciada-nao-copiada]]:

| capacidade | onde mora | como é referenciada |
|---|---|---|
| ferramenta | classe Python + catálogo | pelo `id` |
| skill | `nanobot/skills/*/SKILL.md` ou tabela `skills` | pelo nome |
| template de agente | seed `agent_templates_solides.py` | pelo `template_id` |
| integração / MCP | `integrations/catalog.py` + `user_integrations` | pelo slug |

O caminho de auto-serviço mais importante é a **integração**: o cliente ativa uma no painel,
guarda a credencial cifrada, e um servidor MCP vira ferramentas `mcp_<slug>_*` no próximo turno.
É assim que um agente ganha capacidade nova sem ninguém escrever código.

## O agente de sustentação, que é o caso de uso mais exigente

Existe um fluxo que usa quase tudo ao mesmo tempo e por isso funciona como prova real da
plataforma: um agente lê o board do Azure, entende a demanda, acha os repositórios pela skill do
projeto, delega a escrita do código ao Claude Code rodando na mesma máquina, roda os testes,
abre o Pull Request e comenta o link na demanda. **Ele nunca faz merge** — para exatamente onde
uma pessoa revisa.

Esse fluxo é o que forçou as peças mais recentes: trabalho em segundo plano
([[trabalho-em-segundo-plano]]), pendências que esperam uma decisão humana, o teto de turno que
avisa em vez de matar ([[ADR-0002-teto-do-turno-avisa-em-vez-de-cancelar]]) e a demanda que
entrega em vários repositórios ([[ADR-0003-uma-demanda-varios-repositorios]]).

## O sonho: web e nuvem. A realidade: uma máquina só

A arquitetura foi desenhada olhando para nuvem multi-tenant — repositórios atrás de Protocols,
registries no lugar de cadeias de `if`, tudo escopado por usuário e por agente desde o banco. A
intenção está no código. **A execução, não.** Hoje isto roda inteiro em uma máquina, por Docker
Compose, e o que segura ali é concreto:

- **O banco é um arquivo SQLite** de 2,7 MB. Um escritor por vez. Não há Postgres, não há
  isolamento por linha, não há réplica.
- **O disco local é parte do estado.** O workspace tem **1,4 GB**: 1,2 GB é o binário do Claude
  Code instalado sob demanda, 172 MB são clones de repositório dos agentes, e ainda estão lá as
  páginas publicadas (`reports/*.html`) e os logs de cada delegação. Nada disso é objeto remoto;
  um segundo processo em outra máquina não enxerga.
- **As tarefas de fundo moram no processo.** O `JobRunner` guarda o pid do filho e mata órfão por
  pid depois de um restart. Isso só faz sentido enquanto quem reinicia é a mesma máquina que
  gerou o processo.
- **Os servidores MCP são subprocessos locais**, ligados ao ciclo de vida do gateway.
- **O segredo é cifrado com um `master.key` em disco**, ao lado do banco.
- **A sessão fica em cache na memória do processo** que atende o turno.

Quer dizer: o caminho para a nuvem não é "trocar o banco". É trocar disco por armazenamento de
objetos, processo por fila, cache local por cache compartilhado, e pid por identidade de tarefa.
O desenho de destino está registrado em [[ADR-0005-local-agora-nuvem-como-destino]] e em
`docs/backlog/07-cloud-multi-tenant-escala.md`.

Enquanto isso não acontece, a regra que evita cavar mais fundo o buraco é
[[zonas-de-mudanca]]: código novo não pode assumir disco local nem processo único como se
fossem para sempre.

## Onde mexer e onde não

O núcleo — loop do agente, sessão, contexto, provider — é **zona congelada**
([[nucleo-do-agente]] e [[ADR-0001-nucleo-do-agente-e-zona-congelada]]). Capacidade nova entra
como ferramenta, skill, integração ou template, que são as bordas feitas para crescer. As regras
completas estão na proposta [[proposta-00-regras-zonas-de-mudanca]], que ainda precisa ser movida
para `00-regras/` por você para valer como norma.

## Estado hoje

- Migrações do banco na **v16**; **472 testes** passando; `ruff` limpo.
- 7 agentes ativos, 11 skills, 6 integrações ligadas (Azure DevOps por API e por MCP, GitLab,
  Claude Code e as duas do Start).
- Modo de produto é `--multiuser`. O modo de arquivo único (CLI) é herança do upstream: mantido
  funcionando, não expandido.

## Decisões

```dataview
TABLE status, data, decide
FROM "10-decisoes"
SORT file.name ASC
```

## Conceitos

```dataview
TABLE data, tags
FROM "20-conceitos"
SORT file.name ASC
```

## Sessões

```dataview
TABLE data
FROM "90-sessoes"
SORT data DESC
LIMIT 10
```
