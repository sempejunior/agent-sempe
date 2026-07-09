# Backlog

Itens de trabalho propostos para o Sólides Agent Hub (fork do nanobot) — refactors, features e
melhorias ainda não iniciados. Cada item é um documento numerado com contexto, proposta e caminho
de execução.

**Os números seguem a ordem de prioridade** (`00` é o mapa geral). Comece por
**[00 — Avaliação geral & roadmap](00-avaliacao-e-roadmap.md)**: avalia o projeto como um todo e
justifica a sequência abaixo.

## Ordem de prioridade

`P0` 01 → 02 · `P1` 03 → 04 · `P2` 05 · `P3` 06 · `P4` 07
(fundação de identidade/segurança/LGPD antes de escalar ou abrir self-service).

## Itens

| # | Item | Prioridade | Tipo |
|---|------|-----------|------|
| 00 | [Avaliação geral & roadmap de produção](00-avaliacao-e-roadmap.md) — prontidão por dimensão + sequenciamento | — | Análise |
| 01 | [Autenticação, tenancy e RBAC](01-auth-tenancy-rbac.md) — auth real (JWT/senha/API key), org/tenant, papéis | P0 | Segurança/identidade |
| 02 | [Segurança e LGPD](02-seguranca-lgpd.md) — fechar noVNC, cifrar PII, KMS, audit, consentimento/export/retenção, SSRF | P0 | Segurança/dados |
| 03 | [Confiabilidade e observabilidade](03-confiabilidade-observabilidade.md) — timeouts, retry/idempotência, logs estruturados, métricas/tracing/health | P1 | Robustez/ops |
| 04 | [Qualidade, entrega (CI/CD) e ops](04-qualidade-entrega-ops.md) — CI, testes web/DB, mypy, lockfiles, Dockerfile non-root, API versionada | P1 | Engenharia/entrega |
| 05 | [Padronização de capacidades](05-padronizacao-capacidades.md) — organizar tools/skills/templates ("um lar por capacidade") | P2 | Refactor de arquitetura |
| 06 | [Capacidades criadas pelo cliente](06-capacidades-do-cliente.md) — cliente cria tools/skills conversando, só no banco dele (HTTP + MCP remoto) | P3 | Arquitetura + feature |
| 07 | [Cloud, multi-tenant e escala](07-cloud-multi-tenant-escala.md) — workers stateless + Postgres/RLS + Redis + fila + S3 | P4 | Arquitetura de infra |
