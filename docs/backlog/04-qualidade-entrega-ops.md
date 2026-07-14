# 04 — Qualidade, entrega (CI/CD) e ops

> **Status:** em andamento (branch `chore/ci-e-qualidade`). **Prioridade:** P1 (sempre-on).
> **Tipo:** engenharia / entrega. Ver contexto em [00](00-avaliacao-e-roadmap.md).
>
> **Feito:** `tests/` versionado (fora do `.gitignore`); ruff limpo em `nanobot`+`tests`
> (per-file-ignores p/ o módulo compacto `azure_report.py` + params camelCase de tools);
> CI (`.github/workflows/ci.yml`: ruff + pytest + build do frontend) e `.pre-commit-config.yaml`.
> Suíte em **140 testes** (jul/2026): repositórios, API de auth/agentes, seleção de agente em canal
> compartilhado, resiliência do loop (retry/timeout/paralelismo/tokens), tools cnpj_lookup e
> cct_search.
> **A fazer:** mypy; ativar `E501`; cobrir web/API (TestClient) e repos DB; eslint como gate
> (hoje advisory — 3 erros pré-existentes no front); tirar assets buildados do git; Dockerfile
> multi-stage/non-root; versionamento de API.

## Problema (estado atual)

- **Zero CI/CD** (sem `.github/workflows`, GitLab CI, etc.); sem **pre-commit**. Nada roda lint/
  testes/build automaticamente; nada barra merge.
- **`tests/` está no `.gitignore`** → testes novos **não são versionados** (os desta sessão já ficaram
  fora). Risco de perda silenciosa.
- Testes finos: **0 endpoints web/API**, **0 repositórios de DB** cobertos (a maior superfície de
  risco multi-tenant); sem `conftest.py`/fixtures; sem cobertura medida; **sem testes de frontend**.
- Sem **mypy/pyright**; ruff com **`E501` ignorado** (limite de 100 não é aplicado); `Any` difuso.
- Build não-reprodutível: **sem lockfile** (uv.lock/package-lock), deps por faixa; **9 vulns npm**;
  **assets buildados commitados** no git (diffs ruidosos, artefato obsoleto).
- **Ops**: Dockerfile single-stage, **root**, base sem digest pin, superfície enorme (chromium/vnc/
  tesseract/node); sem IaC/k8s; **sem backup/DR** (SQLite em bind-mount, journal DELETE); auto-migrate
  no boot sem lock (raça com N réplicas).
- **API**: `server.py` monolítico (2014 linhas, ~67 rotas), sem versionamento (`/api/v1`), sem
  OpenAPI (docs desligado), dicts ad-hoc, colisão de nome `/api/skills` (gerencia `tools_enabled`).

## Ação imediata (barata, alto valor)
- **Remover `tests/` do `.gitignore`** e versionar os testes já existentes (evita perda).

## Escopo

### Qualidade / testes
- **CI** (GitHub Actions ou equivalente) rodando em PR: `ruff` + `mypy` + `pytest` (com cobertura) +
  build do frontend (`tsc -b`) + `eslint` + `pip-audit`/`npm audit`; **gate** de merge.
- **pre-commit** (ruff format/lint, fim de arquivo, checagem de segredos).
- Cobrir **web/API com TestClient** (auth, isolamento por tenant, CRUD) e **repos de DB** — foco no
  risco multi-tenant. `conftest.py` + fixtures (DB temporário, usuário/org fake).
- Ativar `E501`; adicionar **mypy** (subir gradual, começando por `db/`, `agent/`); reduzir `Any`.

### Entrega / build
- **Lockfiles** commitados (uv.lock + package-lock) e pin de deps; corrigir vulns npm.
- **Tirar assets buildados do git** (`web/frontend/static/assets/*`); o build gera no CI/imagem.

### Ops / deploy
- Dockerfile **multi-stage + non-root (`USER`) + digest pin + HEALTHCHECK**; separar a imagem
  pesada (chromium/vnc) do runtime da API.
- **IaC/manifests** (k8s) para os deployables do 07; **backup/DR** do banco (com Postgres do 07:
  PITR); **migração com lock** (evitar raça no boot com N réplicas).
- **API**: versionar (`/api/v1`), quebrar `server.py` em **routers** por domínio, contratos
  **Pydantic** + **OpenAPI** ligado, resolver a colisão `/api/skills`.

## Verificação
- CI vermelho barra merge; PR roda lint+types+testes+build. `tests/` versionado; cobertura sobe em
  web/DB. mypy/ruff limpos com `E501` ativo. Build reprodutível a partir do lockfile; sem assets no
  git. Imagem roda **non-root** e passa healthcheck. API sob `/api/v1` com `/docs` (OpenAPI) e
  contratos tipados.
