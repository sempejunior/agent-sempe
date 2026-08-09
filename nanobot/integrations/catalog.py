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


def build_auth_headers(auth: AuthSpec, credential: dict) -> dict[str, str]:
    """Compose the auth headers an AuthSpec asks for, from a decrypted credential.

    Lives here because the AuthSpec does, and because both transports need it:
    a REST call and a vendor-hosted MCP server authenticate the same way. The
    ``query_key`` mode is not a header and is handled by the caller that has a
    query string.
    """
    if auth.mode == "bearer":
        secret = credential.get(auth.secret_field, "")
        return {auth.header_name: f"{auth.header_prefix}{secret}"} if secret else {}
    if auth.mode == "api_key_header":
        secret = credential.get(auth.secret_field, "")
        return {auth.header_name: str(secret)} if secret else {}
    if auth.mode == "basic":
        import base64
        username = credential.get(auth.username_field, "") if auth.username_field else ""
        password = credential.get(auth.password_field, "")
        if not (username or password):
            return {}
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        return {"Authorization": f"Basic {token}"}
    return {}


@dataclass(frozen=True)
class APIEndpoint:
    """A single REST endpoint exposed via ``http_call``.

    ``body_from_credential`` maps a request body field to a credential field
    (``{"employeeUserId": "user_id"}``). It extends whatever the integration
    declares and takes precedence over it for the same body field.

    ``default_query`` overrides the integration's own default for this endpoint
    alone. Vendors version endpoints unevenly — the Azure comments API never
    left preview and rejects the organization-wide ``api-version`` — and the
    default belongs here rather than in a prompt telling the model to remember
    an exception.
    """

    key: str
    method: str
    path: str
    description: str
    query_params: tuple[str, ...] = ()
    body_params: tuple[str, ...] = ()
    body_from_credential: dict[str, str] = field(default_factory=dict)
    default_query: dict[str, str] = field(default_factory=dict)


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
    default_query: dict[str, str] = field(default_factory=dict)
    """Query parameters every call needs — an API version, for instance. They are
    a constant of the integration, not a choice for the model to remember."""


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
    """One way of reaching one vendor: a REST API, an MCP server, or a local CLI.

    ``provider`` is the vendor this entry belongs to, and it is what a credential
    is scoped to. Two entries for the same vendor — the Azure DevOps REST API and
    its MCP server, say — share one provider, so the client pastes the PAT once
    and both transports use it. Without it the client is asked for the same secret
    twice and ends up with two copies of it to rotate.
    """

    id: str
    kind: Literal["api", "mcp", "cli"]
    name: str
    description: str
    category: str
    credential_fields: tuple[CredentialField, ...] = ()
    auth: AuthSpec = field(default_factory=AuthSpec)
    docs_url: str = ""
    credential_url: str = ""
    """Where the client creates the secret — the exact page, not the docs.

    Empty when no static URL can exist (a self-hosted instance, or a path that
    needs the organization name). The setup steps carry the path in that case."""

    setup_steps: tuple[str, ...] = ()
    provider: str = ""
    api: APIIntegration | None = None
    mcp: MCPIntegration | None = None
    git: GitSpec | None = None

    @property
    def provider_id(self) -> str:
        """The vendor this entry belongs to; itself, when it is the only entry."""
        return self.provider or self.id


CATALOG: tuple[IntegrationEntry, ...] = (
    IntegrationEntry(
        id="github",
        kind="api",
        name="GitHub",
        description="Issues, pull requests, repos e workflows do GitHub.",
        category="devtools",
        docs_url="https://docs.github.com/rest",
        credential_url="https://github.com/settings/tokens",
        setup_steps=(
            "No GitHub, clique na sua foto (canto superior direito) → Settings → "
            "Developer settings → Personal access tokens → Tokens (classic). O botão "
            "abaixo abre essa página direto.",
            "Clique em 'Generate new token' → 'Generate new token (classic)', dê um "
            "nome que lembre para que serve e escolha a validade.",
            "Marque os escopos 'repo' (ler e escrever nos repositórios) e 'read:org' "
            "(ver os times da organização). Só isso — escopo a mais é risco a mais.",
            "Clique em 'Generate token' e copie na hora: o GitHub mostra o valor uma "
            "única vez. Ele começa com 'ghp_'.",
            "Token com validade vence sem avisar o agente: quando as chamadas "
            "começarem a falhar com 401, gere outro e edite esta credencial.",
        ),
        credential_fields=(
            CredentialField("token", "Personal Access Token (classic)", "password",
                            hint="Começa com ghp_. Escopos: repo e read:org. Um token "
                                 "fine-grained também funciona, mas exige liberar "
                                 "repositório por repositório."),
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
        credential_url="https://id.atlassian.com/manage-profile/security/api-tokens",
        setup_steps=(
            "A Base URL é o endereço que aparece quando você usa o Jira: "
            "https://suaempresa.atlassian.net (sem /jira e sem barra no fim).",
            "O botão abaixo abre id.atlassian.com → Security → API tokens. Clique em "
            "'Create API token', dê um nome e escolha a validade.",
            "Copie o token na hora — ele não é mostrado de novo. Diferente de outros "
            "fornecedores, o token da Atlassian não tem prefixo reconhecível.",
            "O login é o seu email da conta Atlassian + o token (autenticação básica). "
            "O token herda as suas permissões: o agente vê o que você vê.",
            "Só funciona em Jira Cloud. Data Center e Server usam outro tipo de token "
            "e não são atendidos por esta integração.",
        ),
        credential_fields=(
            CredentialField("base_url", "Base URL da instância", "url",
                            hint="ex: https://minhaempresa.atlassian.net — sem barra no fim."),
            CredentialField("email", "Email da conta Atlassian", "text",
                            hint="O mesmo email com que você entra no Jira."),
            CredentialField("api_token", "API Token", "password",
                            hint="Criado em id.atlassian.com → Security → API tokens. "
                                 "Visível só na criação."),
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
            "Só para consultar o board: Work Items (Read), Code (Read), "
            "Project and Team (Read).",
            "Para o agente também COMENTAR na demanda e abrir pull request, marque "
            "Work Items (Read & Write) e Code (Read & Write). Um token só de leitura "
            "passa em todas as consultas e falha com 403 no último passo — quando o "
            "trabalho já foi feito.",
            "Copie o token e cole no campo abaixo — ele só é mostrado uma vez.",
        ),
        credential_fields=(
            CredentialField("organization", "Organização", "text",
                            hint="Nome na URL dev.azure.com/<organização>. ex: contoso"),
            CredentialField("pat", "Personal Access Token", "password",
                            hint="Crie em dev.azure.com/<org>/_usersSettings/tokens. "
                                 "Para comentar na demanda e abrir PR: Work Items "
                                 "(Read & Write) e Code (Read & Write)."),
        ),
        auth=AuthSpec(mode="basic", username_field="", password_field="pat"),
        api=APIIntegration(
            base_url="https://dev.azure.com",
            default_query={"api-version": "7.1"},
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
                            body_params=("text",),
                            default_query={"api-version": "7.1-preview.3"}),
                APIEndpoint("get_work_item", "GET", "/{organization}/_apis/wit/workitems/{id}",
                            "Retorna work item por ID.",
                            query_params=("api-version",)),
            ),
        ),
        git=GitSpec("https://dev.azure.com/{organization}/_git/{path}", "azure", "pat"),
    ),
    IntegrationEntry(
        id="claude_code",
        kind="cli",
        name="Claude Code (agente de código)",
        description=(
            "Delega a escrita de código ao Claude Code rodando nesta máquina, "
            "dentro do repositório clonado. O agente prepara o branch da demanda, "
            "o Claude escreve e comita, e os testes decidem se vira pull request. "
            "Roda sempre com o modelo Sonnet."
        ),
        category="devtools",
        docs_url="https://code.claude.com/docs/en/headless",
        credential_url="https://console.anthropic.com/settings/keys",
        setup_steps=(
            "São dois caminhos alternativos. Preencha UM dos campos abaixo e deixe "
            "o outro vazio — nenhum dos dois é obrigatório sozinho.",
            "CAMINHO 1 — Token da assinatura. É o mais rápido e não gera cobrança "
            "nova: usa o plano Claude que você já tem. No SEU terminal (não aqui no "
            "chat, para o token não ficar gravado na conversa) rode: "
            "claude setup-token",
            "Ele abre o navegador para você autorizar com a conta que já está "
            "logada, e no fim imprime o token no terminal. Copie e cole no campo "
            "'Token da assinatura'.",
            "Não existe configuração de validade: esse token já nasce de longa "
            "duração (é para isso que o comando serve). Ele vale até você revogar "
            "o acesso na sua conta Claude ou trocar de plano. Se um dia parar de "
            "funcionar, rode o comando de novo e cole o token novo aqui.",
            "Não tem o comando 'claude' na máquina? Instale antes com: "
            "curl -fsSL https://claude.ai/install.sh | bash",
            "CAMINHO 2 — API Key. Use quando isto for para produção e você quiser "
            "o gasto separado da assinatura. Abra console.anthropic.com → Settings "
            "→ API Keys → Create Key, dê um nome que lembre para que serve, e copie "
            "na hora: o valor completo só aparece no momento da criação.",
            "Chave de console não tem campo de validade — vale até alguém revogar "
            "no próprio console. Ela é cobrada por token consumido, então exige uma "
            "organização com faturamento configurado.",
            "Depois de salvar, instale o binário no botão 'Instalar' — são ~290 MB "
            "e ficam no volume do workspace, então sobrevivem a recriar o container.",
        ),
        credential_fields=(
            CredentialField("oauth_token", "Token da assinatura", "password",
                            required=False,
                            hint="Rode 'claude setup-token' no seu terminal e cole "
                                 "o token que ele imprimir. Já é de longa duração — "
                                 "não há validade para configurar. Deixe vazio se "
                                 "for usar API key."),
            CredentialField("api_key", "API Key da Anthropic", "password",
                            required=False,
                            hint="Começa com sk-ant-. console.anthropic.com → "
                                 "Settings → API Keys → Create Key. Não expira: "
                                 "vale até ser revogada no console. Deixe vazio se "
                                 "for usar o token da assinatura."),
        ),
        auth=AuthSpec(mode="none"),
    ),
    IntegrationEntry(
        id="kiro",
        kind="cli",
        name="Kiro (agente de código)",
        description=(
            "Delega a escrita de código ao Kiro CLI rodando nesta máquina, dentro "
            "do repositório clonado. O agente prepara o branch, o Kiro escreve, e "
            "os testes decidem se vira pull request."
        ),
        category="devtools",
        docs_url="https://kiro.dev/docs/cli/headless/",
        credential_url="https://app.kiro.dev",
        setup_steps=(
            "Entre em app.kiro.dev com uma conta Pro, Pro+, Pro Max ou Power — "
            "chave de API não existe no plano gratuito.",
            "Vá na seção API Keys, crie uma chave com um nome que lembre para que "
            "ela serve, e copie na hora: o valor completo só aparece na criação.",
            "Se a sua assinatura é gerida por um administrador, ele precisa "
            "habilitar a geração de chaves antes (API key governance).",
            "Cole a chave abaixo (começa com ksk_). Ela é guardada cifrada e vai "
            "só para o processo do Kiro CLI — nunca aparece no chat.",
        ),
        credential_fields=(
            CredentialField("api_key", "API Key do Kiro", "password",
                            hint="Começa com ksk_. Criada em app.kiro.dev → API Keys. "
                                 "Vai como KIRO_API_KEY para o kiro-cli."),
        ),
        auth=AuthSpec(mode="none"),
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
        docs_url="https://grafana.com/docs/grafana/latest/administration/service-accounts/",
        setup_steps=(
            "A Base URL é o endereço com que você abre o Grafana, sem barra no fim "
            "(ex: https://grafana.suaempresa.com). Não há link fixo aqui porque cada "
            "Grafana tem o seu.",
            "No Grafana, barra lateral → Administration → Users and access → Service "
            "accounts. Precisa ser admin da organização.",
            "Crie um service account, dê um nome e escolha a role: 'Viewer' se o agente "
            "só vai consultar dashboards e alertas; 'Editor' se for criar algo.",
            "Abra o service account criado e clique em 'Add service account token'. "
            "Copie o valor na hora — começa com 'glsa_' e não é mostrado de novo.",
            "Se você tinha uma API key antiga: elas foram descontinuadas e migradas "
            "automaticamente para service accounts. Use o token novo.",
        ),
        credential_fields=(
            CredentialField("base_url", "Base URL do Grafana", "url",
                            hint="ex: https://grafana.suaempresa.com — sem barra no fim."),
            CredentialField("token", "Service Account Token", "password",
                            hint="Começa com glsa_. Administration → Users and access → "
                                 "Service accounts → Add service account token."),
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
        credential_url="https://developers.google.com/oauthplayground",
        setup_steps=(
            "Leia isto antes: o Google não emite token de longa duração para este "
            "caminho. O que você vai cadastrar aqui **expira em cerca de 1 hora** e "
            "precisa ser trocado à mão. Serve para experimentar, não para uma rotina.",
            "O botão abaixo abre o OAuth Playground. No painel da direita, clique na "
            "engrenagem e marque 'Use your own OAuth credentials' se tiver um projeto "
            "próprio; sem isso vale o app de teste do Google.",
            "Na lista da esquerda, escolha os escopos das APIs que o agente vai usar "
            "(Gmail, Calendar, Drive) e clique em 'Authorize APIs'. Autorize com a sua "
            "conta Google.",
            "Clique em 'Exchange authorization code for tokens' e copie o "
            "'Access token' (começa com 'ya29.').",
            "Quando o agente começar a receber 401, o token venceu: repita e edite esta "
            "credencial. Um acesso durável exige OAuth com refresh, que esta plataforma "
            "ainda não faz.",
        ),
        credential_fields=(
            CredentialField("access_token", "OAuth Access Token", "password",
                            hint="Começa com ya29. e EXPIRA EM ~1 HORA. Gere em "
                                 "developers.google.com/oauthplayground."),
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
        docs_url="https://developers.notion.com/guides/get-started/authorization",
        credential_url="https://www.notion.so/my-integrations",
        setup_steps=(
            "Você precisa ser owner do workspace para criar a integração. Se não for, "
            "peça a quem é.",
            "O botão abaixo abre notion.so/my-integrations. Clique em 'New integration', "
            "dê um nome (é o nome que vai aparecer no Notion) e escolha o workspace.",
            "Copie o token da aba de configuração — 'Internal Integration Secret'. "
            "Tokens novos começam com 'ntn_'; os antigos, com 'secret_', continuam "
            "valendo.",
            "O passo que todo mundo esquece: a integração não vê nada até você "
            "conectá-la às páginas. Abra cada página ou database → menu '...' (canto "
            "superior direito) → 'Connections' → escolha a sua integração.",
            "Se o agente disser que não encontra uma página que existe, quase sempre é "
            "isso: a página não foi conectada.",
        ),
        credential_fields=(
            CredentialField("token", "Internal Integration Secret", "password",
                            hint="Começa com ntn_ (ou secret_, se for antigo). "
                                 "notion.so/my-integrations → sua integração → "
                                 "Configuration. Não esqueça de conectar as páginas."),
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
        credential_url="https://api.slack.com/apps",
        setup_steps=(
            "O botão abaixo abre api.slack.com/apps. Clique em 'Create New App' → "
            "'From scratch', dê um nome e escolha o workspace.",
            "No app criado, barra lateral → 'OAuth & Permissions' → seção 'Scopes' → "
            "'Bot Token Scopes'. Adicione o que o agente precisa: 'chat:write' para "
            "enviar mensagem, 'channels:read' para listar canais, 'channels:history' "
            "para ler conversa, 'users:read' para resolver nomes.",
            "Ainda em 'OAuth & Permissions', clique em 'Install to Workspace' e "
            "autorize. Um admin do workspace pode precisar aprovar.",
            "Copie o 'Bot User OAuth Token' — começa com 'xoxb-'. Esse é o token do "
            "app, não o seu; ele continua valendo enquanto o app estiver instalado.",
            "Último passo, dentro do Slack: convide o app no canal onde ele vai agir "
            "(/invite @nome-do-app). Sem isso ele não enxerga o canal, mesmo com os "
            "escopos certos.",
        ),
        credential_fields=(
            CredentialField("bot_token", "Bot User OAuth Token", "password",
                            hint="Começa com xoxb-. api.slack.com/apps → seu app → "
                                 "OAuth & Permissions → Install to Workspace."),
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
        id="mcp_atlassian",
        kind="mcp",
        provider="jira",
        name="MCP · Atlassian (Rovo)",
        description=(
            "Servidor MCP oficial da Atlassian, hospedado por ela: Jira, "
            "Confluence, JSM, Bitbucket e Compass. Só Atlassian Cloud."
        ),
        category="devtools",
        docs_url="https://github.com/atlassian/atlassian-mcp-server",
        credential_url="https://id.atlassian.com/manage-profile/security/api-tokens",
        setup_steps=(
            "Usa a mesma credencial do Jira — email + API token. Se você já cadastrou, "
            "escolha ela na hora de ativar.",
            "Um administrador precisa habilitar a autenticação por API token nas "
            "configurações do Rovo MCP Server da organização; sem isso o servidor "
            "recusa o token com 401.",
            "Servidor remoto, hospedado pela Atlassian. Cobre Jira, Confluence, Jira "
            "Service Management, Bitbucket e Compass — só em Atlassian Cloud.",
        ),
        credential_fields=(
            CredentialField("email", "Email da conta Atlassian", "text",
                            hint="O mesmo email da credencial do Jira."),
            CredentialField("api_token", "API Token", "password",
                            hint="O mesmo token da credencial do Jira."),
        ),
        auth=AuthSpec(mode="basic", username_field="email", password_field="api_token"),
        mcp=MCPIntegration(url="https://mcp.atlassian.com/v1/mcp"),
    ),
    IntegrationEntry(
        id="mcp_github",
        kind="mcp",
        provider="github",
        name="MCP · GitHub",
        description=(
            "Servidor MCP oficial do GitHub, hospedado pela própria GitHub: issues, "
            "pull requests, repositórios e workflows como tools."
        ),
        category="devtools",
        docs_url="https://github.com/github/github-mcp-server",
        credential_url="https://github.com/settings/tokens",
        setup_steps=(
            "Usa a mesma credencial do GitHub — se você já cadastrou o Personal "
            "Access Token, escolha ela na hora de ativar.",
            "O servidor é remoto (api.githubcopilot.com/mcp): não baixa nada nesta "
            "máquina e o token vai no header, nunca no disco.",
        ),
        credential_fields=(
            CredentialField("token", "Personal Access Token (classic)", "password",
                            hint="O mesmo token da API do GitHub: escopos repo e read:org."),
        ),
        auth=AuthSpec(mode="bearer", header_prefix="Bearer ", secret_field="token"),
        mcp=MCPIntegration(url="https://api.githubcopilot.com/mcp/"),
    ),
    IntegrationEntry(
        id="mcp_notion",
        kind="mcp",
        provider="notion",
        name="MCP · Notion",
        description="Servidor MCP para Notion (stdio via npx).",
        category="productivity",
        docs_url="https://github.com/makenotion/notion-mcp-server",
        credential_url="https://www.notion.so/my-integrations",
        setup_steps=(
            "Usa a mesma credencial do Notion. Se você já cadastrou o Internal "
            "Integration Secret, escolha ela na hora de ativar.",
            "Servidor oficial da Notion (@notionhq/notion-mcp-server), sobe nesta "
            "máquina via npx na primeira vez que um agente o usa.",
            "Valem as mesmas regras de visibilidade da API: a integração só alcança as "
            "páginas que você conectou a ela no Notion.",
        ),
        credential_fields=(
            CredentialField("token", "Internal Integration Secret", "password",
                            hint="O mesmo token da credencial do Notion."),
        ),
        auth=AuthSpec(mode="none", secret_field="token"),
        mcp=MCPIntegration(
            command="npx",
            args=("-y", "@notionhq/notion-mcp-server"),
            env_from_credential={"NOTION_TOKEN": "token"},
        ),
    ),
    IntegrationEntry(
        id="mcp_azure_devops",
        kind="mcp",
        provider="azure_devops",
        name="MCP · Azure DevOps",
        description=(
            "Servidor MCP de Azure DevOps: work items, repos, pipelines e wiki "
            "(stdio via npx)."
        ),
        category="devtools",
        docs_url="https://github.com/Tiberriver256/mcp-server-azure-devops",
        setup_steps=(
            "Usa a mesma credencial do Azure DevOps — organização + PAT. Se você já "
            "cadastrou, escolha ela na hora de ativar.",
            "Sobe nesta máquina via npx na primeira vez que um agente o usa, e expõe "
            "46 tools (work items, repos, pipelines, wiki). São 46 definições no "
            "prompt de cada turno: ative só nos agentes que trabalham com Azure.",
            "Este é o servidor da comunidade, e é proposital: o oficial da Microsoft "
            "(@azure-devops/mcp) só autentica por login de navegador ou Azure CLI, o "
            "que não funciona num serviço que roda sozinho.",
        ),
        credential_fields=(
            CredentialField("organization", "Organização", "text",
                            hint="A mesma da credencial de Azure DevOps."),
            CredentialField("pat", "Personal Access Token", "password",
                            hint="O mesmo PAT da credencial de Azure DevOps."),
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
            "Esta é uma integração interna da Sólides: os dados não vêm de uma conta "
            "pública, vêm da base do Start da sua empresa. Quem fornece tudo abaixo é "
            "o time que administra o Start.",
            "URL da API interna: termina em /internal/v1 "
            "(ex: https://start.suaempresa.com.br/internal/v1).",
            "Chave de integração: enviada no header X-Internal-Api-Key. Peça a do seu "
            "ambiente — a de homologação não serve em produção.",
            "Tenant é o grupo econômico e company é a empresa, os dois em UUID. Em "
            "tenant de empresa única, company pode ficar vazio.",
            "O user_id é a pessoa em nome de quem o agente age, e isso não é detalhe: "
            "a identidade vem daqui, não do que o modelo escrever. Para um agente do "
            "colaborador e outro do gestor, cadastre duas credenciais — mesma chave e "
            "mesmo tenant, user_id diferente.",
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
