# Leia antes de escrever código aqui

Este arquivo existe para qualquer agente de código — Claude Code, Kiro, Codex, Cursor, o que for
— que abra este repositório. Ele é curto de propósito: diz o que você **precisa** saber antes da
primeira linha, e para onde ir atrás do resto.

## Os três documentos

| documento | o que responde |
|---|---|
| `CLAUDE.md` (raiz) | **como** escrever código aqui: estilo, padrões, tarefas comuns |
| `vault/_home.md` | **o que** é o produto e como ele funciona por dentro |
| `vault/10-decisoes/` | **por que** as coisas são como são, e o que já foi descartado |

Se você vai mexer em algo que já tem ADR, leia a ADR antes. A seção *Descartado* dela é o que
impede refazer uma discussão que já aconteceu.

## A regra que vale antes de qualquer outra: zonas de mudança

O código se divide por raio de dano de um erro. Descubra em que zona está o arquivo que você vai
abrir.

**Borda — mude à vontade.** `nanobot/agent/tools/*`, `nanobot/skills/*/SKILL.md`,
`nanobot/integrations/catalog.py`, `nanobot/channels/*`, `nanobot/db/sqlite/seed/*`, componentes
de tela. Um erro atinge quem habilitou aquilo. **Capacidade nova nasce aqui.**

**Junta — mude com cuidado.** `nanobot/db/repositories.py` e implementações,
`nanobot/db/sqlite/migrations.py`, endpoints em `nanobot/web/server.py`,
`nanobot/agent/user_context.py`. Um erro atinge todos os agentes de um usuário, e migração errada
não tem desfazer. Entra com teste; migração é idempotente; **nunca** altere agente já criado.

**Núcleo — evite mudar.** `nanobot/agent/loop.py`, `nanobot/agent/context.py`,
`nanobot/session/manager.py`, `nanobot/providers/*`, `nanobot/agent/tools/registry.py`,
`nanobot/bus/*`. Um erro atinge **todos os clientes ao mesmo tempo**, e o loop não tem teste que o
percorra inteiro: o defeito aparece em produção antes de aparecer em teste.

Antes de abrir um arquivo do núcleo, **procure a borda que resolve o mesmo problema** — na maioria
dos pedidos ela existe. Só mexa no núcleo em dois casos: defeito comprovado (com evidência) ou
pedido explícito de quem é dono do produto, ciente do alcance. Nos dois, com teste que falha antes
e passa depois.

Detalhe e justificativa: `vault/20-conceitos/zonas-de-mudanca.md` e
`vault/10-decisoes/ADR-0001-nucleo-do-agente-e-zona-congelada.md`.

## Quatro regras que valem em qualquer zona

- **Não assuma disco local nem processo único como permanentes.** O produto roda numa máquina hoje
  e a nuvem é destino declarado (`ADR-0005`). Estado que precisa sobreviver vai para o banco;
  arquivo em disco é cache ou artefato, e quem o produz registra no banco que ele existe.
- **Segredo não vai para log, chat, git nem resposta de API.**
- **Instrução em prompt não é garantia.** Se a regra precisa valer sempre, ela é código: índice
  único, validação, trava.
- **Sem comentário inline** — só docstring, e só quando o nome não basta. O resto do estilo está no
  `CLAUDE.md`.

## Antes de dizer que terminou

```bash
docker cp tests/. nanobot-gateway:/app/tests/
docker exec nanobot-gateway python -m pytest tests/ -q
docker exec nanobot-gateway ruff check .
cd nanobot/web/frontend && npm run build
```

Os três passam, ou não está pronto. Teste que falha entra no relato — nunca some.

Atenção em dev: todo save de `.py` reinicia o gateway e **derruba as sessões abertas**. Edições de
backend vão em lote.
