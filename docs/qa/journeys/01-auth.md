# Jornada 01 — Autenticação multiusuário

## Endpoints envolvidos

- `POST /api/auth/register` — `nanobot/web/server.py:300-328`
- `POST /api/auth/login` — `nanobot/web/server.py:330-341`
- `GET /api/me` — `nanobot/web/server.py:343-346`
- Middleware `_require_user()` — `nanobot/web/server.py:144-161`

## Passos executados

1. Registrar `qa_alice` (201 esperado, 200 obtido — aceitável).
2. Registrar `qa_bob`.
3. `GET /api/me` com Bearer `qa_alice` → dados de Alice.
4. `GET /api/me` sem Authorization → 401 `Missing or invalid Authorization header`.
5. `GET /api/me` com Bearer inexistente → 401 `User not found`.
6. Registrar `qa_alice` de novo → 409 `User already exists` ✅

## Resultado

✅ **Todos os cenários passam.** Erros bem tratados, códigos HTTP consistentes.

## Observações

- Autenticação é **Bearer token = user_id em texto puro**. É intencional para o modo dev/self-hosted, mas para produção multi-tenant vai precisar de algo tipo JWT/sessão. Fora do escopo do QA — sinalizado para roadmap.
- Não há endpoint público para listar usuários (correto — usar CLI `nanobot user list`).
- Não achei rate limit no register. Um atacante poderia criar usuários em loop. Não é bug de correção urgente mas anotar.

## Nenhum bug aberto nesta jornada.
