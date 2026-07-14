# 00 — Avaliação geral & roadmap de produção

> **Status:** avaliação concluída; itens derivados 01–10 (ordem viva no
> [README](README.md), atualizada em 14/07/2026).
> **Tipo:** análise de prontidão + roadmap.
> Consolida a avaliação do projeto como um todo para virar SaaS multi-tenant. A numeração dos
> itens é histórica; a **ordem de prioridade atual** é a do README do backlog.

## Recomendação central (muda a ordem de execução)

O projeto é um **protótipo forte** — arquitetura limpa (repositórios por Protocol, dual-mode,
registries declarativas), boas ideias de produto (templates Sólides, capacidades por skill/tool).
Mas **não está pronto para multi-tenant em produção com dados de RH**: os fundamentos de
**identidade, segurança e LGPD estão ausentes** e são **pré-requisito** — precisam vir **antes** de
escalar (07) e de abrir self-service de capacidades (06). Construir 06/07 sobre a base atual é
erguer sobre alicerce trincado.

**Ordem recomendada:**

```
P0  01 Auth + Tenancy + RBAC      ─┐ fundação de identidade e segurança
P0  02 Segurança + LGPD           ─┘ (dados de RH: não abrir/escalar sem isto)
P1  04 Qualidade + Entrega (CI/CD) + Ops   (em andamento; habilita o resto com rede)
P1  03 Confiabilidade + Observabilidade    (parcial: timeouts/retry/tokens entregues via 09)
P2  10 Base de CCTs — operação             (fase 1 entregue; demanda ativa de negócio)
P2  09 Evolução do agent loop              (fase 0 entregue)
P2  08 Feedback de progresso no chat
P2  05 Padronização de capacidades         (oportunístico / refactor-on-touch)
P3  06 Capacidades criadas pelo cliente
P4  07 Cloud, multi-tenant e escala
```

Racional: 04 (testes de API + CI) primeiro dá **rede de segurança** para reescrever auth (01) sem
regressão; 01+02 fecham os buracos críticos; só então faz sentido padronizar (05), abrir
self-service (06) e escalar (07).

## Avaliação por dimensão (achado + severidade)

| Dimensão | Sev | Achado resumido |
|---|---|---|
| **Autenticação** | 🔴 Crítico | Não há auth real: token = `user_id` em texto puro escolhido pelo cliente; `Bearer`/`?token=` são o próprio id (`server.py:189-193, 345-386, 1809-1827`). Qualquer um personifica qualquer usuário. Sem senha/JWT/OAuth/API key; `users.api_key_hash` morta; token não expira/revoga e vaza na URL do WS. |
| **Tenancy** | 🔴 Crítico | Só namespace plano de `users` (`migrations.py:18-39`); sem org/workspace. `clients` são end-users do agente, não colegas. Empresa com N funcionários não compartilha agentes/admin/billing. |
| **RBAC** | 🟠 Alto | `users.role` nunca lida; sem rota admin/`require_admin`/403. Ownership por escopo existe mas é inútil sobre identidade falsificável. |
| **Segurança** | 🔴 Crítico | noVNC **sem senha** exposto em prod (`docker-compose.yml:17`, `-nopw`) → controle do Chromium com sessões de RH. SSRF no `web_fetch` (`web.py:33-43`). `exec` root com denylist frágil. `http_call` com path/headers do agente + injeção de credencial. Sem CORS/headers; input dict cru sem Pydantic; corpos ilimitados. |
| **LGPD** | 🔴 Crítico | PII em **texto puro** (memories/messages/client_memories/clients.metadata/rag_chunks); só credenciais cifradas e `master.key` **no mesmo volume**. `audit_log` nunca escrito. Sem consentimento/export/retenção/deleção de conta/redação em logs. |
| **Confiabilidade** | 🟠 Alto | LLM sem timeout (`litellm_provider.py:222`); tool-call sem timeout (`loop.py:412`); sem retry/idempotência; escritas multi-passo não atômicas; shutdown frágil (KeyboardInterrupt); rate limiter em memória por-processo (embed queima cota do dono). |
| **Observabilidade** | 🟠 Alto | loguru default (texto, sem JSON/rotação); sem correlação request/tenant; sem métricas/tracing/Sentry; `/api/health` é stub. |
| **Qualidade/entrega** | 🟠 Alto | Zero CI/CD; sem pre-commit; **`tests/` no `.gitignore`** (testes novos não versionam); testes finos (0 web, 0 repos DB); sem mypy; `E501` ignorado; sem lockfile; 9 vulns npm; assets buildados commitados. |
| **Ops** | 🟠 Alto | Dockerfile single-stage, **root**, base sem pin, superfície enorme; sem IaC/k8s; sem backup/DR; auto-migrate no boot sem lock. |
| **API** | 🟡 Médio | `server.py` monolítico (2014 linhas, ~67 rotas); sem versionamento; sem OpenAPI; dicts ad-hoc; colisão `/api/skills` (gerencia `tools_enabled`). |
| **O que já é bom** | 🟢 | Repos por Protocol com ponto único de troca; dual-mode; registries; SSRF/CSP já corretos no `/r/{token}`; deleção em cascata correta no schema. |

## Itens derivados (backlog)

- **[01 — Autenticação, tenancy e RBAC](01-auth-tenancy-rbac.md)** (P0)
- **[02 — Segurança e LGPD](02-seguranca-lgpd.md)** (P0)
- **[03 — Confiabilidade e observabilidade](03-confiabilidade-observabilidade.md)** (P1)
- **[04 — Qualidade, entrega (CI/CD) e ops](04-qualidade-entrega-ops.md)** (P1, sempre-on)
- **[05 — Padronização de capacidades](05-padronizacao-capacidades.md)** (P2)
- **[06 — Capacidades criadas pelo cliente](06-capacidades-do-cliente.md)** (P3)
- **[07 — Cloud, multi-tenant e escala](07-cloud-multi-tenant-escala.md)** (P4)

## Riscos transversais
- Itens P0 são segurança séria com dados de RH — **não abrir self-service nem escalar sem 01+02**.
- 01 (org/tenancy) implica migração dos `users` atuais — validar em cópia do banco.
- Reescrita de auth toca quase todos os endpoints — 04 (testes de API) antes reduz risco de regressão.
