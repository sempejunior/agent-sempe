"""Look at the background work this agent started, and stop it if needed.

The handle a long tool returns is only useful if something can be asked about it.
This is that something — deliberately read-mostly: waiting for a job is not one of
the actions, because waiting is what the background job exists to avoid. The
conclusion arrives on its own as a new turn.
"""

from __future__ import annotations

from typing import Any

from nanobot.agent.tools.base import Tool

_ACTIONS = ("list", "status", "cancel")
_UNFINISHED = ("queued", "running")


class JobsTool(Tool):
    """List, inspect and cancel the agent's background jobs."""

    def __init__(self, *, user_id: str, job_repo: Any, job_runner: Any = None):
        self._user_id = user_id
        self._repo = job_repo
        self._runner = job_runner

    @property
    def name(self) -> str:
        return "jobs"

    @property
    def description(self) -> str:
        return (
            "Tarefas que rodam em segundo plano, iniciadas por você. "
            "action='list' mostra as recentes e em que estado estão; "
            "action='status' detalha uma pelo job_id; action='cancel' interrompe "
            "uma que ainda está rodando. Você NÃO precisa ficar consultando para "
            "saber se terminou: quando termina, o resultado chega numa mensagem "
            "nova. Use só quando alguém perguntar o andamento, ou para desistir "
            "de uma tarefa."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string", "enum": list(_ACTIONS),
                    "description": "list, status ou cancel.",
                },
                "job_id": {
                    "type": "string",
                    "description": "Identificador da tarefa, obrigatório em "
                                   "status e cancel.",
                },
                "state": {
                    "type": "string",
                    "description": "No list, filtra por estado (queued, running, "
                                   "done, failed, timeout, interrupted).",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "", job_id: str = "", state: str = "",
                      **_: Any) -> str:
        action = action.strip().lower()
        if action not in _ACTIONS:
            return f"Error: action deve ser uma de {', '.join(_ACTIONS)}."
        if action == "list":
            return await self._list(state)
        job_id = job_id.strip()
        if not job_id:
            return f"Error: job_id é obrigatório em {action}."
        if action == "status":
            return await self._status(job_id)
        return await self._cancel(job_id)

    async def _list(self, state: str) -> str:
        jobs = await self._repo.list_jobs(
            self._user_id, state=state.strip().lower() or None,
        )
        if not jobs:
            return "Nenhuma tarefa em segundo plano registrada."
        return "\n".join(f"- {_line(job)}" for job in jobs)

    async def _status(self, job_id: str) -> str:
        job = await self._repo.get(self._user_id, job_id)
        if not job:
            return f"Error: nenhuma tarefa com id {job_id}."
        parts = [_line(job)]
        if job.get("state") in _UNFINISHED:
            parts.append("Ainda rodando — não espere por ela aqui; o resultado "
                         "chega numa mensagem nova quando terminar.")
        for label, key in (("Resultado", "result"), ("Erro", "error")):
            if job.get(key):
                parts.append(f"{label}:\n{job[key]}")
        if job.get("log_path"):
            parts.append(f"Log: {job['log_path']}")
        return "\n\n".join(parts)

    async def _cancel(self, job_id: str) -> str:
        if not self._runner:
            return "Error: cancelamento não está disponível neste ambiente."
        if await self._runner.cancel(self._user_id, job_id):
            return (f"{job_id} interrompida. O que a tarefa já tinha feito continua "
                    "onde estava — revise antes de considerar concluído.")
        return (f"{job_id} não está rodando (já terminou ou não existe). "
                "Use action='status' para ver como acabou.")


def _line(job: dict[str, Any]) -> str:
    label = job.get("label") or job.get("kind") or "tarefa"
    started = job.get("started_at") or job.get("created_at") or ""
    return f"{job.get('job_id', '?')} [{job.get('state', '?')}] {label} ({started})"
