# Arquitetura da Camada de Clientes (End-Users)

> Identidade de end-users, memória por cliente e isolamento de sessões para a plataforma de agent builder.

---

## Sumário

1. [Terminologia](#1-terminologia)
2. [Problema](#2-problema)
3. [Visão Geral da Arquitetura](#3-visão-geral-da-arquitetura)
4. [Sistema de Identidade do Cliente](#4-sistema-de-identidade-do-cliente)
5. [Modelo de Memória por Cliente](#5-modelo-de-memória-por-cliente)
6. [Modelo de Sessões](#6-modelo-de-sessões)
7. [Fluxo de Processamento de Mensagens](#7-fluxo-de-processamento-de-mensagens)
8. [Estrutura do System Prompt](#8-estrutura-do-system-prompt)
9. [Superfície de API](#9-superfície-de-api)
10. [Wireframes do Frontend](#10-wireframes-do-frontend)
11. [Módulos Impactados](#11-módulos-impactados)
12. [Estratégia de Migração](#12-estratégia-de-migração)
13. [Decisões de Design](#13-decisões-de-design)

---

## 1. Terminologia

| Termo | Definição |
|-------|-----------|
| **Creator** | A pessoa que possui e configura o agente. Acessa a web UI. Define prompts, tools, modelo, RAG e canais. Possui um `user_id` na tabela `users`. |
| **Cliente (Client)** | Um end-user que conversa com o agente de um creator por meio de um ou mais canais. Possui um `client_id` na tabela `clients`. NÃO acessa a web UI. |
| **Identidade de Canal** | Um identificador externo específico de um cliente em uma plataforma: um user ID do Telegram, um número de telefone do WhatsApp, um snowflake do Discord, um endereço de e-mail, etc. Um cliente pode ter múltiplas identidades de canal. |
| **Sessão** | Um thread de conversa entre um cliente e o agente, vinculado a um canal e opcionalmente a um thread/grupo. |
| **Memória de Longa Duração** | Fatos persistentes sobre um cliente que sobrevivem entre sessões e canais. Preferências, nome, interesses, histórico de interações. |
| **Memória de Curta Duração** | Resumos de conversas recentes. Gerados automaticamente pela consolidação de sessões. Cobre o que aconteceu nas últimas N conversas. |

---

## 2. Problema

### Modelo Atual: Uma Única Entidade

O sistema possui apenas um conceito de usuário — o **Creator**. Quando end-users conversam com o agente pelos canais, todas as mensagens são mapeadas para o `user_id` do creator:

```
Cliente João (Telegram)  ─┐
Cliente Maria (WhatsApp)  ─┼─► channel_bindings ─► user_id do creator
Cliente Pedro (Discord)   ─┘
                                      │
                                      ▼
                           Memória, sessões e contexto do creator
                           (compartilhados por TODOS os clientes)
```

### O Que Dá Errado

- João diz "meu nome é João" → salvo na memória do **creator**
- Maria pergunta "qual meu nome?" → agente lê a memória do **creator** → pode responder "João"
- Todos os clientes compartilham o mesmo histórico de conversas consolidado em uma única memória
- Não há como rastrear clientes individuais, suas preferências ou histórico de interações
- Não há como o creator ver "quem são os usuários do meu agente"

### O Que Precisamos

Separação entre **quem configura o agente** (Creator) e **quem conversa com o agente** (Cliente):

```
Creator ─── configura ──► Comportamento do agente (prompts, modelo, tools, RAG, skills)
                              │
Cliente ─── conversa ──► Estado do cliente (memória, sessões, identidade)
```

---

## 3. Visão Geral da Arquitetura

### Matriz de Propriedade

```
┌──────────────────────────────────────────────────────────────────┐
│                  CREATOR possui (config do agente)               │
│                                                                  │
│  Prompts          Modelo & Provider    Tools           RAG       │
│  (SOUL.md,        (temperature,        (lista          (base de  │
│   AGENTS.md,       max_tokens,          habilitada,     conheci- │
│   USER.md)         chaves de API)       MCP servers)    mento)   │
│                                                                  │
│  Skills            Canais              Rate Limits               │
│  (builtin +        (Telegram,          (quotas globais,          │
│   customizadas)     Discord, etc.)      caps por cliente)        │
├──────────────────────────────────────────────────────────────────┤
│                  CLIENTE possui (estado conversacional)           │
│                                                                  │
│  Identidade        Memória de Longa     Memória de Curta         │
│  (IDs multi-canal   Duração (nome,       Duração (resumos        │
│   vinculados a um    preferências,        de conversas           │
│   único client_id)   fatos, interesses)   recentes)              │
│                                                                  │
│  Sessões           Metadados                                     │
│  (threads de       (first_seen,                                  │
│   conversa por      last_seen,                                   │
│   canal)            total_interactions)                           │
└──────────────────────────────────────────────────────────────────┘
```

### Princípio Central

Toda interação com o agente combina:
- **Configuração do Creator** → define o que o agente É e como ele se comporta
- **Estado do Cliente** → define com QUEM o agente está falando e o que ele sabe sobre essa pessoa

O web chat do creator mantém um fluxo separado — o creator usa sua própria tabela `memories` (comportamento atual), não a camada de clientes.

---

## 4. Sistema de Identidade do Cliente

### 4.1 Modelo de Dados

#### Tabela `clients`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `client_id` | TEXT PK | UUID, identificador único do sistema |
| `creator_id` | TEXT FK → users | A qual creator este cliente pertence |
| `display_name` | TEXT | Nome legível (auto-preenchido pelo canal, editável pelo creator) |
| `metadata` | TEXT (JSON) | Pares chave-valor arbitrários (tags, notas, campos customizados) |
| `first_seen` | TEXT | Datetime ISO da primeira interação |
| `last_seen` | TEXT | Datetime ISO da interação mais recente |
| `total_interactions` | INTEGER | Contagem total de mensagens |
| `status` | TEXT | `active`, `blocked`, `archived` |
| `created_at` | TEXT | Timestamp de criação do registro |
| `updated_at` | TEXT | Timestamp da última modificação |

Índices: `(creator_id, status)`, `(creator_id, last_seen DESC)`

#### Tabela `client_identities`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK | Auto-increment |
| `client_id` | TEXT FK → clients | A qual cliente esta identidade pertence |
| `creator_id` | TEXT FK → users | Desnormalizado para consultas eficientes |
| `channel` | TEXT | Nome da plataforma: `telegram`, `whatsapp`, `discord`, `slack`, `email`, `web` |
| `external_id` | TEXT | Identificador específico do canal (ver 4.2) |
| `display_name` | TEXT | Nome de exibição do canal (username, telefone, etc.) |
| `verified` | INTEGER | 1 = confirmado, 0 = pendente |
| `created_at` | TEXT | Quando esta identidade foi vista pela primeira vez |

Constraint: `UNIQUE(creator_id, channel, external_id)` — um external_id por canal por creator.

Índice: `(client_id)`

### 4.2 Formatos de External ID por Canal

Cada canal produz um formato diferente de `sender_id`. O sistema extrai um **external_id canônico** para armazenamento:

| Canal | sender_id bruto | external_id canônico | Exemplo |
|-------|----------------|---------------------|---------|
| **Telegram** | `{user_id}\|{username}` | ID numérico do usuário | `123456789` |
| **WhatsApp** | `{telefone}@s.whatsapp.net` ou LID | Número de telefone ou prefixo LID | `5511999999999` |
| **Discord** | Snowflake user ID | Snowflake como string | `123456789012345678` |
| **Slack** | Slack user ID | User ID como está | `U123ABC456DEF` |
| **Email** | Endereço de e-mail | E-mail como está | `alice@example.com` |
| **Web** | ID de sessão ou user ID | ID de sessão/usuário como está | `web_sess_a1b2c3` |

**Regras de extração:**
- Telegram: divide pelo `|`, pega a primeira parte (ID numérico)
- WhatsApp: divide pelo `@`, pega a primeira parte
- Demais: usa como está

O `display_name` captura a forma legível:
- Telegram: `@john_doe` (username) ou `João Silva` (first_name)
- WhatsApp: número de telefone formatado
- Discord: `username#discriminator`
- Email: endereço de e-mail
- Slack: nome de exibição do usuário (buscado via Slack API se disponível)

### 4.3 Fluxo de Resolução do Cliente

Quando uma mensagem chega de um canal:

```
InboundMessage
  channel = "telegram"
  sender_id = "123456789|@john_doe"
  user_id = "creator-abc" (do owner_id do canal)
         │
         ▼
Passo 1: Resolver Creator (inalterado)
  _resolve_user_id(msg) → "creator-abc"
         │
         ▼
Passo 2: Extrair external_id canônico
  "123456789|@john_doe" → external_id = "123456789"
                           display_hint = "@john_doe"
         │
         ▼
Passo 3: Buscar identidade do cliente
  SELECT client_id FROM client_identities
  WHERE creator_id = "creator-abc"
    AND channel = "telegram"
    AND external_id = "123456789"
         │
         ├── ENCONTRADO → retorna client_id existente
         │                 atualiza clients.last_seen
         │                 incrementa clients.total_interactions
         │
         └── NÃO ENCONTRADO → auto-criar
              │
              ├── INSERT INTO clients (client_id=uuid, creator_id, display_name, ...)
              │
              └── INSERT INTO client_identities (client_id, creator_id, channel, external_id, display_name)
                   │
                   └── retorna novo client_id
```

### 4.4 Vinculação de Identidades entre Canais

Um cliente pode usar múltiplos canais para falar com o mesmo agente. Por exemplo, João usa Telegram e WhatsApp. Sem vinculação, estes são dois clientes separados com memórias independentes.

**A vinculação une dois registros de cliente em um só:**

```
Antes:
  Cliente A (client_id: "aaa")
    └── telegram: 123456789 (@john_doe)
    └── memória: "Nome é João, prefere português"

  Cliente B (client_id: "bbb")
    └── whatsapp: 5511999999999
    └── memória: "Perguntou sobre o Plano B"

Após merge (primário = A, secundário = B):
  Cliente A (client_id: "aaa")
    └── telegram: 123456789 (@john_doe)
    └── whatsapp: 5511999999999
    └── memória: "Nome é João, prefere português. Perguntou sobre o Plano B."
```

**Passos da operação de merge:**
1. Reatribuir todas as `client_identities` do secundário → primário
2. Unificar memórias de longa duração (consolidação via LLM ou concatenação simples)
3. Mover todas as entradas de curta duração do secundário → primário
4. Reatribuir sessões do secundário → primário
5. Somar `total_interactions`
6. Manter o `first_seen` mais antigo, o `last_seen` mais recente
7. Deletar o registro do cliente secundário

O merge é uma **ação iniciada pelo creator** via web UI ou API. Vinculação automática pode ser adicionada em uma fase futura.

---

## 5. Modelo de Memória por Cliente

### 5.1 Modelo de Dados

#### Tabela `client_memories`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK | Auto-increment |
| `client_id` | TEXT FK → clients | A qual cliente esta memória pertence |
| `creator_id` | TEXT FK → users | Desnormalizado para consultas de limpeza |
| `type` | TEXT | `long_term` ou `history` |
| `content` | TEXT | Conteúdo da memória (markdown para long_term, entradas com timestamp para history) |
| `created_at` | TEXT | Quando esta entrada foi criada |
| `updated_at` | TEXT | Última atualização (para long_term) |

Índices: `(client_id, type)`, `(client_id, type, updated_at DESC)`

Tabela virtual FTS5: `client_memories_fts` na coluna `content` para busca full-text no histórico.

### 5.2 Memória de Longa Duração

Um registro por cliente. Fatos acumulados que persistem entre todas as sessões e canais.

**O que é armazenado:**
- Nome do cliente e como ele prefere ser tratado
- Preferências de comunicação (formal/informal, idioma)
- Interesses, tópicos discutidos frequentemente
- Decisões ou acordos importantes
- Contexto pessoal/empresarial relevante compartilhado pelo cliente

**Exemplo de conteúdo:**
```markdown
- Nome do cliente é João Silva
- Trabalha na ACME Corp como gerente de produto
- Prefere respostas concisas em português
- Interessado no Plano B (tier enterprise)
- Tem uma equipe de 15 pessoas
- Conversas anteriores cobriram: fluxo de onboarding, integração via API, preços
```

**Como é atualizada:**
- Automática: a consolidação de memória extrai fatos das conversas
- Manual: creator pode editar via web UI (`PUT /api/clients/{id}/memory/long_term`)
- Tools do agente: a tool `save_memory` grava na memória do cliente durante conversas

### 5.3 Memória de Curta Duração (Histórico)

Múltiplas entradas por cliente. Cada entrada é um resumo com timestamp de uma conversa ou janela de interação.

**O que é armazenado:**
- Resumo do que aconteceu em uma janela de conversa
- Perguntas-chave feitas e respostas dadas
- Ações tomadas pelo agente (tool calls, decisões)
- Itens em aberto ou follow-ups mencionados

**Exemplo de entradas:**
```
[2026-03-01 14:30] Cliente perguntou sobre preços do Plano B. Agente forneceu
tabela comparativa entre Plano A e Plano B. Cliente solicitou um e-mail de
follow-up com a proposta. Agente enviou e-mail pelo canal de e-mail.

[2026-02-28 10:15] Cliente reportou um bug de renderização no dashboard. Agente
investigou usando browser tool e confirmou o problema. Criou ticket de suporte
#1234. Cliente ficou satisfeito com o tempo de resposta.
```

**Como as entradas são criadas:**
- Automática: quando a contagem de mensagens não consolidadas de uma sessão excede o `memory_window`, o processo de consolidação resume as mensagens mais antigas em uma entrada de histórico
- Mesmo mecanismo de consolidação via LLM que existe hoje, mas gravando em `client_memories` ao invés de `memories`

### 5.4 Resumo de Propriedade da Memória

```
┌────────────────────────────┬────────────────────────────┐
│   Memória do CREATOR       │   Memória do CLIENTE       │
│   (tabela memories)        │   (tabela client_memories) │
├────────────────────────────┼────────────────────────────┤
│ Usada quando o creator     │ Usada quando um cliente    │
│ conversa via web UI        │ conversa via qualquer canal│
│                            │                            │
│ Contém notas pessoais      │ Contém fatos sobre ESTE    │
│ do creator, preferências,  │ cliente específico e seu   │
│ instruções para si mesmo   │ histórico de interação     │
│                            │                            │
│ Injetada como              │ Injetada como              │
│ "# Memory" no system       │ "# Contexto do Cliente"   │
│ prompt apenas no           │ no system prompt para      │
│ web chat                   │ mensagens de canais        │
└────────────────────────────┴────────────────────────────┘
```

### 5.5 Fluxo de Consolidação de Memória

```
Contagem de mensagens da sessão > threshold do memory_window
         │
         ▼
Disparar consolidação (async, mesmo mecanismo de hoje)
         │
         ├── Extrair mensagens não consolidadas da sessão
         │
         ├── Chamar LLM de consolidação com prompt:
         │     "Resuma esta conversa. Extraia fatos-chave sobre o cliente."
         │
         ├── LLM retorna:
         │     - history_entry: parágrafo resumindo o que aconteceu
         │     - memory_update: fatos de longa duração atualizados (aditivos/corretivos)
         │
         ├── Append history_entry em client_memories (type='history')
         │
         └── Atualizar client_memories (type='long_term') com conteúdo mergeado
```

---

## 6. Modelo de Sessões

### 6.1 Alterações na Tabela de Sessões

Adicionar coluna `client_id`:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `client_id` | TEXT, nullable | FK → clients.client_id. NULL para sessões web do creator (legado). |

Nova constraint: `UNIQUE(user_id, client_id, session_key)`

A constraint antiga `UNIQUE(user_id, session_key)` é relaxada para permitir a mesma session_key com client_ids diferentes (improvável na prática, mas semanticamente correto).

### 6.2 Construção da Session Key

Formato inalterado: `"{channel}:{chat_id}"` (ex: `"telegram:123456789"`)

A diferença é que o `SessionManager` agora faz escopo das queries por `(user_id, client_id, session_key)` ao invés de apenas `(user_id, session_key)`.

**Exemplos:**
- Telegram DM: `telegram:123456789` — uma sessão por chat do Telegram
- Grupo Telegram: `telegram:-1001234567890` — sessão compartilhada dentro do grupo
- Canal Discord: `discord:987654321098765432`
- WhatsApp: `whatsapp:5511999999999`
- Thread Slack: `slack:C123ABC:1234567890.123456`

### 6.3 Mudanças no SessionManager

O construtor do `SessionManager` recebe um `client_id` opcional. Quando presente:
- `get_or_create(session_key)` consulta com `WHERE user_id = ? AND client_id = ? AND session_key = ?`
- `list_sessions()` retorna apenas sessões daquele cliente
- `save()` inclui `client_id` no upsert

Quando `client_id` é None (web chat do creator), o comportamento é inalterado.

---

## 7. Fluxo de Processamento de Mensagens

### 7.1 Fluxo Atual (Antes)

```
Mensagem chega ──► Resolver creator_user_id ──► Montar UserContext (tudo do creator)
                                                       │
                                                       ├── sessões do creator
                                                       ├── memória do creator ◄── PROBLEMA
                                                       ├── tools do creator
                                                       └── prompts do creator
```

### 7.2 Novo Fluxo (Depois)

```
Mensagem chega
       │
       ▼
┌─────────────────────────────────┐
│ 1. Resolver Creator             │  Inalterado: owner_id ou channel_bindings
│    → creator_user_id            │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 2. Resolver Cliente             │  NOVO: lookup em client_identities ou auto-criar
│    → client_id                  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 3. Obter Config do Creator      │  Inalterado: UserContext com prompts, tools,
│    (cacheado por creator)       │  modelo, provider, RAG, skills
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 4. Obter Estado do Cliente      │  NOVO: ClientMemoryStore + SessionManager
│    (por client_id)              │  vinculados a este cliente específico
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 5. Montar System Prompt         │
│    = Prompts do creator         │  Personalidade e comportamento do agente
│    + Memória longa do cliente   │  Quem é esta pessoa
│    + Histórico recente cliente  │  O que aconteceu recentemente
│    + Skills/tools do creator    │  O que o agente pode fazer
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 6. Carregar Histórico Sessão    │  Da sessão do cliente (não do creator)
│    + Mensagem atual             │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 7. Agent Loop (LLM + Tools)    │  Processamento inalterado
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 8. Salvar na Sessão do Cliente  │  Sessão com escopo (creator, client, key)
│ 9. Consolidar Memória Cliente   │  Memória gravada em client_memories
└──────────────┬──────────────────┘
               │
               ▼
         Resposta enviada
```

### 7.3 Fluxo do Web Chat (Creator, inalterado)

```
Creator envia mensagem via web UI
       │
       ▼
  user_id = creator autenticado
  client_id = None (não é interação com cliente)
       │
       ▼
  UserContext montado com tudo do creator (inalterado)
  SessionManager sem client_id (inalterado)
  MemoryStore lê da tabela memories (inalterado)
       │
       ▼
  Processamento padrão, igual ao atual
```

---

## 8. Estrutura do System Prompt

### 8.1 Para Mensagens de Canais (Interação com Cliente)

```
# nanobot

[Seção de identidade: hora atual, ambiente de execução]

---

[SOUL.md: base + extensão do creator]
  → Personalidade do agente, regras centrais de comportamento

[AGENTS.md: base + extensão do creator]
  → Definições de sub-agentes, regras de delegação

[USER.md: base + extensão do creator]
  → Contexto de negócio, info de produto, Q&A comum
  → Aqui o creator coloca info que se aplica a TODOS os clientes

---

# Contexto do Cliente

## Sobre Este Cliente
Nome: João Silva
Canal: Telegram (@john_doe)
Primeira interação: 2026-01-15
Total de interações: 47

## Memória do Cliente
- Nome do cliente é João Silva
- Trabalha na ACME Corp como gerente de produto
- Prefere respostas concisas em português
- Interessado no Plano B (enterprise)
- Tem uma equipe de 15 pessoas

## Histórico Recente
[2026-03-01 14:30] Cliente perguntou sobre preços do Plano B. Agente forneceu
tabela comparativa. Cliente solicitou e-mail de follow-up.

[2026-02-28 10:15] Cliente reportou bug no dashboard. Agente confirmou e
criou ticket #1234.

---

# Skills Ativas
[conteúdo de skills sempre-ativas]

# Skills Disponíveis
[resumo de skills para ativação sob demanda]
```

### 8.2 Para Web Chat (Interação do Creator)

Igual ao atual — sem seção `# Contexto do Cliente`. Usa `# Memory` com o conteúdo da memória pessoal do creator.

### 8.3 Diferenças-Chave

| Aspecto | Canal (Cliente) | Web Chat (Creator) |
|---------|-----------------|---------------------|
| Seção de memória | `# Contexto do Cliente` com memória do cliente | `# Memory` com memória do creator |
| Fonte da memória | Tabela `client_memories` | Tabela `memories` |
| Fonte da sessão | Sessões com `client_id` preenchido | Sessões com `client_id` NULL |
| Prompts | Extensões do creator (iguais) | Extensões do creator (iguais) |
| Tools | Tools habilitadas do creator (iguais) | Tools habilitadas do creator (iguais) |

---

## 9. Superfície de API

### 9.1 Gerenciamento de Clientes

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/clients` | Listar clientes. Query params: `?q=busca`, `?status=active\|blocked\|archived`, `?limit=50`, `?offset=0`, `?sort=last_seen\|first_seen\|interactions` |
| `GET` | `/api/clients/{client_id}` | Detalhes do cliente com todas as identidades de canal |
| `PUT` | `/api/clients/{client_id}` | Atualizar display_name, metadata, status |
| `DELETE` | `/api/clients/{client_id}` | Arquivar ou deletar cliente e todos os dados associados |
| `POST` | `/api/clients/merge` | Unificar dois clientes: `{ "primary": "id1", "secondary": "id2" }` |

### 9.2 Gerenciamento de Identidades do Cliente

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/clients/{client_id}/identities` | Listar todas as identidades de canal |
| `POST` | `/api/clients/{client_id}/identities` | Adicionar identidade: `{ "channel": "whatsapp", "external_id": "5511999999999", "display_name": "+55 11 99999-9999" }` |
| `DELETE` | `/api/clients/{client_id}/identities/{identity_id}` | Remover um mapeamento de identidade |

### 9.3 Memória do Cliente

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/clients/{client_id}/memory` | Obter memória de longa duração + últimas N entradas de histórico |
| `PUT` | `/api/clients/{client_id}/memory/long_term` | Atualizar conteúdo da memória de longa duração |
| `DELETE` | `/api/clients/{client_id}/memory` | Limpar toda memória (longa duração + histórico) |
| `DELETE` | `/api/clients/{client_id}/memory/{entry_id}` | Deletar uma entrada específica de histórico |
| `GET` | `/api/clients/{client_id}/memory/search?q=termo` | Busca full-text no histórico |

### 9.4 Sessões do Cliente

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/clients/{client_id}/sessions` | Listar todas as sessões de um cliente |
| `GET` | `/api/clients/{client_id}/sessions/{session_key}/messages` | Obter mensagens de uma sessão específica |
| `DELETE` | `/api/clients/{client_id}/sessions/{session_key}` | Deletar uma sessão e suas mensagens |

### 9.5 Exemplos de Resposta

**GET /api/clients**
```json
[
  {
    "client_id": "c1a2b3c4-d5e6-...",
    "display_name": "João Silva",
    "status": "active",
    "channels": ["telegram", "whatsapp"],
    "first_seen": "2026-01-15T10:30:00Z",
    "last_seen": "2026-03-01T14:30:00Z",
    "total_interactions": 47
  }
]
```

**GET /api/clients/{id}**
```json
{
  "client_id": "c1a2b3c4-d5e6-...",
  "display_name": "João Silva",
  "metadata": { "company": "ACME Corp", "plan": "B" },
  "status": "active",
  "first_seen": "2026-01-15T10:30:00Z",
  "last_seen": "2026-03-01T14:30:00Z",
  "total_interactions": 47,
  "identities": [
    { "id": 1, "channel": "telegram", "external_id": "123456789", "display_name": "@john_doe" },
    { "id": 2, "channel": "whatsapp", "external_id": "5511999999999", "display_name": "+55 11 99999-9999" }
  ]
}
```

---

## 10. Wireframes do Frontend

### 10.1 Página de Lista de Clientes

```
┌──────────────────────────────────────────────────────────────────┐
│  Clientes                                         [Buscar...]   │
│  47 clientes ativos                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  JS  João Silva                        47 interações     │   │
│  │      telegram, whatsapp      Última vez: 2 horas atrás   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MC  Maria Costa                       23 interações     │   │
│  │      telegram                Última vez: 1 dia atrás     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PL  Pedro Lima                        12 interações     │   │
│  │      discord                 Última vez: 3 dias atrás    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Filtro: [Todos ▾]  Ordenar: [Mais recente ▾]  ◄ 1 2 3 ... ►   │
└──────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Avatar com iniciais do display_name
- Ícones dos canais mostrando quais plataformas o cliente usa
- Contagem de interações e timestamp de última interação
- Busca por nome, identidade de canal ou metadata
- Filtro por status (ativo, bloqueado, arquivado)
- Ordenação por última interação, primeira interação ou contagem
- Paginação

### 10.2 Página de Detalhe do Cliente

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Voltar para Clientes                                         │
│                                                                  │
│  ┌─ Informações do Cliente ────────────────────────────────────┐ │
│  │  JS  João Silva                            [Editar] [···]  │ │
│  │      Ativo desde 15 Jan 2026                                │ │
│  │      47 interações · Última vez 2 horas atrás               │ │
│  │                                                              │ │
│  │  Metadata: empresa=ACME Corp, plano=B        [Editar tags]  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Identidades de Canal ──────────────────────────────────────┐ │
│  │                                                              │ │
│  │  Telegram   123456789 (@john_doe)               [Desvincular]│ │
│  │  WhatsApp   +55 11 99999-9999                   [Desvincular]│ │
│  │                                                              │ │
│  │  [+ Vincular outro canal]                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Memória ───────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  Fatos de Longa Duração                           [Editar]  │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │ - Nome do cliente é João Silva                       │   │ │
│  │  │ - Trabalha na ACME Corp como gerente de produto      │   │ │
│  │  │ - Prefere respostas concisas em português            │   │ │
│  │  │ - Interessado no Plano B (enterprise)                │   │ │
│  │  │ - Equipe de 15 pessoas                               │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  │                                                              │ │
│  │  Histórico Recente                            [Buscar...]   │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │ 1 Mar 2026 14:30                            [Deletar]│   │ │
│  │  │ Perguntou sobre preços do Plano B. Agente forneceu   │   │ │
│  │  │ tabela comparativa. Solicitou e-mail de follow-up.   │   │ │
│  │  ├──────────────────────────────────────────────────────┤   │ │
│  │  │ 28 Fev 2026 10:15                           [Deletar]│   │ │
│  │  │ Reportou bug no dashboard. Agente confirmou e        │   │ │
│  │  │ criou ticket #1234.                                  │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Sessões ───────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  telegram:123456789        12 mensagens    1 Mar 2026       │ │
│  │  whatsapp:5511999999999     8 mensagens    28 Fev 2026      │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Bloquear Cliente]  [Arquivar Cliente]  [Deletar Cliente]       │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 Diálogo de Merge de Clientes

```
┌───────────────────────────────────────────────────────┐
│  Unificar Clientes                               [X]  │
│                                                       │
│  Isto vai combinar dois registros de cliente em um.   │
│  Todas as identidades, memórias e sessões do cliente  │
│  secundário serão movidas para o primário.            │
│                                                       │
│  Primário (mantém o registro):                        │
│  ┌───────────────────────────────────────────────┐    │
│  │  JS  João Silva  ·  telegram  ·  47 msgs      │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  Secundário (será deletado):                          │
│  ┌───────────────────────────────────────────────┐    │
│  │  ??  +55 11 99999-9999  ·  whatsapp  · 8 msgs│    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  Após a unificação:                                   │
│  - 2 identidades de canal (telegram + whatsapp)       │
│  - Memórias combinadas                                │
│  - 55 interações totais                               │
│                                                       │
│          [Cancelar]         [Unificar Clientes]       │
└───────────────────────────────────────────────────────┘
```

### 10.4 Adição na Sidebar

```
Workplace
  ├── New Chat
  ├── Agent Prompts
  ├── Capabilities
  ├── Knowledge (RAG)
  ├── Memory
  └── Clientes            ◄── NOVO (com badge de contagem)

System
  ├── Channels
  ├── Scheduler
  └── Settings
```

---

## 11. Módulos Impactados

### 11.1 Camada de Banco de Dados

| Arquivo | Mudança |
|---------|---------|
| `db/repositories.py` | Adicionar protocols `ClientRepository`, `ClientIdentityRepository`, `ClientMemoryRepository` |
| `db/factory.py` | Adicionar `clients`, `client_identities`, `client_memories` ao `RepositoryFactory` |
| `db/sqlite/migrations.py` | Migration v5: tabelas `clients`, `client_identities`, `client_memories` + coluna `client_id` em `sessions` + FTS5 para client_memories |
| `db/sqlite/client_repo.py` | Novo: implementação `SQLiteClientRepository` |
| `db/sqlite/client_identity_repo.py` | Novo: implementação `SQLiteClientIdentityRepository` |
| `db/sqlite/client_memory_repo.py` | Novo: implementação `SQLiteClientMemoryRepository` |
| `db/sqlite/session_repo.py` | Modificado: suporte a `client_id` opcional nas queries |

### 11.2 Camada de Bus

| Arquivo | Mudança |
|---------|---------|
| `bus/events.py` | Adicionar campo `client_id: str \| None = None` no `InboundMessage` |

### 11.3 Camada do Agente

| Arquivo | Mudança |
|---------|---------|
| `agent/loop.py` | Adicionar método `_resolve_client()`. Modificar `_process_message()` para resolver cliente, montar memória e sessões com escopo por cliente. Direcionar tools de memória para memória do cliente quando client_id presente. |
| `agent/user_context.py` | Adicionar dataclass `ClientState` (client_id, memory, sessions). `build_user_context()` inalterado — continua montando config do creator. Nova função `build_client_state()`. |
| `agent/context.py` | Modificar `build_system_prompt()` para aceitar memória de cliente opcional. Adicionar seção `# Contexto do Cliente` quando memória de cliente fornecida. Remover `# Memory` para interações com clientes. |
| `agent/memory.py` | Nova classe `ClientMemoryStore` (paralela ao `MemoryStore`, usando `ClientMemoryRepository`). Mesma interface: `get_memory_context()`, `append_history()`, `update_long_term()`, `consolidate()`. |

### 11.4 Camada de Sessões

| Arquivo | Mudança |
|---------|---------|
| `session/manager.py` | Construtor aceita `client_id` opcional. Todos os métodos de query/save fazem escopo por `(user_id, client_id, session_key)` quando client_id presente. |

### 11.5 Camada de Canais

| Arquivo | Mudança |
|---------|---------|
| Todos os arquivos de canais | **Sem mudanças.** Os canais já produzem `sender_id` com o identificador externo. A resolução do cliente acontece no agent loop, não nos canais. |

### 11.6 Servidor Web

| Arquivo | Mudança |
|---------|---------|
| `web/server.py` | Adicionar 12 novos endpoints (ver seção Superfície de API). Todos com escopo no creator autenticado. |

### 11.7 Frontend

| Arquivo | Mudança |
|---------|---------|
| `lib/api.ts` | Adicionar interfaces: `Client`, `ClientIdentity`, `ClientMemory`. Adicionar funções de API para todos os endpoints de clientes. |
| `lib/store.ts` | Adicionar `"clients"` ao tipo `View`. |
| `components/ClientsPage.tsx` | Novo: lista de clientes com busca, filtro, ordenação, paginação. |
| `components/ClientDetail.tsx` | Novo: detalhe do cliente com identidades, editor de memória, sessões, merge. |
| `components/Sidebar.tsx` | Adicionar item "Clientes" na navegação com badge de contagem. |
| `App.tsx` | Adicionar `ClientsPage` e `ClientDetail` ao roteamento de views. |

### 11.8 Camada de Config

| Arquivo | Mudança |
|---------|---------|
| `config/schema.py` | **Sem mudanças necessárias.** O conceito de cliente é runtime/DB, não config. |

---

## 12. Estratégia de Migração

### Fase 1: Schema do Banco (non-breaking)

**Objetivo:** Adicionar novas tabelas sem afetar funcionalidades existentes.

- Criar migration v5:
  - Tabela `clients` com todas as colunas e índices
  - Tabela `client_identities` com constraint unique e índices
  - Tabela `client_memories` com tabela virtual FTS5 e triggers
  - Adicionar coluna nullable `client_id` na tabela `sessions`
- Nenhum dado existente precisa de migração — sessões antigas continuam com `client_id = NULL`
- Todas as novas tabelas começam vazias

### Fase 2: Camada de Resolução de Clientes

**Objetivo:** Resolver clientes a partir de mensagens de canais.

- Adicionar 3 novos protocols de repositório em `db/repositories.py`
- Implementar repositórios SQLite
- Adicionar ao `RepositoryFactory`
- Adicionar `_resolve_client()` ao `AgentLoop`
- **Retrocompatível:** se a resolução de cliente retorna None (modo FS), cai no comportamento atual
- Neste ponto, clientes são criados e resolvidos, mas memória/sessões ainda usam o contexto do creator

### Fase 3: Isolamento de Memória e Sessões

**Objetivo:** Memória e sessões por cliente.

- Criar classe `ClientMemoryStore`
- Modificar `SessionManager` para suportar `client_id`
- Modificar `_process_message()` para usar memória e sessões com escopo por cliente quando `client_id` presente
- Modificar `ContextBuilder.build_system_prompt()` para injetar memória do cliente
- Modificar tools de memória (`save_memory`, `search_memory`) para direcionar à memória do cliente quando em contexto de cliente
- **O web chat do creator não é afetado** — continua usando `client_id = None`

### Fase 4: API Web e Frontend

**Objetivo:** Creator pode gerenciar clientes via web UI.

- Adicionar todos os endpoints de clientes em `web/server.py`
- Construir componentes `ClientsPage` (lista) e `ClientDetail` (detalhe)
- Adicionar à navegação da sidebar
- Construir diálogo de merge

---

## 13. Decisões de Design

### 13.1 Web chat do creator permanece separado

O web chat do creator continua usando a tabela `memories` existente e `sessions` com `client_id = NULL`. Isso evita quebrar comportamento existente e mantém dois casos de uso distintos:
- Creator usa web chat para testar/interagir com seu próprio agente
- Clientes usam canais para receber atendimento do agente

### 13.2 Auto-criar clientes na primeira mensagem

Quando um novo `sender_id` aparece em um canal, o sistema cria automaticamente um registro de cliente e mapeamento de identidade. O creator pode revisar, renomear, taguear, bloquear ou arquivar clientes depois. Isso suporta o caso comum de bots públicos onde qualquer pessoa pode mandar mensagem.

### 13.3 Tabela separada `client_memories`

Memórias de clientes vivem em uma tabela dedicada ao invés de adicionar `client_id` à tabela `memories` existente. Isso evita ambiguidade sobre qual chave usar e mantém o caminho de memória do creator limpo. Os dois sistemas de memória têm a mesma estrutura, mas semânticas de propriedade diferentes.

### 13.4 Canais permanecem inalterados

As implementações de canal (Telegram, Discord, WhatsApp, etc.) já produzem `sender_id` com o identificador externo. A resolução do cliente acontece no agent loop após a mensagem chegar. Isso significa que adicionar a camada de clientes requer zero mudanças no código dos canais.

### 13.5 Vinculação de identidades é manual (Fase 1)

A vinculação de identidades entre canais (merge de dois registros de cliente) é uma ação iniciada pelo creator. Heurísticas automáticas (ex: mesmo telefone no WhatsApp e Telegram) podem ser adicionadas em uma fase futura, mas não fazem parte da implementação inicial.

### 13.6 Rate limiting: global + por cliente

O rate limiter existente verifica quotas no nível do creator (tokens diários, requests por minuto). Uma melhoria futura pode adicionar rate limiting por cliente (ex: máximo 10 mensagens por minuto por cliente) para prevenir abuso de um end-user individual sem afetar outros clientes.
