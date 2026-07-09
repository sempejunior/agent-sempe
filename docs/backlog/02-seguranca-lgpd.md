# 02 — Segurança e LGPD (dados sensíveis de RH)

> **Status:** proposto, não iniciado. **Prioridade:** P0 (bloqueia produção).
> **Tipo:** segurança / proteção de dados. Ver contexto em [00](00-avaliacao-e-roadmap.md).
> A plataforma armazena dados sensíveis (perfil comportamental, ponto, folha, PDI) → LGPD aplica.

## Problema (estado atual)

- **noVNC sem senha** exposto em produção (`docker-compose.yml:17`, `x11vnc -nopw`) → qualquer um na
  porta 7080 controla o Chromium que o agente dirige (pode ter portais de RH logados).
- **PII em texto puro** no banco: `memories`, `messages`, `client_memories`, `clients.metadata`,
  `rag_chunks`. Só `credentials.secret_cipher` é cifrado — e a `master.key` mora **no mesmo volume**
  dos dados (`~/.nanobot`), anulando a proteção.
- **`audit_log` nunca é escrito** (`audit_repo.log()` existe mas sem call-site) → accountability zero.
- Sem **consentimento**, **export/portabilidade**, **retenção/TTL**, deleção de conta, ou redação de
  PII em logs/erros.
- **SSRF** no `web_fetch` (`web.py:33-43`: sem bloqueio de IP privado/metadata, segue redirect);
  `http_call` deixa o agente controlar path/headers e injeta credencial (exfil via prompt-injection);
  `exec` roda como root com denylist frágil. Sem CORS/headers de segurança; input via dict cru.

## Escopo

### Infra/segurança imediata
- **noVNC**: remover de prod ou proteger (senha + TLS + rede interna). Chromium/desktop só em serviço
  isolado (alinha com 07 F4).
- **CORS** com allowlist de origem + **headers de segurança** globais (HSTS, X-Frame-Options, CSP
  base); manter o CSP já bom do `/r/{token}`.
- **Validação Pydantic** em todos os endpoints (substituir `request.json()` + `.get()`) + limite de
  tamanho de corpo.
- **SSRF guard** compartilhado (mesmo do 06): aplicar no `web_fetch` e travar path/headers do
  `http_call`. `exec` endurecido (sandbox/allowlist) ou desligado em cloud.

### Dados / LGPD
- **Cifrar PII em repouso**: cifra em nível de coluna para campos sensíveis (ou disco/volume
  cifrado) — não deixar `client_memories`/`messages`/`rag_chunks` em claro.
- **Master key fora do volume**: secret manager / KMS (env), com rotação; nunca ao lado do
  `nanobot.db`.
- **Emitir audit events** no `audit_repo` já existente: login, acesso a dado sensível, deleção, uso
  de credencial; agendar `cleanup(90d)`.
- **Direitos do titular**: consentimento (registro + timestamp), **export/portabilidade**
  (`GET .../export`), **retenção/TTL** configurável em messages/memories/clients/rag_chunks, e
  **deleção de conta** de verdade (hoje agent é soft-delete).
- **Redação de PII** em logs/tracebacks (scrubber no handler de erro e no logging).

## Reusa
- `crypto.py` (Fernet) → estender para PII + trocar origem da chave por KMS.
- `audit_repo` já instanciado no factory (só falta chamar).
- Deleção em cascata do schema já correta (`ON DELETE CASCADE`).

## Verificação
- Dump do banco não revela PII (ilegível sem a chave). noVNC exige auth/TLS. `web_fetch` bloqueia
  `169.254.169.254` e IP privado. Audit registra login/deleção/uso de credencial. Export devolve os
  dados do titular; retenção apaga no prazo; deleção de conta remove tudo. Log de erro não vaza
  conteúdo pessoal.

## Riscos
- Cifrar coluna existente exige migração de dados (cifrar em lote) — validar em cópia.
- Alguns pontos já reconhecidos no repo (`SECURITY.md`, `docs/qa/`, BUG-001) — conferir o que já foi
  fechado antes de refazer.
