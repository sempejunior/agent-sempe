---
tipo: proposta-de-regra
data: 2026-08-09
destino: 00-regras/10-zonas-de-mudanca.md
nivel: projeto
status: aguardando-o-usuario
---

# Proposta de regra — zonas de mudança e boas práticas

> **Isto ainda não vale como norma.** `00-regras/` só é escrito por você; o hook bloqueia
> qualquer escrita minha lá. Para colocar em vigor, mova este arquivo para
> `vault/00-regras/10-zonas-de-mudanca.md` e apague o frontmatter de proposta. Enquanto estiver
> aqui, é sugestão.
>
> O que segue **não repete** o `CLAUDE.md` da raiz do repositório, que continua sendo a fonte de
> estilo de código (sem comentário inline, docstring quando o nome não basta, registries em vez
> de if-elif, fonte única de verdade, sem emoji, sem shim). Aqui está o que ele não diz: **onde**
> se pode mexer e a que preço.

## 1. As três zonas

A divisão é pelo raio de dano de um erro, não pela dificuldade nem pelo tamanho do arquivo.

### Borda — mude à vontade

`agent/tools/*` · `skills/*/SKILL.md` · `integrations/catalog.py` · `channels/*` ·
`db/sqlite/seed/*` · componentes de tela.

Erro atinge quem habilitou aquilo. É onde capacidade nova deve nascer. **Comece sempre aqui.**

### Junta — mude com cuidado

`db/repositories.py` e as implementações · `db/sqlite/migrations.py` · endpoints em
`web/server.py` · `agent/user_context.py`.

Erro atinge todos os agentes de um usuário, e migração errada não tem desfazer. Exigências:

- toda mudança entra com teste que descreve o comportamento novo;
- migração é **idempotente** e usa o padrão de fixup que já existe no arquivo;
- **nunca escrever migração que altere agente já criado** — instância é do cliente.

### Núcleo — evite mudar

`agent/loop.py` · `agent/context.py` · `session/manager.py` · `providers/*` ·
`agent/tools/registry.py` · `bus/*`.

Erro atinge todos os clientes ao mesmo tempo, e o loop não tem teste que o percorra inteiro: o
defeito aparece em produção antes de aparecer em teste.

**Antes de abrir um arquivo do núcleo, procure a borda que resolve o mesmo problema.** Na maioria
dos pedidos ela existe. O que parecia precisar de um hook no loop vira uma ferramenta; o que
parecia precisar de um campo no contexto vira uma skill.

Mexer no núcleo é permitido em dois casos, e só neles:

1. **defeito comprovado** — com evidência de que o defeito existe (log, dado, reprodução);
2. **mudança que o usuário pediu conhecendo o alcance** — dita explicitamente, não inferida.

Nos dois casos: teste que falha antes e passa depois, e escopo limitado ao defeito. Se der
vontade de "já que estou aqui", não está mais no caso 1.

## 2. Regras que valem em qualquer zona

- **Nada de assumir disco local ou processo único como permanentes.** Estado que precisa
  sobreviver vai para o banco. Arquivo em disco é cache ou artefato, e quem o produz registra no
  banco que ele existe.
- **Segredo não vai para log, chat, histórico de git nem resposta de API.** Arquivo produzido por
  ferramenta de terceiro não é confiável: mascare antes de servir.
- **Erro do usuário é mensagem; erro nosso é exceção.** As camadas web e de canal traduzem; nunca
  vaza traceback para o cliente.
- **Instrução em prompt não é garantia.** Se a regra precisa valer sempre, ela é código: índice
  único, validação, trava. Prompt orienta; não garante.
- **Deixe o arquivo melhor do que encontrou**, dentro do escopo do que você já está mudando.

## 3. Antes de entregar

```bash
docker cp tests/. nanobot-gateway:/app/tests/
docker exec nanobot-gateway python -m pytest tests/ -q
docker exec nanobot-gateway ruff check .
cd nanobot/web/frontend && npm run build
```

Os três passam, ou não está pronto. Teste que falha entra no relato — nunca some.

## 4. Sobre trabalhar com o gateway em dev

Todo save de `.py` reinicia o gateway por watchmedo e **derruba as sessões abertas**. Edições de
backend vão em lote, com aviso antes de aplicar. Markdown e TSX não reiniciam.

## 5. Como pedir mudança de regra

Se uma destas regras atrapalhar: diga qual, proponha o texto, e diga em que nível deveria ficar.
Não contorne escrevendo "o equivalente" em outro lugar.

## Ver também

- [[zonas-de-mudanca]]
- [[nucleo-do-agente]]
- [[ADR-0001-nucleo-do-agente-e-zona-congelada]]
- [[ADR-0005-local-agora-nuvem-como-destino]]
