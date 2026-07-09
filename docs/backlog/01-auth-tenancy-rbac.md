# 01 — Autenticação, tenancy e RBAC

> **Status:** proposto, não iniciado. **Prioridade:** P0 (fundação — bloqueia 06 e 07).
> **Tipo:** segurança / identidade. Ver contexto em [00](00-avaliacao-e-roadmap.md).

## Problema (estado atual)

Não existe autenticação real. `POST /api/auth/register|login` aceitam um `user_id` escolhido pelo
cliente e devolvem `{"token": user_id}`; `Authorization: Bearer <x>` e o `?token=` do WebSocket
tratam a string **como o próprio user_id** (`server.py:189-193, 345-386, 1809-1827`). Qualquer um
se registra com qualquer id e **personifica qualquer usuário** — com dados de RH atrás. Não há hash
de senha, JWT, OAuth/OIDC nem API key; `users.api_key_hash` é coluna morta. Só existe um namespace
plano de `users` (sem org/tenant) e a coluna `users.role` nunca é usada (sem RBAC).

## Objetivo

Identidade verificável, isolamento por organização e papéis, sem quebrar o modelo de recursos
(agentes/skills/tools escopados). Um usuário pertence a uma **org (tenant)**; recursos pertencem à
org; papéis controlam o que cada um faz.

## Escopo

### Autenticação
- Hash de senha (**argon2** ou bcrypt) no registro/login; remover o "token = user_id".
- **JWT** de sessão assinado (exp curto + refresh) **ou** sessão opaca em store (Redis quando o 07
  entrar); suporte a **API keys** (usar `users.api_key_hash`) para acesso programático.
- Preparar ganchos para **OIDC/SSO** (empresas) — provider plugável.
- WebSocket: parar de passar token na URL (`api.ts:871`) — usar subprotocol header ou cookie
  httpOnly; validar o mesmo JWT.
- Rate-limit + lockout em `login`/`register`; sem enumeração de usuário.

### Tenancy (org/tenant)
- Tabela `orgs` (+ `org_id` em `users` e nos recursos owned) numa migração; um usuário pertence a
  uma org; recursos (agents/skills/tools/credentials/integrations) passam a ser escopados por
  `org_id` (mantendo `user_id` como criador). Isso habilita "empresa com N funcionários
  compartilhando agentes".
- **Migração de dados**: cada `user` atual vira uma org de 1 pessoa (não perder nada); validar em
  cópia do banco.

### RBAC
- Papéis: `owner` / `admin` / `builder` / `viewer` (na org). Helper `require_role(...)` e checagem
  de ownership **por org** (não só por user) em todos os endpoints.
- Rotas admin (gestão de membros da org, de templates no futuro) atrás de `admin`.

## Reusa
- `_require_agent`/`_get_owned_client` (padrão de ownership) — estender para checar `org_id`.
- Coluna `users.api_key_hash` já existe (só usar).
- `credentials`+`crypto` para guardar segredos de auth (refresh tokens etc.).

## Verificação
- Usuário A não acessa recurso de B mesmo apresentando o token/id de B (token assinado, expira,
  revoga). Org isola recursos entre orgs. `viewer` recebe 403 em rota de escrita; `admin` gerencia
  membros. Login errado faz lockout; WS autentica sem token na URL.

## Riscos
- Toca quase todos os endpoints — fazer **depois/junto** dos testes de API (04) para ter rede.
- Migração de tenancy é sensível (dados existentes) — reversível e validada em cópia.
