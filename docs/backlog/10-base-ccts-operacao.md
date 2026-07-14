# 10 — Base de CCTs: crawler no container e operação pela plataforma

> **Status:** fase 1 entregue (14/07/2026); operação recorrente ainda depende do host.
> **Prioridade:** P2 (demanda ativa de negócio — mapa de benefícios por cliente para dezenas de
> milhares de CNPJs).
> **Tipo:** dados + infra. Ver `scripts/README_ccts.md` para o estado atual.

## O que já existe (fase 1)

- Base local `~/.nanobot/ccts.db` (SQLite + FTS5 acento-insensível): 6.593 instrumentos do
  Mediador/MTE com texto integral (4.572 vigentes em jul/2026; 87% protocolados em 2025-2026;
  coleta até 25/05/2026).
- `scripts/cct_import_sqlite.py` (import de dump do pipeline Sindicatos) e
  `scripts/cct_load_docs.py` (carga direta dos extratos .doc/HTML — dispensa Postgres; idempotente
  por `numero_registro`).
- Tool `cct_search` (busca FTS + leitura de cláusulas por registro/trecho) habilitada nos agentes;
  skill `sindicatos-beneficios` consulta a base antes da web.
- `scripts/cct_sync.sh`: ciclo download (Sindicatos/Playwright no host) → carga → deploy no
  gateway, agendável no crontab do host.
- Relatório de benefícios (Excel multi-abas + página `publish_report`) gerado da base — extração
  heurística de 9 benefícios com trecho de cláusula auditável.

## Problema (restante)

1. **O download vive no host**: os downloaders do projeto Sindicatos usam Playwright + bs4, que
   não estão na imagem; o cron da plataforma (multiuser, já corrigido) não consegue rodar o ciclo
   completo — dependemos de crontab do host e da pasta `Sindicatos/` externa.
2. **43% dos instrumentos vigentes vencem em 6 meses** (onda de data-base) — sem sync automático a
   base degrada rápido.
3. Extratos com anexo PDF escaneado não têm OCR no fluxo de carga direto (o pipeline original fazia
   OCR na etapa Postgres).
4. Sem visibilidade na UI: nenhum lugar mostra frescor da base, contagem de vigentes, últimas
   atualizações ou falhas de sync.

## Proposta

1. **Portar o crawler para o container**: adicionar `playwright`+`beautifulsoup4` à imagem
   (Chromium já existe — usar `executable_path`), adaptar `mediador_cct_downloader_db.py` para
   escrever direto no SQLite (sem psycopg) e expor como `scripts/cct_sync.py` executável via
   `exec`/cron da plataforma.
2. **Job de cron semanal da plataforma** (dono: admin) rodando o sync com relatório de resultado
   (novos/atualizados/falhas) entregue como mensagem proativa.
3. **OCR de anexos** no fluxo de carga (poppler+tesseract já estão na imagem).
4. **Card de status da base** (frescor, vigentes, próximos vencimentos) na UI — pode nascer como
   seção do relatório recorrente antes de virar tela.
5. Fase seguinte (negócio): cruzamento em lote com a base de clientes (CNPJ → CNAE+município →
   categoria/UF → CCT) materializado em tabela `cliente_cct`, alimentando o mapa por cliente sem
   reprocessamento.

## Não-objetivos

- Substituir o Mediador como fonte (é o registro oficial); sites de sindicatos são complemento.
- Interpretar juridicamente cláusulas — extração é heurística e auditável, validação é do DP/jurídico.
