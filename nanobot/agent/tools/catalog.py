"""Single catalog of built-in tools: metadata, availability and construction.

Two kinds of capability live here, and the distinction is the product rule:

- **Infrastructure** (``permission=False``) is what makes an agent good — memory,
  knowledge, skills, pages, workspace files, reading the web, calling the APIs the
  client integrated. It has no effect outside the agent's own sandbox, so the
  client never has to ask for it and is never offered a switch for it.
- **Permission** (``permission=True``) is what has consequences outside that
  sandbox: running commands, driving or capturing a machine, acting on a schedule,
  messaging real people, launching third-party servers. The client opts in
  explicitly, per agent, via ``tools_enabled``.

``requires`` names the runtime dependencies a tool needs to exist at all, and
``integrations`` restricts a tool to clients who activated a given integration —
so a vendor capability appears when its integration is on and disappears when it
is off, instead of sitting in a list as a dead switch.

This module is the only place that maps a tool id to its class, its UI metadata
and its availability rule. The backend serves it at ``GET /api/tools/catalog``;
nothing else should hardcode tool ids.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nanobot.agent.tools.base import Tool


@dataclass
class ToolContext:
    """Everything the catalog may need to build a tool for one user+agent."""

    workspace: Path
    user_id: str | None = None
    agent_id: str | None = None
    bus: Any = None
    brave_api_key: str | None = None
    exec_timeout: int = 30
    job_timeout: int = 1800
    restrict_to_workspace: bool = True
    cron_service: Any = None
    skill_repo: Any = None
    user_repo: Any = None
    memory_store: Any = None
    retriever_store: Any = None
    integration_repo: Any = None
    credential_repo: Any = None
    work_item_repo: Any = None
    job_repo: Any = None
    job_runner: Any = None
    question_repo: Any = None
    deliverable_repo: Any = None
    public_url: str | None = None
    active_integrations: set[str] = field(default_factory=set)
    display: bool = False

    @property
    def agent_dir(self) -> Path:
        """Where this agent's own files live — code checkouts, scratch, output.

        Falls back to the shared workspace only when there is no agent identity
        (the single-user CLI path).
        """
        if not self.user_id or not self.agent_id:
            return self.workspace
        from nanobot.utils.helpers import agent_workspace_path
        return agent_workspace_path(self.workspace, self.user_id, self.agent_id)

    @property
    def allowed_dir(self) -> Path | None:
        return self.agent_dir if self.restrict_to_workspace else None


def _cli_integrations() -> tuple[str, ...]:
    """Integration ids that provide a code agent CLI — derived from its specs."""
    from nanobot.agent.tools.code_agent import cli_integrations
    return cli_integrations()


def _git_origins() -> tuple[str, ...]:
    """Integration ids that declare a git remote — derived, never hand-written."""
    from nanobot.integrations.catalog import CATALOG as INTEGRATIONS
    return tuple(entry.id for entry in INTEGRATIONS if entry.git)


def _has_credentials(ctx: ToolContext) -> bool:
    return bool(ctx.integration_repo and ctx.credential_repo and ctx.user_id)


_REQUIREMENTS: dict[str, Callable[[ToolContext], bool]] = {
    "memory": lambda ctx: ctx.memory_store is not None,
    "retriever": lambda ctx: ctx.retriever_store is not None,
    "skills": lambda ctx: bool(ctx.skill_repo and ctx.user_id),
    "integrations": _has_credentials,
    "cron": lambda ctx: ctx.cron_service is not None,
    "bus": lambda ctx: ctx.bus is not None,
    "user_repo": lambda ctx: bool(ctx.user_repo and ctx.user_id),
    "work_items": lambda ctx: bool(ctx.work_item_repo and ctx.user_id),
    "jobs": lambda ctx: bool(ctx.job_repo and ctx.user_id),
    "questions": lambda ctx: bool(ctx.question_repo and ctx.user_id),
    "display": lambda ctx: ctx.display,
}


@dataclass(frozen=True)
class ToolSpec:
    """One tool: how to show it, when it exists, and how to build it."""

    id: str
    label: str
    category: str
    build: Callable[[ToolContext], "Tool | None"]
    permission: bool = False
    warn: str = ""
    requires: tuple[str, ...] = ()
    integrations: tuple[str, ...] = ()

    def is_available(self, ctx: ToolContext) -> bool:
        """Whether this tool can exist for the given context at all."""
        if any(not _REQUIREMENTS[req](ctx) for req in self.requires):
            return False
        if self.integrations and not (set(self.integrations) & ctx.active_integrations):
            return False
        return True


def _read_file(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.filesystem import ReadFileTool
    return ReadFileTool(workspace=ctx.agent_dir, allowed_dir=ctx.allowed_dir)


def _write_file(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.filesystem import WriteFileTool
    return WriteFileTool(workspace=ctx.agent_dir, allowed_dir=ctx.allowed_dir)


def _edit_file(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.filesystem import EditFileTool
    return EditFileTool(workspace=ctx.agent_dir, allowed_dir=ctx.allowed_dir)


def _list_dir(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.filesystem import ListDirTool
    return ListDirTool(workspace=ctx.agent_dir, allowed_dir=ctx.allowed_dir)


def _web_search(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.web import WebSearchTool
    return WebSearchTool(api_key=ctx.brave_api_key)


def _web_fetch(_: ToolContext) -> "Tool":
    from nanobot.agent.tools.web import WebFetchTool
    return WebFetchTool()


def _cnpj_lookup(_: ToolContext) -> "Tool":
    from nanobot.agent.tools.cnpj import CnpjLookupTool
    return CnpjLookupTool()


def _cct_search(_: ToolContext) -> "Tool":
    from nanobot.agent.tools.cct import CctSearchTool
    return CctSearchTool()


def _read_skill(ctx: ToolContext) -> "Tool":
    from nanobot.agent.skills import BUILTIN_SKILLS_DIR
    from nanobot.agent.tools.skill import ReadSkillTool
    return ReadSkillTool(user_id=ctx.user_id, skill_repo=ctx.skill_repo,
                         workspace=ctx.workspace, builtin_dir=BUILTIN_SKILLS_DIR)


def _save_skill(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.skill import SaveSkillTool
    return SaveSkillTool(user_id=ctx.user_id, skill_repo=ctx.skill_repo,
                         workspace=ctx.workspace)


def _publish_page(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.report_page import PublishPageTool
    return PublishPageTool(workspace=ctx.workspace, public_url=ctx.public_url,
                           deliverable_repo=ctx.deliverable_repo,
                           user_id=ctx.user_id or "", agent_id=ctx.agent_id or "")


def _publish_report(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.report_page import PublishReportTool
    return PublishReportTool(workspace=ctx.workspace, public_url=ctx.public_url,
                             deliverable_repo=ctx.deliverable_repo,
                             user_id=ctx.user_id or "", agent_id=ctx.agent_id or "")


def _http_call(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.http_call import HttpCallTool
    return HttpCallTool(user_id=ctx.user_id, integration_repo=ctx.integration_repo,
                        credential_repo=ctx.credential_repo)


def _azure_devops_report(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.azure_report import AzureReportTool
    return AzureReportTool(user_id=ctx.user_id, integration_repo=ctx.integration_repo,
                           credential_repo=ctx.credential_repo, workspace=ctx.workspace,
                           public_url=ctx.public_url)


def _save_memory(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.memory import SaveMemoryTool
    return SaveMemoryTool(ctx.memory_store)


def _search_memory(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.memory import SearchMemoryTool
    return SearchMemoryTool(ctx.memory_store)


def _rag_search(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.rag import RAGSearchTool
    return RAGSearchTool(ctx.retriever_store)


def _rag_ingest(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.rag import RAGIngestTool
    return RAGIngestTool(ctx.retriever_store)


def _exec(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.shell import ExecTool
    return ExecTool(working_dir=str(ctx.agent_dir), timeout=ctx.exec_timeout,
                    allowed_root=ctx.allowed_dir)


def _repo(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.repo import RepoTool
    return RepoTool(user_id=ctx.user_id, integration_repo=ctx.integration_repo,
                    credential_repo=ctx.credential_repo, agent_dir=ctx.agent_dir)


def _code_agent(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.code_agent import CodeAgentTool
    return CodeAgentTool(user_id=ctx.user_id, integration_repo=ctx.integration_repo,
                         credential_repo=ctx.credential_repo, agent_dir=ctx.agent_dir,
                         workspace=ctx.workspace, timeout=ctx.job_timeout,
                         job_runner=ctx.job_runner)


def _jobs(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.jobs import JobsTool
    return JobsTool(user_id=ctx.user_id, job_repo=ctx.job_repo,
                    job_runner=ctx.job_runner)


def _ask_human(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.ask_human import AskHumanTool
    return AskHumanTool(user_id=ctx.user_id, question_repo=ctx.question_repo,
                        agent_id=ctx.agent_id or "")


def _work_ledger(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.work_ledger import WorkLedgerTool
    return WorkLedgerTool(user_id=ctx.user_id, work_item_repo=ctx.work_item_repo,
                          agent_id=ctx.agent_id or "",
                          stale_after_s=ctx.job_timeout)


def _cron(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.cron import CronTool
    return CronTool(ctx.cron_service)


def _message(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.message import MessageTool
    return MessageTool(send_callback=ctx.bus.publish_outbound)


def _save_mcp_server(ctx: ToolContext) -> "Tool":
    from nanobot.agent.tools.mcp_config import SaveMCPServerTool
    return SaveMCPServerTool(user_id=ctx.user_id, user_repo=ctx.user_repo)


def _computer(_: ToolContext) -> "Tool":
    from nanobot.agent.tools.computer import ComputerTool
    return ComputerTool()


def _browser(_: ToolContext) -> "Tool":
    from nanobot.agent.tools.browser import BrowserTool
    return BrowserTool()


def _screenshot(_: ToolContext) -> "Tool":
    from nanobot.agent.tools.screenshot import ScreenshotTool
    return ScreenshotTool()


CATALOG: tuple[ToolSpec, ...] = (
    ToolSpec("save_memory", "Memória de longo prazo", "Memória & Conhecimento",
             _save_memory, requires=("memory",)),
    ToolSpec("search_memory", "Busca na memória", "Memória & Conhecimento",
             _search_memory, requires=("memory",)),
    ToolSpec("rag_search", "Busca na base de conhecimento", "Memória & Conhecimento",
             _rag_search, requires=("retriever",)),
    ToolSpec("rag_ingest", "Ingestão na base de conhecimento", "Memória & Conhecimento",
             _rag_ingest, requires=("retriever",)),
    ToolSpec("read_skill", "Leitura de skills", "Skills", _read_skill,
             requires=("skills",)),
    ToolSpec("save_skill", "Criação de skills", "Skills", _save_skill,
             requires=("skills",)),
    ToolSpec("publish_page", "Publicação de páginas", "Relatórios & Páginas",
             _publish_page),
    ToolSpec("publish_report", "Relatórios estruturados", "Relatórios & Páginas",
             _publish_report),
    ToolSpec("http_call", "Chamadas às APIs integradas", "Integrações", _http_call,
             requires=("integrations",)),
    ToolSpec("azure_devops_report", "Relatório de entrega do Azure DevOps",
             "Integrações", _azure_devops_report, requires=("integrations",),
             integrations=("azure_devops", "mcp_azure_devops")),
    ToolSpec("web_search", "Pesquisa na web", "Web", _web_search),
    ToolSpec("web_fetch", "Leitura de páginas", "Web", _web_fetch),
    ToolSpec("cnpj_lookup", "Consulta de CNPJ", "Dados públicos", _cnpj_lookup),
    ToolSpec("cct_search", "Base de convenções coletivas", "Dados públicos",
             _cct_search),
    ToolSpec("read_file", "Leitura de arquivos", "Arquivos do agente", _read_file),
    ToolSpec("write_file", "Escrita de arquivos", "Arquivos do agente", _write_file),
    ToolSpec("edit_file", "Edição de arquivos", "Arquivos do agente", _edit_file),
    ToolSpec("list_dir", "Listagem de pastas", "Arquivos do agente", _list_dir),
    ToolSpec("repo", "Repositórios de código", "Ambiente", _repo,
             permission=True, requires=("integrations",),
             integrations=_git_origins(),
             warn="Clona, comita e envia branches nos repositórios do cliente."),
    ToolSpec("code_agent", "Agente de código no terminal", "Ambiente", _code_agent,
             permission=True, requires=("integrations",),
             integrations=_cli_integrations(),
             warn="Delega a escrita do código a um agente externo, que edita "
                  "arquivos e roda comandos no repositório."),
    ToolSpec("work_ledger", "Registro de demandas trabalhadas", "Ambiente",
             _work_ledger, requires=("work_items",)),
    ToolSpec("jobs", "Tarefas em segundo plano", "Ambiente", _jobs,
             requires=("jobs",)),
    ToolSpec("ask_human", "Perguntar a uma pessoa e seguir", "Autonomia", _ask_human,
             requires=("questions",)),
    ToolSpec("exec", "Executar comandos no terminal", "Ambiente", _exec,
             permission=True,
             warn="Roda comandos arbitrários no ambiente do agente."),
    ToolSpec("computer", "Controlar o desktop", "Ambiente", _computer,
             permission=True, requires=("display",),
             warn="Controla teclado e mouse de uma máquina."),
    ToolSpec("browser", "Controlar o navegador", "Ambiente", _browser,
             permission=True, requires=("display",),
             warn="Navega e interage em sites em nome do agente."),
    ToolSpec("screenshot", "Capturar a tela", "Ambiente", _screenshot,
             permission=True, requires=("display",),
             warn="Captura imagens da tela — pode registrar dados sensíveis."),
    ToolSpec("cron", "Agir em horário agendado", "Autonomia", _cron,
             permission=True, requires=("cron",),
             warn="O agente passa a agir sozinho, sem ninguém pedir."),
    ToolSpec("message", "Enviar mensagens proativas", "Autonomia", _message,
             permission=True, requires=("bus",),
             warn="Envia mensagem a pessoas reais nos canais conectados."),
    ToolSpec("save_mcp_server", "Cadastrar servidores MCP", "Autonomia",
             _save_mcp_server, permission=True, requires=("user_repo",),
             warn="Sobe servidores de terceiros que passam a expor tools."),
)


def get_spec(tool_id: str) -> ToolSpec | None:
    """Return the spec for a tool id, or None if unknown."""
    for spec in CATALOG:
        if spec.id == tool_id:
            return spec
    return None


def serialize_catalog() -> list[dict[str, Any]]:
    """Catalog as plain data for the API, in declaration order."""
    return [
        {
            "id": spec.id,
            "label": spec.label,
            "category": spec.category,
            "permission": spec.permission,
            "warn": spec.warn,
            "requires": list(spec.requires),
            "integrations": list(spec.integrations),
        }
        for spec in CATALOG
    ]
