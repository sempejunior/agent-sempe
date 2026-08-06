"""What happens when a routine fires — one implementation, both entry points.

The gateway (``web/server.py``) and the CLI (``cli/commands.py``) both wire a
callback into ``CronService.on_job``, and they had drifted into two copies of the
same routing. This module owns it: run the turn, leave an audit trail, and deliver
the result when the routine asked for it.

The turn is always persisted in the ``system:*`` session, which stays the source
of truth. The audit row and the delivery are what make a run findable by someone
who was not watching.
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from loguru import logger

from nanobot.cron.types import CronJob

_DEFAULT_JOB_TIMEOUT_S = 1800

WebPush = Callable[[str, str, str], Awaitable[None]]


def build_job_timeout(repos: Any | None) -> Callable[[CronJob], Awaitable[int | None]]:
    """Per-job ceiling, read from the owner's limits with a sane fallback."""

    async def job_timeout(job: CronJob) -> int | None:
        if not repos or not job.user_id:
            return _DEFAULT_JOB_TIMEOUT_S
        try:
            owner = await repos.users.get_by_id(job.user_id)
        except Exception:
            return _DEFAULT_JOB_TIMEOUT_S
        limits = (owner or {}).get("limits", {}) or {}
        return limits.get("max_job_duration_s") or _DEFAULT_JOB_TIMEOUT_S

    return job_timeout


def build_cron_callback(
    *,
    agent: Any,
    bus: Any,
    repos: Any | None = None,
    push_web: WebPush | None = None,
) -> Callable[[CronJob], Awaitable[str | None]]:
    """Build the ``on_job`` callback for a CronService."""

    async def on_cron_job(job: CronJob) -> str | None:
        response = await _run_turn(job)
        text = _text_of(response)
        await _audit(job, text)
        await _deliver(job, text)
        return response

    async def _run_turn(job: CronJob) -> Any:
        if job.user_id:
            channel = job.payload.channel or "system"
            to = job.payload.to or f"web:{job.user_id}"
            return await agent.process_direct(
                job.payload.message,
                session_key=f"cron:{job.id}",
                channel="system",
                chat_id=f"{channel}:{to}",
                user_id=job.user_id,
                agent_id=job.agent_id or None,
            )
        return await agent.process_direct(
            job.payload.message,
            session_key=f"cron:{job.id}",
            channel=job.payload.channel or "cli",
            chat_id=job.payload.to or "direct",
        )

    async def _audit(job: CronJob, text: str) -> None:
        if not repos or not getattr(repos, "audit", None) or not job.user_id:
            return
        try:
            await repos.audit.log(job.user_id, "cron.run", {
                "job_id": job.id,
                "name": job.name,
                "agent_id": job.agent_id or "",
                "chars": len(text),
            })
        except Exception as e:
            logger.warning("Cron: falha ao auditar a rotina '{}': {}", job.name, e)

    async def _deliver(job: CronJob, text: str) -> None:
        if not job.payload.deliver or not text.strip():
            return
        channel = job.payload.channel or ""
        if (not channel or channel == "web") and job.user_id:
            if push_web:
                await push_web(job.user_id, job.id, text)
            return
        if not channel or not job.payload.to:
            return
        from nanobot.bus.events import OutboundMessage
        await bus.publish_outbound(OutboundMessage(
            channel=channel,
            chat_id=job.payload.to,
            content=text,
            metadata={"_owner_id": job.user_id, "_agent_id": job.agent_id or ""},
        ))

    return on_cron_job


def _text_of(response: Any) -> str:
    """The delivered text, whether the loop returned a message or a string."""
    content = getattr(response, "content", None)
    if content:
        return str(content)
    if response is None:
        return ""
    if isinstance(response, (dict, list)):
        return json.dumps(response, ensure_ascii=False)
    return str(response)
