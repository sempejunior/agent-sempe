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
    """A single REST endpoint exposed via ``http_call``."""

    key: str
    method: str
    path: str
    description: str
    query_params: tuple[str, ...] = ()
    body_params: tuple[str, ...] = ()


@dataclass(frozen=True)
class APIIntegration:
    """A pre-configured REST API integration."""

    base_url: str
    endpoints: tuple[APIEndpoint, ...]
    default_headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class MCPIntegration:
    """A pre-configured MCP server integration."""

    command: str = ""
    args: tuple[str, ...] = ()
    url: str = ""
    env_from_credential: dict[str, str] = field(default_factory=dict)
    header_from_credential: dict[str, str] = field(default_factory=dict)


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
    api: APIIntegration | None = None
    mcp: MCPIntegration | None = None


CATALOG: tuple[IntegrationEntry, ...] = (
    IntegrationEntry(
        id="github",
        kind="api",
        name="GitHub",
        description="Issues, pull requests, repos e workflows do GitHub.",
        category="devtools",
        docs_url="https://docs.github.com/rest",
        credential_fields=(
            CredentialField("token", "Personal Access Token", "password",
                            hint="Escopo mínimo: repo, read:org."),
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
            ),
        ),
    ),
    IntegrationEntry(
        id="jira",
        kind="api",
        name="Jira Cloud",
        description="Issues, projetos e sprints do Jira Cloud.",
        category="devtools",
        docs_url="https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
        credential_fields=(
            CredentialField("base_url", "Base URL da instância", "url", hint="ex: https://minhaempresa.atlassian.net"),
            CredentialField("email", "Email do usuário", "text"),
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
        credential_fields=(
            CredentialField("organization", "Organização", "text", hint="ex: contoso"),
            CredentialField("pat", "Personal Access Token", "password"),
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
                APIEndpoint("get_work_item", "GET", "/{organization}/_apis/wit/workitems/{id}",
                            "Retorna work item por ID.",
                            query_params=("api-version",)),
            ),
        ),
    ),
    IntegrationEntry(
        id="grafana",
        kind="api",
        name="Grafana",
        description="Dashboards, datasources e alerting via API HTTP.",
        category="observability",
        docs_url="https://grafana.com/docs/grafana/latest/developers/http_api/",
        credential_fields=(
            CredentialField("base_url", "Base URL", "url", hint="ex: https://grafana.minhaempresa.com"),
            CredentialField("token", "Service Account Token", "password"),
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
        credential_fields=(
            CredentialField("access_token", "OAuth Access Token", "password",
                            hint="Token de acesso OAuth 2.0. Renove manualmente por enquanto."),
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
        credential_fields=(
            CredentialField("token", "Internal Integration Token", "password"),
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
        credential_fields=(
            CredentialField("bot_token", "Bot User OAuth Token", "password",
                            hint="Começa com xoxb-"),
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
        credential_fields=(
            CredentialField("token", "Personal Access Token", "password"),
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
        credential_fields=(
            CredentialField("token", "Internal Integration Token", "password"),
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
        credential_fields=(
            CredentialField("bot_token", "Bot Token (xoxb-)", "password"),
            CredentialField("team_id", "Team ID", "text", required=False),
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
)


def get_integration(integration_id: str) -> IntegrationEntry | None:
    """Return the catalog entry by id, or None if unknown."""
    for entry in CATALOG:
        if entry.id == integration_id:
            return entry
    return None
