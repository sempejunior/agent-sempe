"""Run work that outlives the turn that started it.

A delegation to a code agent CLI takes tens of minutes. Waiting for it inside a
tool call cannot work: the turn has a ceiling (180s on the web panel), the worker
stays parked, and the socket that submitted the request is long gone by the time
there is an answer. So the tool registers a job here, gets a handle back, and the
turn ends in seconds.

How the agent finds out it finished is the point of this module. The conclusion is
not a return value — it is **a new turn** in the session that asked for the work,
started from the job's ``origin_channel``/``origin_chat_id``. The agent wakes up
with the demand still in its history and carries on: run the tests, review the
diff, commit, open the pull request. Nobody polls anything.
"""

from __future__ import annotations

import asyncio
import os
import signal
import uuid
from typing import Any, Awaitable, Callable

from loguru import logger

from nanobot.jobs.delivery import WebPush
from nanobot.jobs.resume import resume_conversation

JobWork = Callable[[str], Awaitable[str]]
"""The actual work. Receives the job handle; returns the summary the agent reads
when it wakes up."""

_DEFAULT_TIMEOUT_S = 1800
_DEFAULT_CONCURRENCY = 2
_UNFINISHED = ("queued", "running")


class JobRunner:
    """Register, run and announce background jobs for one process."""

    def __init__(
        self, *, repos: Any, agent: Any, bus: Any, push_web: WebPush | None = None,
        max_concurrent: int = _DEFAULT_CONCURRENCY,
    ):
        self._repos = repos
        self._agent = agent
        self._bus = bus
        self._push_web = push_web
        self._slots = asyncio.Semaphore(max(1, max_concurrent))
        self._tasks: dict[str, asyncio.Task] = {}

    async def submit(
        self, *, user_id: str, kind: str, run: JobWork, agent_id: str = "",
        label: str = "", origin_channel: str = "", origin_chat_id: str = "",
        params: dict[str, Any] | None = None, timeout_s: int = _DEFAULT_TIMEOUT_S,
    ) -> str:
        """Register the job, start it detached and return its handle."""
        job_id = f"{_prefix(kind)}_{uuid.uuid4().hex[:6]}"
        await self._repos.jobs.create(
            user_id, job_id=job_id, kind=kind, agent_id=agent_id, label=label,
            origin_channel=origin_channel, origin_chat_id=origin_chat_id,
            params=params, timeout_s=timeout_s,
        )
        task = asyncio.create_task(
            self._execute(job_id, user_id, run, timeout_s)
        )
        self._tasks[job_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(job_id, None))
        logger.info("Job {} iniciado ({}): {}", job_id, kind, label or "-")
        return job_id

    async def attach_process(
        self, user_id: str, job_id: str, *, pid: int, log_path: str = "",
    ) -> None:
        """Record the child the work spawned, so a reaper can find it later."""
        await self._repos.jobs.attach_process(
            user_id, job_id, pid=pid, log_path=log_path,
        )

    async def cancel(self, user_id: str, job_id: str) -> bool:
        job = await self._repos.jobs.get(user_id, job_id)
        if not job or job.get("state") not in _UNFINISHED:
            return False
        _kill_orphan(job.get("pid"))
        task = self._tasks.get(job_id)
        if task:
            task.cancel()
            return True
        await self._repos.jobs.finish(
            user_id, job_id, state="interrupted", error="Cancelado.",
        )
        return True

    async def reap_orphans(self) -> int:
        """Close out jobs a process restart left behind, and kill their children.

        The rows survive the restart and the tasks do not, so a job would sit in
        ``running`` forever and keep its demand from ever being retried. The child
        survives too — it runs in its own session — and would go on editing a
        repository nobody is watching.
        """
        reaped = 0
        for job in await self._repos.jobs.list_unfinished():
            if job.get("job_id") in self._tasks:
                continue
            _kill_orphan(job.get("pid"))
            await self._repos.jobs.finish(
                job["user_id"], job["job_id"], state="interrupted",
                error="O gateway reiniciou enquanto a tarefa rodava.",
            )
            reaped += 1
        if reaped:
            logger.warning("Jobs: {} tarefa(s) interrompida(s) por reinício", reaped)
        return reaped

    async def _execute(
        self, job_id: str, user_id: str, run: JobWork, timeout_s: int,
    ) -> None:
        try:
            async with self._slots:
                await self._repos.jobs.start(user_id, job_id)
                state, summary = await self._work(job_id, run, timeout_s)
        except asyncio.CancelledError:
            await self._repos.jobs.finish(
                user_id, job_id, state="interrupted",
                error="A tarefa foi cancelada antes de terminar.",
            )
            raise
        await self._repos.jobs.finish(
            user_id, job_id, state=state,
            result=summary if state == "done" else "",
            error="" if state == "done" else summary,
        )
        await self._wake(user_id, job_id, state, summary)

    @staticmethod
    async def _work(job_id: str, run: JobWork, timeout_s: int) -> tuple[str, str]:
        try:
            return "done", await asyncio.wait_for(run(job_id), timeout=timeout_s)
        except asyncio.TimeoutError:
            return "timeout", (
                f"A tarefa passou do teto de {timeout_s}s e foi interrompida. "
                "O que já havia sido feito continua onde estava."
            )
        except Exception as e:
            logger.exception("Job {} falhou: {}", job_id, e)
            return "failed", f"A tarefa falhou: {e}"

    async def _wake(self, user_id: str, job_id: str, state: str, summary: str) -> None:
        """Turn the conclusion into a new turn in the session that asked."""
        job = await self._repos.jobs.get(user_id, job_id)
        if not job:
            return
        await resume_conversation(
            agent=self._agent, bus=self._bus, repos=self._repos,
            push_web=self._push_web,
            user_id=user_id, agent_id=job.get("agent_id") or "",
            origin_channel=job.get("origin_channel") or "",
            origin_chat_id=job.get("origin_chat_id") or "",
            message=_wake_prompt(job, state, summary),
            ref=job_id,
            audit_event="job.run",
            audit_detail={
                "job_id": job.get("job_id", ""),
                "kind": job.get("kind", ""),
                "label": job.get("label", ""),
                "state": state,
            },
        )


def _prefix(kind: str) -> str:
    """Short, readable handle prefix — ``code_agent`` becomes ``code``."""
    letters = "".join(c for c in kind if c.isalnum())
    return (letters[:4] or "job").lower()


def _wake_prompt(job: dict[str, Any], state: str, summary: str) -> str:
    label = job.get("label") or job.get("kind") or "tarefa"
    return "\n\n".join([
        f"[sistema] A tarefa em segundo plano '{label}' (job "
        f"{job.get('job_id', '')}) terminou com estado '{state}'.",
        f"Resultado:\n{summary}",
        "Retome de onde parou usando o histórico desta conversa: execute os "
        "passos que ainda faltavam e feche o registro do que ficou combinado. "
        "Se o resultado acima mostra que a tarefa não cumpriu o objetivo, não "
        "siga adiante como se tivesse cumprido.",
    ])


def _kill_orphan(pid: Any) -> None:
    """Kill the group of a child left behind by a restart.

    Only when the pid is still its own group leader. Children are started with
    ``start_new_session=True``, so that is true for ours and false for a pid the
    system has since recycled — without the check, a stale row could kill an
    unrelated process.
    """
    try:
        target = int(pid)
    except (TypeError, ValueError):
        return
    if target <= 0:
        return
    try:
        if os.getpgid(target) != target:
            return
        os.killpg(target, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        return
