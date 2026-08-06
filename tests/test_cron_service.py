import pytest

from nanobot.cron.service import CronService
from nanobot.cron.types import CronSchedule


async def test_add_job_rejects_unknown_timezone(tmp_path) -> None:
    service = CronService(tmp_path / "cron" / "jobs.json")

    with pytest.raises(ValueError, match="unknown timezone 'America/Vancovuer'"):
        await service.add_job(
            name="tz typo",
            schedule=CronSchedule(kind="cron", expr="0 9 * * *", tz="America/Vancovuer"),
            message="hello",
        )

    assert await service.list_jobs(include_disabled=True) == []


async def test_add_job_accepts_valid_timezone(tmp_path) -> None:
    service = CronService(tmp_path / "cron" / "jobs.json")

    job = await service.add_job(
        name="tz ok",
        schedule=CronSchedule(kind="cron", expr="0 9 * * *", tz="America/Vancouver"),
        message="hello",
    )

    assert job.schedule.tz == "America/Vancouver"
    assert job.state.next_run_at_ms is not None


class _FakeRepo:
    """Repositório de cron em memória, com o mínimo que o serviço usa."""

    def __init__(self, rows: list[dict]):
        self.rows = {r["job_id"]: r for r in rows}
        self.state_writes: list[tuple[str, dict]] = []

    async def get_due_jobs(self, now_ms: int) -> list[dict]:
        return [
            r for r in self.rows.values()
            if r.get("enabled") and r.get("next_run_at_ms")
            and r["next_run_at_ms"] <= now_ms
        ]

    async def update_job_state(self, job_id: str, state: dict, *, user_id=None) -> None:
        self.rows[job_id].update(state)
        self.state_writes.append((job_id, dict(state)))

    async def delete_job(self, user_id, job_id, agent_id=None) -> bool:
        return self.rows.pop(job_id, None) is not None


def _row(job_id: str, every_ms: int = 60_000) -> dict:
    return {
        "user_id": "u1", "agent_id": "a1", "job_id": job_id, "name": job_id,
        "enabled": 1,
        "schedule": {"kind": "every", "every_ms": every_ms},
        "payload": {"kind": "agent_turn", "message": "faz", "deliver": False},
        "next_run_at_ms": 1,
        "last_run_at_ms": None, "last_status": None, "last_error": None,
        "delete_after_run": False,
    }


async def test_due_jobs_run_concurrently(tmp_path) -> None:
    import asyncio

    repo = _FakeRepo([_row("a"), _row("b")])
    running: list[str] = []
    peak = 0

    async def on_job(job):
        nonlocal peak
        running.append(job.id)
        peak = max(peak, len(running))
        await asyncio.sleep(0.2)
        running.remove(job.id)

    service = CronService(cron_repo=repo, on_job=on_job)
    service._running = True
    await service._on_timer()
    await asyncio.gather(*list(service._inflight.values()))

    assert peak == 2, "os dois jobs deveriam rodar ao mesmo tempo"


async def test_the_timer_does_not_refire_a_reserved_job(tmp_path) -> None:
    """Sem reservar antes de despachar, o job segue 'due' e o timer entra em loop."""
    import asyncio

    repo = _FakeRepo([_row("a")])
    calls = 0

    async def on_job(job):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.2)

    service = CronService(cron_repo=repo, on_job=on_job)
    service._running = True
    await service._on_timer()
    await service._on_timer()
    await service._on_timer()
    await asyncio.gather(*list(service._inflight.values()))

    assert calls == 1
    assert repo.rows["a"]["next_run_at_ms"] > 1


async def test_a_reserved_run_keeps_the_cadence(tmp_path) -> None:
    """O próximo disparo não pode ser recalculado do fim de uma execução lenta."""
    import asyncio

    repo = _FakeRepo([_row("a", every_ms=60_000)])

    async def on_job(job):
        await asyncio.sleep(0.3)

    service = CronService(cron_repo=repo, on_job=on_job)
    service._running = True
    await service._on_timer()
    reserved = repo.rows["a"]["next_run_at_ms"]
    await asyncio.gather(*list(service._inflight.values()))

    assert repo.rows["a"]["next_run_at_ms"] == reserved


async def test_a_job_that_exceeds_its_timeout_is_marked_error(tmp_path) -> None:
    import asyncio

    repo = _FakeRepo([_row("a")])

    async def on_job(job):
        await asyncio.sleep(5)

    async def job_timeout(job):
        return 0.1

    service = CronService(cron_repo=repo, on_job=on_job, job_timeout=job_timeout)
    service._running = True
    await service._on_timer()
    await asyncio.gather(*list(service._inflight.values()))

    assert repo.rows["a"]["last_status"] == "error"
    assert "interrompido" in repo.rows["a"]["last_error"]


async def test_a_slow_job_does_not_block_the_next_tick(tmp_path) -> None:
    import asyncio

    repo = _FakeRepo([_row("a"), _row("b")])
    started: list[str] = []

    async def on_job(job):
        started.append(job.id)
        await asyncio.sleep(0.3)

    service = CronService(cron_repo=repo, on_job=on_job)
    service._running = True
    await service._on_timer()
    await asyncio.sleep(0)

    assert set(started) == {"a", "b"}, "o tick não deveria esperar o primeiro job"
    assert all(not t.done() for t in service._inflight.values())
    await asyncio.gather(*list(service._inflight.values()))


async def test_stop_cancels_jobs_in_flight(tmp_path) -> None:
    import asyncio

    repo = _FakeRepo([_row("a")])
    finished = False

    async def on_job(job):
        nonlocal finished
        await asyncio.sleep(5)
        finished = True

    service = CronService(cron_repo=repo, on_job=on_job)
    service._running = True
    await service._on_timer()
    tasks = list(service._inflight.values())
    service.stop()
    await asyncio.gather(*tasks, return_exceptions=True)

    assert not finished
    assert not service._inflight
