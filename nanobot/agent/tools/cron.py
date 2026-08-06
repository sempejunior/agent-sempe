"""Cron tool for scheduling reminders and tasks."""

from typing import Any

from nanobot.agent.tools.base import Tool
from nanobot.cron.service import CronService
from nanobot.cron.types import CronSchedule


class CronTool(Tool):
    """Tool to schedule reminders and recurring tasks."""

    def __init__(self, cron_service: CronService):
        self._cron = cron_service
        self._channel = ""
        self._chat_id = ""
        self._user_id = ""
        self._agent_id = ""

    def set_context(self, channel: str, chat_id: str, user_id: str = "", agent_id: str = "") -> None:
        """Set the current session context for delivery."""
        self._channel = channel
        self._chat_id = chat_id
        self._user_id = user_id
        self._agent_id = agent_id

    @property
    def name(self) -> str:
        return "cron"

    @property
    def description(self) -> str:
        return (
            "Agenda lembretes e tarefas recorrentes. Ações: add, list, remove. "
            "Para uma cadência em dias com hora fixa (ex.: a cada 15 dias às 9h) use "
            "every_days + at_time. Para regra de calendário (dias da semana, dia do "
            "mês) use cron_expr. Sempre informe tz quando houver hora envolvida."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "list", "remove"],
                    "description": "Action to perform"
                },
                "message": {
                    "type": "string",
                    "description": "Reminder message (for add)"
                },
                "every_seconds": {
                    "type": "integer",
                    "description": "Intervalo em segundos, sem hora fixa. "
                                   "Prefira every_days quando o usuário pensar em dias."
                },
                "every_days": {
                    "type": "integer",
                    "description": "Cadência em dias corridos contada a partir de hoje "
                                   "(ex.: 15 para 'a cada 15 dias', 7 para semanal). "
                                   "Combine com at_time."
                },
                "at_time": {
                    "type": "string",
                    "description": "Hora do disparo em HH:MM, para every_days."
                },
                "cron_expr": {
                    "type": "string",
                    "description": "Cron expression like '0 9 * * *' (for scheduled tasks)"
                },
                "tz": {
                    "type": "string",
                    "description": "IANA timezone for cron expressions (e.g. 'America/Vancouver')"
                },
                "at": {
                    "type": "string",
                    "description": "ISO datetime for one-time execution (e.g. '2026-02-12T10:30:00')"
                },
                "job_id": {
                    "type": "string",
                    "description": "Job ID (for remove)"
                }
            },
            "required": ["action"]
        }

    async def execute(
        self,
        action: str,
        message: str = "",
        every_seconds: int | None = None,
        every_days: int | None = None,
        at_time: str | None = None,
        cron_expr: str | None = None,
        tz: str | None = None,
        at: str | None = None,
        job_id: str | None = None,
        **kwargs: Any
    ) -> str:
        if action == "add":
            return await self._add_job(
                message, every_seconds, every_days, at_time, cron_expr, tz, at,
            )
        elif action == "list":
            return await self._list_jobs()
        elif action == "remove":
            return await self._remove_job(job_id)
        return f"Unknown action: {action}"

    async def _add_job(
        self,
        message: str,
        every_seconds: int | None,
        every_days: int | None,
        at_time: str | None,
        cron_expr: str | None,
        tz: str | None,
        at: str | None,
    ) -> str:
        if not message:
            return "Error: message is required for add"
        if not self._channel or not self._chat_id:
            return "Error: no session context (channel/chat_id)"
        if tz and not (cron_expr or every_days):
            return "Error: tz can only be used with cron_expr or every_days"
        if tz:
            from zoneinfo import ZoneInfo
            try:
                ZoneInfo(tz)
            except (KeyError, Exception):
                return f"Error: unknown timezone '{tz}'"

        delete_after = False
        if every_days:
            schedule = CronSchedule(kind="interval", every_days=every_days,
                                    at_time=at_time, tz=tz)
        elif every_seconds:
            schedule = CronSchedule(kind="every", every_ms=every_seconds * 1000)
        elif cron_expr:
            schedule = CronSchedule(kind="cron", expr=cron_expr, tz=tz)
        elif at:
            from datetime import datetime
            dt = datetime.fromisoformat(at)
            at_ms = int(dt.timestamp() * 1000)
            schedule = CronSchedule(kind="at", at_ms=at_ms)
            delete_after = True
        else:
            return ("Error: informe every_days (+ at_time), every_seconds, "
                    "cron_expr ou at")

        from nanobot.cron.describe import describe_schedule
        job = await self._cron.add_job(
            name=message[:30],
            schedule=schedule,
            message=message,
            deliver=True,
            channel=self._channel,
            to=self._chat_id,
            delete_after_run=delete_after,
            user_id=self._user_id,
            agent_id=self._agent_id,
        )
        return (f"Agendamento criado: '{job.name}' — "
                f"{describe_schedule(job.schedule)} (id: {job.id})")

    async def _list_jobs(self) -> str:
        jobs = await self._cron.list_jobs(user_id=self._user_id, agent_id=self._agent_id or None)
        if not jobs:
            return "No scheduled jobs."
        from nanobot.cron.describe import describe_schedule
        lines = [f"- {j.name} — {describe_schedule(j.schedule)} (id: {j.id})" for j in jobs]
        return "Agendamentos:\n" + "\n".join(lines)

    async def _remove_job(self, job_id: str | None) -> str:
        if not job_id:
            return "Error: job_id is required for remove"
        if await self._cron.remove_job(job_id, user_id=self._user_id, agent_id=self._agent_id or None):
            return f"Removed job {job_id}"
        return f"Job {job_id} not found"
