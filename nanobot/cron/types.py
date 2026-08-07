"""Cron types."""

from dataclasses import dataclass, field
from typing import Literal


@dataclass
class CronSchedule:
    """Schedule definition for a cron job.

    Kinds:
        at: one shot at ``at_ms``.
        every: repeat every ``every_ms``, counted from the previous run.
        interval: repeat every ``every_days`` calendar days at ``at_time``,
            counted from ``anchor_ms`` so the cadence never drifts. This is what
            "every 15 days at 9am" needs — cron cannot express it and ``every``
            has no time of day.
        cron: a cron expression, for calendar rules (weekdays, day of month).
    """
    kind: Literal["at", "every", "interval", "cron"]
    at_ms: int | None = None
    every_ms: int | None = None
    expr: str | None = None
    tz: str | None = None
    every_days: int | None = None
    at_time: str | None = None
    anchor_ms: int | None = None


@dataclass
class CronPayload:
    """What to do when the job runs."""
    kind: Literal["system_event", "agent_turn"] = "agent_turn"
    message: str = ""
    deliver: bool = False
    channel: str | None = None
    to: str | None = None


@dataclass
class CronJobState:
    """Runtime state of a job."""
    next_run_at_ms: int | None = None
    last_run_at_ms: int | None = None
    last_status: Literal["ok", "error", "skipped"] | None = None
    last_error: str | None = None


@dataclass
class CronJob:
    """A scheduled job."""
    id: str
    name: str
    enabled: bool = True
    schedule: CronSchedule = field(default_factory=lambda: CronSchedule(kind="every"))
    payload: CronPayload = field(default_factory=CronPayload)
    state: CronJobState = field(default_factory=CronJobState)
    created_at_ms: int = 0
    updated_at_ms: int = 0
    delete_after_run: bool = False
    user_id: str = ""
    agent_id: str = ""


@dataclass
class CronStore:
    """Persistent store for cron jobs."""
    version: int = 1
    jobs: list[CronJob] = field(default_factory=list)
