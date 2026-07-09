# 06 — Capacidades criadas pelo cliente (tools & skills sem código, cloud-safe)

> **Status:** proposto, não iniciado.
> **Tipo:** arquitetura + feature (faseado).
> **Depende de:** [05 — Padronização de Capacidades](05-padronizacao-capacidades.md)
> (referenciar, não copiar; um lar por capacidade).

## 1. Contexto e objetivo

O produto vai pro cloud e é multi-tenant. O cliente precisa criar **skills e tools
conversando** com o agente, e essas capacidades **não podem morar no código** — só no **banco do
próprio cliente**. Hoje: skill do cliente já funciona (grava no DB); **tool exige Python**, o que
é incompatível com cloud/self-service. Objetivo: um cliente descreve uma capacidade em linguagem
natural e ela passa a existir e executar, isolada no tenant dele, sem deploy de código.

## 2. Princípio

**Capacidade = dado. Executor = código.**
A plataforma envia um punhado de **executores genéricos** (código, no registry). As tools do
cliente são **linhas no banco dele** (um spec: nome, descrição, JSON-Schema dos args, tipo,
conexão, referência de credencial). Na montagem do contexto, `build_tool_registry` carrega as
linhas do cliente e instancia o executor genérico por linha — exatamente como o
`MCPToolWrapper` já faz hoje (uma classe, N instâncias a partir de dados). Nada por-tenant no
código ou em disco.

Isso estende o item 05: **Tool passa a ter dois lares** (igual skill) — *builtin* (executores +
tools nativas, em código) e *usuário* (linhas no DB). Referência por id/nome continua valendo.

## 3. Como o mercado faz (fundamentação)

Convergência clara — todos guardam a capacidade como **dado** e executam com runtime genérico:

- **OpenAI GPT Actions**: cliente cola um **OpenAPI/Swagger** + auth; a plataforma gera as
  function-tools e executa como chamada HTTP. Nada de código do cliente.
- **Dify**: "custom tools" via **OpenAPI/Swagger** (colar, importar por URL, ou exemplo) → gera a
  interface da tool; guardado no banco.
- **MCP remoto (Streamable HTTP)**: padrão emergente (2025/2026) pra tools plugáveis sem hospedar
  código no app — endpoint único, stateless, atrás de load balancer, multi-tenant por URL/OAuth.
  Adotado por Cloudflare Agents, OpenAI Agents SDK, Azure DevOps remote MCP.
- **SSRF (OWASP)**: para requisição HTTP definida por usuário, **allowlist** de destino, **bloquear
  IPs privados/loopback/link-local e metadata** (127/8, 10/8, 172.16/12, 192.168/16,
  169.254.169.254), re-resolver DNS a cada redirect, e limitar redirects/tamanho/timeout.

Ou seja, os dois tipos escolhidos — **HTTP declarativa** e **MCP remoto** — são exatamente o que o
mercado consolidou. Fontes no fim do doc.

## 4. Modelo-alvo

### 4.1 Skills (quase pronto — só padronizar e validar)
`save_skill` já grava skill do cliente no DB `skills` e ela entra no prompt (`SkillsLoader` →
`ContextBuilder`), com `read_skill` pra expandir sob demanda. Fica: (a) padronizar pelos dois
lares do item 05; (b) **validação server-side** do conteúdo (hoje só cap de tamanho); (c) UI de
gerenciamento. Skill é **texto instrucional** — não executa nada por si; quem executa são as tools.

### 4.2 Tools do cliente — dois tipos, guardados no DB
- **`http`** (o caso 80%): spec declarativo de uma chamada REST — `method`, `url` (template),
  `headers`, `query`, `body` (template), `auth` (ref a uma linha de `credentials`), mapeamento de
  resposta. Import de **OpenAPI/Swagger** gera 1 tool `http` por operação (como GPT Actions/Dify).
- **`mcp`** (remoto): o cliente aponta um **MCP server remoto** (URL streamable-HTTP + auth); as
  tools dele aparecem como `mcp_<slug>_*`. No cloud, **só transporte remoto** — stdio/command
  (npx) fica desabilitado por flag (mantém no dev local).

### 4.3 Storage (só no banco do cliente)
- **Nova tabela `user_tools`**: `id, user_id, name (único por user), description,
  parameters (JSON Schema), kind ('http'|'mcp'), spec (JSON), credential_id (FK nullable),
  enabled, created_at, updated_at`. Segredos **nunca** no `spec` — sempre referência a
  `credentials` (já Fernet-encriptado). MCP remoto pode virar linha aqui (kind `mcp`) ou estender
  `user_integrations`; preferir `user_tools` pra unificar.
- **Habilitação por agente**: `tools_enabled` referencia o `name` da tool (consistente com item 05
  — referência, não cópia).

### 4.4 Executores genéricos (código, reaproveitando o que existe)
- **HTTP executor**: uma subclasse `Tool` cujo `name`/`description`/`parameters` vêm da linha do
  DB e cujo `execute` monta a chamada a partir do `spec`. Reusa o encanamento de
  `http_call.py` (`_perform`/`_apply_auth`/`_resolve_path`) — é literalmente preencher o gancho
  `_call_custom` (hoje "not implemented") lendo o endpoint do DB em vez do catálogo. **+ guard SSRF.**
- **MCP remoto**: reusa o transporte streamable-HTTP já fiado em `mcp.py` e o `MCPToolWrapper`.
  (Corrigir 2 pontos achados: verificar o nome do import `streamable_http_client` vs
  `streamablehttp_client` do SDK `mcp>=1.26`; e `build_user_mcp_servers` não repassa `headers`/
  `auth_*` pra MCP remoto — repassar.)
- **Registry**: `build_tool_registry` (`user_context.py`) ganha um passo que carrega as
  `user_tools` do usuário e registra uma instância do executor por linha. Já tem
  `credential_repo`/`integration_repo`/`user_id` em escopo; só precisa virar `async` **ou**
  pré-carregar as linhas em `build_user_context` e passar por parâmetro.

### 4.5 Fluxo conversacional (criar tool falando)
Espelhar o que já existe pra skill (`skill-creator` + `save_skill`):
- **Nova tool `save_tool`** (como `save_skill`): valida e persiste a linha em `user_tools`.
- **Agente "Tool Builder"** (template ou skill builtin): entrevista o cliente, rascunha o spec
  (ou ingere um OpenAPI por URL/colagem), **testa** (dry-run HTTP read-only / handshake MCP),
  e chama `save_tool`. UI de gerenciamento (listar/editar/desativar) como complemento.

## 5. Segurança cloud (a espinha — hoje inexistente)

- **Guard SSRF** (módulo novo, aplicado no HTTP executor **e** retrofit no `http_call`):
  allowlist de host (opcional por tenant), bloquear IP privado/loopback/link-local/metadata
  (169.254.169.254), re-resolver DNS a cada hop, negar/limitar redirects, **só https**,
  timeout e teto de tamanho de resposta por tenant. Sem isso, um cliente aponta `base_url` pra
  metadata da nuvem — hoje é possível (`http_call` não tem nenhuma proteção).
- **MCP**: só remoto no cloud (flag `allow_stdio_mcp=false`); stdio spawna processo (npx) — inviável
  multi-tenant.
- **Segredos**: sempre em `credentials` (Fernet); nunca no `spec`. Futuro: KMS/rotação (hoje fora).
- **Isolamento por tenant**: linhas escopadas por `user_id`; o registry monta só as tools do tenant;
  quotas de rate/timeout/tamanho por tenant.
- **Egress**: idealmente saída por proxy/rede restrita (infra) — complementa o guard de aplicação.
- **Validação server-side** de todo spec (JSON Schema bem-formado; url/host permitidos; auth
  referencia credencial existente do próprio user).

## 6. Reusa vs constrói novo

**Reusa/estende:** `Tool`+`MCPToolWrapper`+`ToolRegistry` (uma classe, N instâncias por dado);
`build_tool_registry` (já tem os repos); `http_call` plumbing (`_call_custom` é o gancho);
`credentials` + `crypto` (Fernet) completos; transporte MCP remoto já fiado; skills conversacionais
já funcionam.
**Constrói novo:** tabela `user_tools` (+ repo/protocol); executor genérico guiado por spec do DB;
**guard SSRF**; implementação real do `_call_custom` lendo do DB; tool `save_tool`; agente Tool
Builder + UI; validação server-side dos specs.

## 7. Faseamento

1. **F1 — Núcleo HTTP (sem código do cliente)**: tabela `user_tools` + repo; executor HTTP genérico
   (via `_call_custom` do DB); **guard SSRF** + retrofit no `http_call`; `save_tool`; registry
   carrega as linhas. Entregável mínimo: cliente cria uma tool HTTP por chamada de ferramenta e ela
   executa com segurança.
2. **F2 — OpenAPI import**: colar/URL de OpenAPI → gera N tools `http`.
3. **F3 — MCP remoto self-service**: linha `kind='mcp'` (URL+auth) → tools aparecem; corrigir os 2
   pontos do MCP remoto.
4. **F4 — Conversa + UI**: agente Tool Builder (entrevista, testa, salva) + tela de gestão de tools;
   validação/UX de skills.
5. **F5 — Hardening cloud**: KMS/rotação de chave, egress via proxy, quotas por tenant, auditoria.

## 8. Verificação

- `pytest` + `ruff` a cada fase (no container; editar `.py` em lote — watchmedo reinicia o gateway).
- F1: criar `user_tools` numa cópia do banco; `save_tool` grava; a tool aparece no registry do
  agente e executa uma chamada HTTP real; guard SSRF **bloqueia** `169.254.169.254`, IP privado e
  http não-TLS; segredo vem de `credentials`, nunca do spec.
- F3: registrar um MCP remoto de teste → tools `mcp_<slug>_*` aparecem e chamam.
- E2E: no chat, "crie uma tool que consulta a API X" → Builder entrevista, testa, salva; nova
  conversa já usa a tool. Nada gravado em disco/código; tudo em linhas do tenant.

## 9. Riscos / decisões em aberto

- SSRF é segurança séria: sem o guard, a feature é um vetor. F1 não sai sem ele.
- `user_tools` vs estender `user_integrations`: recomendo `user_tools` (unifica http+mcp do cliente;
  `user_integrations` fica pro catálogo Sólides pré-definido).
- Tool de código em sandbox ficou **fora** (decisão do usuário) — reavaliar no futuro se surgir
  demanda (Deno/Pyodide/E2B).
- `build_tool_registry` async vs pré-fetch: decidir na F1 (pré-fetch em `build_user_context` é o
  menos invasivo).

## 10. Fontes

- OpenAI GPT Actions — <https://developers.openai.com/api/docs/actions/introduction>
- Dify Tools (OpenAPI custom tools) — <https://docs.dify.ai/en/cloud/use-dify/workspace/tools>
- MCP Streamable HTTP (remote) — <https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/> · <https://openai.github.io/openai-agents-js/guides/mcp/>
- OWASP SSRF Prevention — <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>
