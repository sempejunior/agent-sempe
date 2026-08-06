"""System-wide catalog of pre-configured MCP servers and REST APIs.

Users pick from this catalog to enable an integration for themselves. Each entry
declares what credential (if any) is required and — for APIs — the base URL and
the endpoints exposed to the ``http_call`` tool.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

CredentialFieldKind = Literal["text", "password", "url"]
AuthMode = Literal["none", "bearer", "api_key_header", "basic", "query_key"]


@dataclass(frozen=True)
class CredentialField:
    """A single field required inside a credential."""

    key: str
    label: str
    kind: CredentialFieldKind = "password"
    required: bool = True
    hint: str = ""


@dataclass(frozen=True)
class AuthSpec:
    """How to attach the credential to outbound HTTP requests."""

    mode: AuthMode = "none"
    header_name: str = "Authorization"
    header_prefix: str = "Bearer "
    query_param: str = ""
    secret_field: str = "token"
    username_field: str = "username"
    password_field: str = "password"


@dataclass(frozen=True)
class APIEndpoint:
    """A single REST endpoint exposed via ``http_call``.

    ``body_from_credential`` maps a request body field to a credential field
    (``{"employeeUserId": "user_id"}``). It extends whatever the integration
    declares and takes precedence over it for the same body field.
    """

    key: str
    method: str
    path: str
    description: str
    query_params: tuple[str, ...] = ()
    body_params: tuple[str, ...] = ()
    body_from_credential: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class APIIntegration:
    """A pre-configured REST API integration.

    ``body_from_credential`` maps request body fields to credential fields for
    every endpoint of this integration. Use it for identity the caller owns and
    the model must never choose (tenant, company, acting user).
    """

    base_url: str
    endpoints: tuple[APIEndpoint, ...]
    default_headers: dict[str, str] = field(default_factory=dict)
    body_from_credential: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class GitSpec:
    """How to reach this provider's repositories over HTTPS.

    ``clone_url_template`` is formatted over the decrypted credential plus a
    ``path`` (the group/project or owner/repo the caller asks for), so a new
    provider is a catalog entry and no code. The secret never goes into the URL:
    it travels as an askpass answer, which is why only the username is templated.
    """

    clone_url_template: str
    auth_username: str = ""
    auth_secret_field: str = "token"


@dataclass(frozen=True)
class MCPIntegration:
    """A pre-configured MCP server integration.

    ``env`` values are format-templated over the decrypted credential dict, so
    a static value like ``"pat"`` passes through unchanged, ``"{pat}"`` resolves
    to the credential's ``pat`` field, and ``"https://dev.azure.com/{organization}"``
    composes a value from a field. ``env_from_credential`` is the simpler flat
    ``{ENV_VAR: credential_field}`` form and still works alongside ``env``.
    """

    command: str = ""
    args: tuple[str, ...] = ()
    url: str = ""
    env: dict[str, str] = field(default_factory=dict)
    env_from_credential: dict[str, str] = field(default_factory=dict)
    header_from_credential: dict[str, str] = field(default_factory=dict)
    tool_allowlist: tuple[str, ...] = ()
    tool_denylist: tuple[str, ...] = ()


@dataclass(frozen=True)
class IntegrationEntry:
    """A catalog entry — either a REST API or an MCP server."""

    id: str
    kind: Literal["api", "mcp"]
    name: str
    description: str
    category: str
    credential_fields: tuple[CredentialField, ...] = ()
    auth: AuthSpec = field(default_factory=AuthSpec)
    docs_url: str = ""
    setup_steps: tuple[str, ...] = ()
    api: APIIntegration | None = None
    mcp: MCPIntegration | None = None
    git: GitSpec | None = None


CATALOG: tuple[IntegrationEntry, ...] = (
    IntegrationEntry(
        id="github",
        kind="api",
        name="GitHub",
        description="Issues, pull requests, repos e workflows do GitHub.",
        category="devtools",
        docs_url="https://docs.github.com/rest",
        setup_steps=(
            "Acesse github.com/settings/tokens (Settings → Developer settings → "
            "Personal access tokens → Tokens classic).",
            "Clique em 'Generate new token (classic)' e marque os escopos "
            "'repo' e 'read:org'.",
            "Copie o token gerado (começa com ghp_) e cole no campo abaixo — "
            "ele não é exibido de novo depois.",
        ),
        credential_fields=(
            CredentialField("token", "Personal Access Token", "password",
                            hint="Crie em github.com/settings/tokens. Escopo mínimo: repo, read:org."),
        ),
        auth=AuthSpec(mode="bearer", header_prefix="Bearer ", secret_field="token"),
        api=APIIntegration(
            base_url="https://api.github.com",
            default_headers={"Accept": "application/vnd.github+json"},
            endpoints=(
                APIEndpoint("list_repos", "GET", "/user/repos",
                            "Lista repositórios acessíveis.",
                            query_params=("visibility", "affiliation", "per_page", "page")),
                APIEndpoint("get_repo", "GET", "/repos/{owner}/{repo}",
                            "Retorna metadados de um repositório."),
                APIEndpoint("list_issues", "GET", "/repos/{owner}/{repo}/issues",
                            "Lista issues do repositório.",
                            query_params=("state", "labels", "since", "per_page")),
                APIEndpoint("create_issue", "POST", "/repos/{owner}/{repo}/issues",
                            "Cria uma nova issue.",
                            body_params=("title", "body", "labels", "assignees")),
                APIEndpoint("list_pulls", "GET", "/repos/{owner}/{repo}/pulls",
                            "Lista pull requests.",
                            query_params=("state", "head", "base", "per_page")),
                APIEndpoint("create_pull_request", "POST", "/repos/{owner}/{repo}/pulls",
                            "Abre um pull request de head para base.",
                            body_params=("title", "head", "base", "body", "draft")),
                APIEndpoint("add_issue_comment", "POST",
                            "/repos/{owner}/{repo}/issues/{number}/comments",
                            "Comenta numa issue ou pull request.",
                            body_params=("body",)),
            ),
        ),
        git=GitSpec("https://github.com/{path}.git", "x-access-token", "token"),
    ),
    IntegrationEntry(
        id="jira",
        kind="api",
        name="Jira Cloud",
        description="Issues, projetos e sprints do Jira Cloud.",
        category="devtools",
        docs_url="https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
        setup_steps=(
            "Descubra a Base URL da sua instância (ex: https://suaempresa.atlassian.net).",
            "Acesse id.atlassian.com/manage-profile/security/api-tokens e clique "
            "em 'Create API token'.",
            "Use o email da sua conta Atlassian + o token gerado (autenticação básica).",
        ),
        credential_fields=(
            CredentialField("base_url", "Base URL da instância", "url", hint="ex: https://minhaempresa.atlassian.net"),
            CredentialField("email", "Email do usuário", "text",
                            hint="Email da sua conta Atlassian."),
            CredentialField("api_token", "API Token", "password",
                            hint="Gere em id.atlassian.com/manage-profile/security/api-tokens"),
        ),
        auth=AuthSpec(mode="basic", username_field="email", password_field="api_token"),
        api=APIIntegration(
            base_url="",
            endpoints=(
                APIEndpoint("search_issues", "GET", "/rest/api/3/search",
                            "Busca issues via JQL.",
                            query_params=("jql", "fields", "maxResults", "startAt")),
                APIEndpoint("get_issue", "GET", "/rest/api/3/issue/{issue_key}",
                            "Retorna uma issue por chave."),
                APIEndpoint("create_issue", "POST", "/rest/api/3/issue",
                            "Cria uma issue.",
                            body_params=("fields",)),
                APIEndpoint("add_comment", "POST", "/rest/api/3/issue/{issue_key}/comment",
                            "Adiciona comentário.",
                            body_params=("body",)),
            ),
        ),
    ),
    IntegrationEntry(
        id="azure_devops",
        kind="api",
        name="Azure DevOps",
        description="Work items, repos e pipelines do Azure DevOps.",
        category="devtools",
        docs_url="https://learn.microsoft.com/rest/api/azure/devops",
        setup_steps=(
            "A organização é o nome que aparece na URL: dev.azure.com/<organização>.",
            "Crie o token em dev.azure.com/<organização>/_usersSettings/tokens "
            "(User settings, canto superior direito → Personal access tokens → New Token).",
            "Escopos mínimos de leitura: Work Items (Read), Code (Read), "
            "Project and Team (Read).",
            "Copie o token e cole no campo abaixo — ele só é mostrado uma vez.",
        ),
        credential_fields=(
            CredentialField("organization", "Organização", "text",
                            hint="Nome na URL dev.azure.com/<organização>. ex: contoso"),
            CredentialField("pat", "Personal Access Token", "password",
                            hint="Crie em dev.azure.com/<org>/_usersSettings/tokens. "
                                 "Escopos: Work Items (Read), Code (Read)."),
        ),
        auth=AuthSpec(mode="basic", username_field="", password_field="pat"),
        api=APIIntegration(
            base_url="https://dev.azure.com",
            endpoints=(
                APIEndpoint("list_projects", "GET", "/{organization}/_apis/projects",
                            "Lista projetos.",
                            query_params=("api-version",)),
                APIEndpoint("query_wiql", "POST", "/{organization}/{project}/_apis/wit/wiql",
                            "Executa query WIQL para work items.",
                            query_params=("api-version",),
                            body_params=("query",)),
                APIEndpoint("create_pull_request", "POST",
                            "/{organization}/{project}/_apis/git/repositories/"
                            "{repositoryId}/pullrequests",
                            "Abre um pull request. Refs no formato "
                            "refs/heads/<branch>.",
                            query_params=("api-version",),
                            body_params=("sourceRefName", "targetRefName", "title",
                                         "description")),
                APIEndpoint("add_work_item_comment", "POST",
                            "/{organization}/{project}/_apis/wit/workItems/{id}/comments",
                            "Comenta numa work item.",
                            query_params=("api-version",),
                            body_params=("text",)),
                APIEndpoint("get_work_item", "GET", "/{organization}/_apis/wit/workitems/{id}",
                            "Retorna work item por ID.",
                            query_params=("api-version",)),
            ),
        ),
        git=GitSpec("https://dev.azure.com/{organization}/_git/{path}", "azure", "pat"),
    ),
    IntegrationEntry(
        id="gitlab",
        kind="api",
        name="GitLab",
        description=(
            "Repositórios, merge requests e issues do GitLab (gitlab.com ou "
            "self-hosted). Habilita clonar, criar branch e abrir MR."
        ),
        category="devtools",
        docs_url="https://docs.gitlab.com/ee/api/rest/",
        setup_steps=(
            "Informe a URL da sua instância (https://gitlab.com para a nuvem).",
            "Crie um Personal Access Token em Preferences → Access Tokens.",
            "Escopos: 'read_api' basta para consultar; para clonar, criar branch e "
            "abrir merge request o token precisa de 'write_repository' e 'api'.",
        ),
        credential_fields=(
            CredentialField("base_url", "URL da instância", "url",
                            hint="https://gitlab.com ou a URL do seu GitLab."),
            CredentialField("token", "Personal Access Token", "password",
                            hint="Preferences → Access Tokens. Escopos: api, "
                                 "write_repository."),
        ),
        auth=AuthSpec(mode="api_key_header", header_name="PRIVATE-TOKEN",
                      secret_field="token"),
        api=APIIntegration(
            base_url="",
            default_headers={"Content-Type": "application/json"},
            endpoints=(
                APIEndpoint("list_projects", "GET", "/api/v4/projects",
                            "Lista projetos visíveis.",
                            query_params=("membership", "search", "per_page", "page")),
                APIEndpoint("get_project", "GET", "/api/v4/projects/{id}",
                            "Metadados do projeto. id aceita o caminho "
                            "url-encoded (grupo%2Fprojeto)."),
                APIEndpoint("get_file", "GET",
                            "/api/v4/projects/{id}/repository/files/{file_path}",
                            "Conteúdo de um arquivo. file_path url-encoded; "
                            "informe ref na query.",
                            query_params=("ref",)),
                APIEndpoint("create_merge_request", "POST",
                            "/api/v4/projects/{id}/merge_requests",
                            "Abre um merge request de source_branch para "
                            "target_branch.",
                            body_params=("source_branch", "target_branch", "title",
                                         "description", "remove_source_branch")),
                APIEndpoint("add_mr_note", "POST",
                            "/api/v4/projects/{id}/merge_requests/{iid}/notes",
                            "Comenta num merge request.",
                            body_params=("body",)),
                APIEndpoint("list_issues", "GET", "/api/v4/projects/{id}/issues",
                            "Lista issues do projeto.",
                            query_params=("state", "labels", "per_page")),
            ),
        ),
        git=GitSpec("{base_url}/{path}.git", "oauth2", "token"),
    ),
    IntegrationEntry(
        id="grafana",
        kind="api",
        name="Grafana",
        description="Dashboards, datasources e alerting via API HTTP.",
        category="observability",
        docs_url="https://grafana.com/docs/grafana/latest/developers/http_api/",
        setup_steps=(
            "No Grafana, vá em Administration → Users and access → Service accounts.",
            "Crie um service account com a role adequada (ex: Viewer) e clique "
            "em 'Add service account token'.",
            "Copie o token gerado e informe a Base URL do seu Grafana abaixo.",
        ),
        credential_fields=(
            CredentialField("base_url", "Base URL", "url", hint="ex: https://grafana.minhaempresa.com"),
            CredentialField("token", "Service Account Token", "password",
                            hint="Administration → Service accounts → Add token."),
        ),
        auth=AuthSpec(mode="bearer", header_prefix="Bearer ", secret_field="token"),
        api=APIIntegration(
            base_url="",
            endpoints=(
                APIEndpoint("search_dashboards", "GET", "/api/search",
                            "Busca dashboards.",
                            query_params=("query", "tag", "type", "limit")),
                APIEndpoint("get_dashboard", "GET", "/api/dashboards/uid/{uid}",
                            "Retorna dashboard por UID."),
                APIEndpoint("list_datasources", "GET", "/api/datasources",
                            "Lista datasources."),
                APIEndpoint("list_alerts", "GET", "/api/alertmanager/grafana/api/v2/alerts",
                            "Lista alertas ativos."),
            ),
        ),
    ),
    IntegrationEntry(
        id="google_workspace",
        kind="api",
        name="Google Workspace",
        description="APIs REST do Google (Gmail, Calendar, Drive) com OAuth Bearer.",
        category="productivity",
        docs_url="https://developers.google.com/workspace",
        setup_steps=(
            "Abra developers.google.com/oauthplayground.",
            "Selecione os escopos desejados (Gmail, Calendar, Drive) e autorize "
            "com sua conta Google.",
            "Troque o código pelo access token e cole abaixo. "
            "Atenção: o token expira (~1h) e precisa ser renovado manualmente por enquanto.",
        ),
        credential_fields=(
            CredentialField("access_token", "OAuth Access Token", "password",
                            hint="Gere em developers.google.com/oauthplayground. Expira em ~1h."),
        ),
        auth=AuthSpec(mode="bearer", header_prefix="Bearer ", secret_field="access_token"),
        api=APIIntegration(
            base_url="https://www.googleapis.com",
            endpoints=(
                APIEndpoint("gmail_list_messages", "GET", "/gmail/v1/users/me/messages",
                            "Lista mensagens do Gmail.",
                            query_params=("q", "maxResults", "labelIds")),
                APIEndpoint("gmail_get_message", "GET", "/gmail/v1/users/me/messages/{id}",
                            "Retorna uma mensagem específica."),
                APIEndpoint("calendar_list_events", "GET",
                            "/calendar/v3/calendars/{calendarId}/events",
                            "Lista eventos de calendário.",
                            query_params=("timeMin", "timeMax", "q", "maxResults")),
                APIEndpoint("drive_search", "GET", "/drive/v3/files",
                            "Busca arquivos no Drive.",
                            query_params=("q", "pageSize", "fields")),
            ),
        ),
    ),
    IntegrationEntry(
        id="notion",
        kind="api",
        name="Notion",
        description="Databases e páginas do Notion via integração interna.",
        category="productivity",
        docs_url="https://developers.notion.com",
        setup_steps=(
            "Acesse notion.so/my-integrations e clique em 'New integration'.",
            "Dê um nome, associe ao workspace e copie o 'Internal Integration Secret'.",
            "Importante: abra cada página/database no Notion → menu '...' → "
            "'Connections' → conecte sua integração, senão ela não enxerga o conteúdo.",
        ),
        credential_fields=(
            CredentialField("token", "Internal Integration Token", "password",
                            hint="Crie em notion.so/my-integrations e compartilhe as páginas com ela."),
        ),
        auth=AuthSpec(mode="bearer", header_prefix="Bearer ", secret_field="token"),
        api=APIIntegration(
            base_url="https://api.notion.com",
            default_headers={"Notion-Version": "2022-06-28"},
            endpoints=(
                APIEndpoint("search", "POST", "/v1/search",
                            "Busca no workspace.",
                            body_params=("query", "filter", "sort", "page_size")),
                APIEndpoint("query_database", "POST", "/v1/databases/{database_id}/query",
                            "Consulta database.",
                            body_params=("filter", "sorts", "page_size", "start_cursor")),
                APIEndpoint("get_page", "GET", "/v1/pages/{page_id}",
                            "Retorna uma página."),
                APIEndpoint("create_page", "POST", "/v1/pages",
                            "Cria página.",
                            body_params=("parent", "properties", "children")),
            ),
        ),
    ),
    IntegrationEntry(
        id="slack",
        kind="api",
        name="Slack",
        description="Mensagens, canais e usuários via Web API do Slack.",
        category="communication",
        docs_url="https://api.slack.com/web",
        setup_steps=(
            "Crie um app em api.slack.com/apps → 'Create New App' → 'From scratch'.",
            "Em 'OAuth & Permissions', adicione os Bot Token Scopes necessários "
            "(ex: chat:write, channels:read, channels:history, users:read).",
            "Clique em 'Install to Workspace' e copie o 'Bot User OAuth Token' (xoxb-).",
        ),
        credential_fields=(
            CredentialField("bot_token", "Bot User OAuth Token", "password",
                            hint="Começa com xoxb-. Instale o app em api.slack.com/apps → OAuth & Permissions."),
        ),
        auth=AuthSpec(mode="bearer", header_prefix="Bearer ", secret_field="bot_token"),
        api=APIIntegration(
            base_url="https://slack.com",
            endpoints=(
                APIEndpoint("post_message", "POST", "/api/chat.postMessage",
                            "Envia mensagem para canal ou DM.",
                            body_params=("channel", "text", "blocks", "thread_ts")),
                APIEndpoint("list_channels", "GET", "/api/conversations.list",
                            "Lista canais.",
                            query_params=("types", "limit", "cursor")),
                APIEndpoint("channel_history", "GET", "/api/conversations.history",
                            "Histórico de um canal.",
                            query_params=("channel", "limit", "oldest", "latest")),
                APIEndpoint("user_info", "GET", "/api/users.info",
                            "Info de um usuário.",
                            query_params=("user",)),
            ),
        ),
    ),
    IntegrationEntry(
        id="mcp_github",
        kind="mcp",
        name="MCP · GitHub",
        description="Servidor MCP oficial do GitHub (stdio via npx).",
        category="devtools",
        docs_url="https://github.com/github/github-mcp-server",
        setup_steps=(
            "Requer o npx (Node.js) disponível no ambiente do servidor.",
            "Crie um Personal Access Token em github.com/settings/tokens "
            "(escopos: repo, read:org).",
            "Cole o token abaixo — ele é injetado como GITHUB_PERSONAL_ACCESS_TOKEN.",
        ),
        credential_fields=(
            CredentialField("token", "Personal Access Token", "password",
                            hint="Crie em github.com/settings/tokens. Escopos: repo, read:org."),
        ),
        auth=AuthSpec(mode="none", secret_field="token"),
        mcp=MCPIntegration(
            command="npx",
            args=("-y", "@modelcontextprotocol/server-github"),
            env_from_credential={"GITHUB_PERSONAL_ACCESS_TOKEN": "token"},
        ),
    ),
    IntegrationEntry(
        id="mcp_notion",
        kind="mcp",
        name="MCP · Notion",
        description="Servidor MCP para Notion (stdio via npx).",
        category="productivity",
        docs_url="https://github.com/makenotion/notion-mcp-server",
        setup_steps=(
            "Requer o npx (Node.js) disponível no ambiente do servidor.",
            "Crie a integração em notion.so/my-integrations e copie o "
            "'Internal Integration Secret'.",
            "Conecte suas páginas/databases à integração (menu '...' → Connections), "
            "senão ela não enxerga o conteúdo.",
        ),
        credential_fields=(
            CredentialField("token", "Internal Integration Token", "password",
                            hint="Crie em notion.so/my-integrations e compartilhe as páginas com ela."),
        ),
        auth=AuthSpec(mode="none", secret_field="token"),
        mcp=MCPIntegration(
            command="npx",
            args=("-y", "@notionhq/notion-mcp-server"),
            env_from_credential={"NOTION_TOKEN": "token"},
        ),
    ),
    IntegrationEntry(
        id="mcp_slack",
        kind="mcp",
        name="MCP · Slack",
        description="Servidor MCP para Slack (stdio via npx).",
        category="communication",
        docs_url="https://github.com/modelcontextprotocol/servers",
        setup_steps=(
            "Requer o npx (Node.js) disponível no ambiente do servidor.",
            "Crie um app em api.slack.com/apps, adicione os Bot Token Scopes e "
            "instale no workspace para obter o Bot Token (xoxb-).",
            "O Team ID (começa com T) aparece na URL do Slack web ou em "
            "'About this workspace'.",
        ),
        credential_fields=(
            CredentialField("bot_token", "Bot Token (xoxb-)", "password",
                            hint="Instale o app em api.slack.com/apps → OAuth & Permissions."),
            CredentialField("team_id", "Team ID", "text", required=False,
                            hint="Começa com T. Opcional."),
        ),
        auth=AuthSpec(mode="none"),
        mcp=MCPIntegration(
            command="npx",
            args=("-y", "@modelcontextprotocol/server-slack"),
            env_from_credential={
                "SLACK_BOT_TOKEN": "bot_token",
                "SLACK_TEAM_ID": "team_id",
            },
        ),
    ),
    IntegrationEntry(
        id="mcp_azure_devops",
        kind="mcp",
        name="MCP · Azure DevOps",
        description=(
            "Servidor MCP de Azure DevOps: work items, repos, pipelines e wiki "
            "(stdio via npx)."
        ),
        category="devtools",
        docs_url="https://github.com/Tiberriver256/mcp-server-azure-devops",
        setup_steps=(
            "A organização é o nome que aparece na URL: dev.azure.com/<organização>.",
            "Crie um Personal Access Token em dev.azure.com/<org>/_usersSettings/tokens "
            "(User settings → Personal access tokens → New Token). Escopos de leitura: "
            "Work Items (Read), Code (Read), Project and Team (Read).",
            "Reutilize a credencial de Azure DevOps que você já cadastrou "
            "(organização + PAT) — o servidor MCP sobe automaticamente ao ativar.",
        ),
        credential_fields=(
            CredentialField("organization", "Organização", "text",
                            hint="Nome na URL dev.azure.com/<organização>. ex: contoso"),
            CredentialField("pat", "Personal Access Token", "password",
                            hint="Crie em dev.azure.com/<org>/_usersSettings/tokens. "
                                 "Escopos: Work Items (Read), Code (Read)."),
        ),
        auth=AuthSpec(mode="none"),
        mcp=MCPIntegration(
            command="npx",
            args=("-y", "@tiberriver256/mcp-server-azure-devops"),
            env={
                "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/{organization}",
                "AZURE_DEVOPS_AUTH_METHOD": "pat",
                "AZURE_DEVOPS_PAT": "{pat}",
            },
        ),
    ),
    IntegrationEntry(
        id="solides_start",
        kind="api",
        name="Sólides Start (RH/DP)",
        description=(
            "Jornadas de RH/DP na base da própria empresa: avisos de atraso e falta, "
            "pedidos de saída antecipada e sua aprovação, holerite do colaborador, "
            "feedback entre pessoas e sugestões à empresa."
        ),
        category="hr",
        setup_steps=(
            "Pegue a URL da API interna do seu Sólides Start, terminando em "
            "/internal/v1 (ex: https://start.suaempresa.com.br/internal/v1).",
            "Peça ao time que administra o Start a chave de integração "
            "(X-Internal-Api-Key) do seu ambiente.",
            "Informe o tenant (grupo econômico) e a empresa. O agente age sempre "
            "em nome do usuário informado aqui — cadastre uma integração por "
            "pessoa/papel quando quiser um agente para o colaborador e outro "
            "para o gestor.",
        ),
        credential_fields=(
            CredentialField("base_url", "URL da API interna", "url",
                            hint="Termina em /internal/v1."),
            CredentialField("api_key", "Chave de integração", "password",
                            hint="Enviada no header X-Internal-Api-Key."),
            CredentialField("tenant_id", "Tenant ID", "text",
                            hint="UUID do tenant (grupo econômico)."),
            CredentialField("company_id", "Company ID", "text", required=False,
                            hint="UUID da empresa. Opcional em tenant de empresa única."),
            CredentialField("user_id", "User ID", "text",
                            hint="UUID da pessoa em nome de quem o agente age."),
        ),
        auth=AuthSpec(mode="api_key_header", header_name="X-Internal-Api-Key",
                      secret_field="api_key"),
        api=APIIntegration(
            base_url="",
            default_headers={"Content-Type": "application/json"},
            body_from_credential={
                "tenantId": "tenant_id",
                "companyId": "company_id",
                "userId": "user_id",
            },
            endpoints=(
                APIEndpoint("notify_lateness", "POST",
                            "/start/hr-ops-api/notify-lateness",
                            "Avisa o empregador que o colaborador vai se atrasar "
                            "(vira alerta na caixa do gestor).",
                            body_params=("date", "expectedArrivalTime", "reason")),
                APIEndpoint("notify_absence", "POST",
                            "/start/hr-ops-api/notify-absence",
                            "Avisa o empregador que o colaborador vai faltar.",
                            body_params=("date", "reason")),
                APIEndpoint("register_leave_early_request", "POST",
                            "/start/hr-ops-api/register-leave-early-request",
                            "Cria pedido de saída antecipada (status REQUESTED) e "
                            "alerta o gestor.",
                            body_params=("date", "leaveTime", "reason")),
                APIEndpoint("list_leave_early_requests", "POST",
                            "/start/hr-ops-api/list-leave-early-requests",
                            "Lista pedidos de saída antecipada. Com employeeUserId, "
                            "lista os de uma pessoa; sem ele, os da empresa. status "
                            "aceita REQUESTED, APPROVED, REJECTED ou ALL.",
                            body_params=("status", "employeeUserId", "limit")),
                APIEndpoint("review_leave_early_request", "POST",
                            "/start/hr-ops-api/review-leave-early-request",
                            "Aprova ou rejeita um pedido de saída antecipada e "
                            "notifica a pessoa. decision aceita 'approve' ou "
                            "'reject' (minúsculas).",
                            body_params=("requestId", "decision", "note")),
                APIEndpoint("list_my_payslips", "POST",
                            "/start/hr-ops-api/list-my-payslips",
                            "Lista os holerites do próprio colaborador. competencia "
                            "no formato MM/AAAA filtra um mês.",
                            body_params=("competencia", "limit"),
                            body_from_credential={"employeeUserId": "user_id"}),
                APIEndpoint("get_my_payslip_download_url", "POST",
                            "/start/hr-ops-api/get-my-payslip-download-url",
                            "URL assinada (expira em ~5 min) do PDF de um holerite "
                            "do próprio colaborador.",
                            body_params=("documentId",),
                            body_from_credential={"employeeUserId": "user_id"}),
                APIEndpoint("lookup_employee", "POST",
                            "/start/occurrence-api/lookup-employee",
                            "Busca fuzzy de colaborador por nome. Devolve matches "
                            "com userId e match_score — use para resolver um nome "
                            "antes de qualquer ação sobre a pessoa.",
                            body_params=("nameQuery", "limit", "excludeUserId")),
                APIEndpoint("register_peer_feedback", "POST",
                            "/start/hr-ops-api/register-peer-feedback",
                            "Registra e entrega feedback identificado a uma pessoa "
                            "(feedbackType: positive ou constructive).",
                            body_params=("recipientUserId", "recipientName",
                                         "feedbackType", "message"),
                            body_from_credential={"senderUserId": "user_id"}),
                APIEndpoint("list_received_feedbacks", "POST",
                            "/start/hr-ops-api/list-received-feedbacks",
                            "Lista os feedbacks recebidos pelo próprio colaborador.",
                            body_params=("limit",),
                            body_from_credential={"recipientUserId": "user_id"}),
                APIEndpoint("submit_company_suggestion", "POST",
                            "/start/hr-ops-api/submit-company-suggestion",
                            "Envia sugestão à empresa e notifica o gestor. Com "
                            "anonymous=true o autor é descartado no servidor.",
                            body_params=("text", "anonymous"),
                            body_from_credential={"authorUserId": "user_id"}),
            ),
        ),
    ),
)


def get_integration(integration_id: str) -> IntegrationEntry | None:
    """Return the catalog entry by id, or None if unknown."""
    for entry in CATALOG:
        if entry.id == integration_id:
            return entry
    return None
