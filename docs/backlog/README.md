# Backlog

Itens de trabalho para o Sólides Agent Hub (fork do nanobot) — refactors, features e melhorias.
Cada item é um documento numerado com contexto, proposta, caminho de execução e **status**
(atualizado em 14/07/2026).

Comece por **[00 — Avaliação geral & roadmap](00-avaliacao-e-roadmap.md)**: avalia o projeto como
um todo e justifica a sequência abaixo.

## Ordem de prioridade

`P0` 01 → 02 · `P1` 04 (em andamento) → 03 (parcial) · `P2` 10 → 09 → 08 → 05 · `P3` 06 · `P4` 07

Racional: identidade/segurança/LGPD (01-02) seguem sendo o bloqueio de produção. 04 já está em
andamento (CI + 140 testes) e dá rede de segurança pro resto. 03 avançou de carona no 09 (timeouts,
retry, erro tipado, tokens) — resta idempotência/observabilidade. Entre os P2, o 10 sobe ao topo
por ter **demanda ativa de negócio** (mapa de benefícios por cliente); 09 e 08 vêm em seguida por
tocarem os casos de uso e a UX percebida; 05 é oportunístico (refactor-on-touch já o avança).

## Itens

| # | Item | Status | Prioridade | Tipo |
|---|------|--------|-----------|------|
| 00 | [Avaliação geral & roadmap de produção](00-avaliacao-e-roadmap.md) — prontidão por dimensão + sequenciamento | concluída (avaliação) | — | Análise |
| 01 | [Autenticação, tenancy e RBAC](01-auth-tenancy-rbac.md) — auth real (JWT/senha/API key), org/tenant, papéis | não iniciado | P0 | Segurança/identidade |
| 02 | [Segurança e LGPD](02-seguranca-lgpd.md) — fechar noVNC, cifrar PII, KMS, audit, consentimento/export/retenção, SSRF | não iniciado | P0 | Segurança/dados |
| 03 | [Confiabilidade e observabilidade](03-confiabilidade-observabilidade.md) — retry/idempotência de jobs, logs estruturados, métricas/tracing/health | **parcial** (timeouts+retry LLM+tokens entregues 13/07) | P1 | Robustez/ops |
| 04 | [Qualidade, entrega (CI/CD) e ops](04-qualidade-entrega-ops.md) — CI, testes web/DB, mypy, lockfiles, Dockerfile non-root, API versionada | **em andamento** (CI + 140 testes) | P1 | Engenharia/entrega |
| 05 | [Padronização de capacidades](05-padronizacao-capacidades.md) — organizar tools/skills/templates ("um lar por capacidade") | não iniciado | P2 | Refactor de arquitetura |
| 06 | [Capacidades criadas pelo cliente](06-capacidades-do-cliente.md) — cliente cria tools/skills conversando, só no banco dele (HTTP + MCP remoto) | não iniciado | P3 | Arquitetura + feature |
| 07 | [Cloud, multi-tenant e escala](07-cloud-multi-tenant-escala.md) — workers stateless + Postgres/RLS + Redis + fila + S3 | não iniciado | P4 | Arquitetura de infra |
| 08 | [Feedback de progresso contínuo no chat](08-feedback-de-progresso-no-chat.md) — indicador "pensando/executando", streaming da resposta final, custo do nudge | não iniciado (insumo de tokens pronto) | P2 | Frontend/UX |
| 09 | [Evolução do agent loop](09-evolucao-agent-loop.md) — goal mode, concorrência de canais, subagentes de 1ª classe, AutoCompact, fallback de modelos | **fase 0 entregue**; frente 6 parcial | P2 | Arquitetura do core |
| 10 | [Base de CCTs: crawler no container e operação](10-base-ccts-operacao.md) — sync pela plataforma, OCR de anexos, status na UI, cruzamento com clientes | **fase 1 entregue** (base + tool + relatório) | P2 | Dados + infra |

## Entregas recentes fora do backlog (jul/2026)

Funcionalidades que nasceram de demandas diretas e já estão em produção no dev: seletor de agente
em canal compartilhado (instância única por token + picker por cliente), chat web client-scoped no
painel de pessoas, correções de memória (dedup, fatos efêmeros), identidade do agente no prompt,
ponte gpt-5.6 (responses API), tools `cnpj_lookup` e `cct_search`, skill `sindicatos-beneficios`,
base local de CCTs com relatório de benefícios (Excel + página navegável).
