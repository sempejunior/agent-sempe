# Hardening de credenciais para produção (MCPs & APIs)

## Contexto

A feature de MCPs & APIs (branch `solides-agent-hub`) permite que usuários cadastrem credenciais de integrações (GitHub, Jira, Notion, Slack, Grafana, etc.). Hoje as credenciais são armazenadas na tabela `credentials` do SQLite, criptografadas com Fernet (`nanobot/utils/crypto.py`).

Essa implementação é adequada para desenvolvimento e para o piloto interno, mas **não é suficiente para produção**. Este documento rastreia os itens que precisam ser endereçados antes do go-live externo.

## Itens de hardening

### 1. Gestão da master key
- Hoje: chave lida de `NANOBOT_SECRET_KEY` ou persistida em `data_dir/master.key` (perm `0o600`).
- Alvo: **KMS/Vault** (AWS KMS, HashiCorp Vault ou GCP KMS). A master key nunca deve tocar o disco do container.
- Considerar **envelope encryption**: DEK por credencial, KEK no KMS.

### 2. Rotação de credenciais
- Endpoint / job para rotacionar a master key sem downtime (reencrypt em background).
- Suporte a rotação de credenciais individuais (renovar token OAuth, PAT do GitHub etc.) com histórico de versões.
- Alertas de credenciais próximas do vencimento.

### 3. Audit log
- Registrar toda operação sensível: criação, leitura (uso pelo agente), atualização e remoção de credencial.
- Log estruturado, tamper-evident (append-only), com `user_id`, `agent_id`, `integration_slug`, `endpoint`, timestamp.
- Retenção configurável e export para SIEM.

### 4. Escopo por agente
- Hoje: qualquer integração ativada vira `http_call` disponível para todos os agentes do usuário.
- Alvo: permitir vincular integrações a agentes específicos e/ou a papéis, com allowlist de endpoints por agente.

### 5. Rate limit e circuit breaker no `http_call`
- Proteção contra loops do agente que estouram cota da API externa.
- Circuit breaker por (user, integration) para falhas encadeadas.

### 6. Validação de credenciais no cadastro
- Ping opcional no endpoint de "whoami"/"me" do provider ao salvar, para detectar credencial inválida logo no cadastro em vez de na primeira chamada do agente.

### 7. Segregação de dados
- Avaliar mover a tabela `credentials` para um banco/schema separado com permissões mais restritas.
- Backups criptografados separadamente do restante da base.

## Arquivos relevantes

- `nanobot/utils/crypto.py` — helper Fernet + master key
- `nanobot/db/sqlite/credentials_repo.py` — persistência
- `nanobot/db/sqlite/integrations_repo.py` — vínculo user↔catálogo
- `nanobot/integrations/catalog.py` — catálogo sistêmico
- `nanobot/agent/tools/http_call.py` — consumo em runtime
- `nanobot/web/server.py` — endpoints `/api/credentials` e `/api/integrations`

## Definition of done

- [ ] Master key gerenciada por KMS/Vault
- [ ] Envelope encryption implementado
- [ ] Fluxo de rotação (master key + credencial individual)
- [ ] Audit log estruturado com retenção configurável
- [ ] Escopo de integração por agente
- [ ] Rate limit / circuit breaker no `http_call`
- [ ] Validação síncrona da credencial no cadastro
- [ ] Documentação de operação (runbook de rotação e incidente)
