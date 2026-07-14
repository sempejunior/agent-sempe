# Base local de CCTs (Mediador/MTE)

Sistema que mantém uma base pesquisável de convenções e acordos coletivos dentro da plataforma,
alimentada pelo pipeline **Sindicatos** (downloaders Playwright do Mediador) e consumida pelos
agentes via tool `cct_search` (busca FTS acento-insensível + leitura de cláusulas por
`numero_registro`/`trecho`).

## Arquivos

| Script | Papel |
|---|---|
| `cct_import_sqlite.py` | Import inicial a partir de dump `pg_dump` da tabela `tb_dp_cct` (pipeline original) |
| `cct_load_docs.py` | Carga direta dos extratos `.doc` (HTML do Mediador) → SQLite; **dispensa o Postgres**; idempotente por `numero_registro` |
| `cct_sync.sh` | Ciclo recorrente: download (Sindicatos) → carga → deploy no gateway |

A base fica em `/root/.nanobot/ccts.db` no container (`~/.nanobot/ccts.db` no host):
tabela `ccts` (metadados + texto integral) + índice `ccts_fts` (FTS5 external content,
`unicode61 remove_diacritics 2`).

## Atualização periódica

```bash
# semanal, segunda 03:00 (crontab -e no host)
0 3 * * 1  /caminho/agent-sempe/scripts/cct_sync.sh /caminho/Sindicatos >> ~/cct_sync.log 2>&1
```

O passo de download usa os scripts do projeto Sindicatos no host (requer
`pip install playwright beautifulsoup4 lxml` + `playwright install chromium`). Se o Mediador
estiver fora do ar ou as libs faltarem, o sync segue com os documentos já em disco — a carga é
sempre idempotente. Estado atual: importada a base de mai/2026 (6.593 instrumentos, ~4.6k
vigentes, 27 UFs).

## Evolução prevista

Mover o crawler para dentro do container e agendar pelo cron da própria plataforma
(multiuser, já corrigido) — ver backlog. Enquanto isso, o ciclo acima é o caminho suportado.
