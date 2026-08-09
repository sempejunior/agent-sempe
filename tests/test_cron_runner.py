"""Testes do que acontece quando uma rotina dispara: auditoria e entrega."""

from unittest.mock import AsyncMock

import pytest

from nanobot.cron.runner import build_cron_callback, build_job_timeout
from nanobot.cron.types import CronJob, CronPayload


def _job(**payload) -> CronJob:
    return CronJob(
        id="j1", name="Rotina", user_id="u1", agent_id="a1",
        payload=CronPayload(message="faz", **payload),
    )


@pytest.fixture
def agent():
    loop = AsyncMock()
    loop.process_direct.return_value = "resultado da rotina"
    return loop


@pytest.fixture
def repos():
    factory = AsyncMock()
    factory.audit = AsyncMock()
    factory.users.get_by_id.return_value = {"limits": {"max_job_duration_s": 120}}
    return factory


async def test_the_turn_runs_with_the_owner_identity(agent, repos):
    callback = build_cron_callback(agent=agent, bus=AsyncMock(), repos=repos)

    await callback(_job())

    kwargs = agent.process_direct.await_args.kwargs
    assert kwargs["user_id"] == "u1"
    assert kwargs["agent_id"] == "a1"
    assert kwargs["channel"] == "system"


async def test_every_run_leaves_an_audit_row(agent, repos):
    callback = build_cron_callback(agent=agent, bus=AsyncMock(), repos=repos)

    await callback(_job())

    user_id, event, detail = repos.audit.log.await_args.args
    assert (user_id, event) == ("u1", "cron.run")
    assert detail["job_id"] == "j1"
    assert detail["chars"] == len("resultado da rotina")


async def test_a_failing_audit_does_not_break_the_run(agent, repos):
    repos.audit.log.side_effect = RuntimeError("banco fora")
    callback = build_cron_callback(agent=agent, bus=AsyncMock(), repos=repos)

    result = await callback(_job())

    assert result == "resultado da rotina"


async def test_without_deliver_nothing_is_published(agent, repos):
    bus = AsyncMock()
    callback = build_cron_callback(agent=agent, bus=bus, repos=repos)

    await callback(_job(deliver=False))

    bus.publish_outbound.assert_not_awaited()


async def test_deliver_to_a_channel_publishes_on_the_bus(agent, repos):
    bus = AsyncMock()
    callback = build_cron_callback(agent=agent, bus=bus, repos=repos)

    await callback(_job(deliver=True, channel="telegram", to="123"))

    message = bus.publish_outbound.await_args.args[0]
    assert message.channel == "telegram"
    assert message.chat_id == "123"
    assert message.content == "resultado da rotina"
    assert message.metadata["_owner_id"] == "u1"


async def test_deliver_to_the_web_uses_the_socket_push(agent, repos):
    pushed = []

    async def push_web(*, user_id, session_key, ref, text):
        pushed.append((user_id, session_key, ref, text))

    callback = build_cron_callback(agent=agent, bus=AsyncMock(), repos=repos,
                                  push_web=push_web)

    await callback(_job(deliver=True, channel="web"))

    assert pushed == [("u1", "web:web:u1", "j1", "resultado da rotina")]


async def test_an_empty_result_is_not_delivered(agent, repos):
    agent.process_direct.return_value = "   "
    bus = AsyncMock()
    callback = build_cron_callback(agent=agent, bus=bus, repos=repos)

    await callback(_job(deliver=True, channel="telegram", to="123"))

    bus.publish_outbound.assert_not_awaited()


async def test_a_legacy_job_without_owner_keeps_the_cli_routing(agent):
    callback = build_cron_callback(agent=agent, bus=AsyncMock(), repos=None)
    job = CronJob(id="j2", name="Legado",
                  payload=CronPayload(message="faz", channel="cli", to="direct"))

    await callback(job)

    kwargs = agent.process_direct.await_args.kwargs
    assert kwargs["channel"] == "cli"
    assert "user_id" not in kwargs


async def test_the_timeout_comes_from_the_owner_limits(repos):
    resolve = build_job_timeout(repos)

    assert await resolve(_job()) == 120


async def test_a_missing_limit_falls_back_to_the_default(repos):
    repos.users.get_by_id.return_value = {"limits": {}}
    resolve = build_job_timeout(repos)

    assert await resolve(_job()) == 1800


async def test_a_broken_user_lookup_still_yields_a_ceiling(repos):
    repos.users.get_by_id.side_effect = RuntimeError("sem banco")
    resolve = build_job_timeout(repos)

    assert await resolve(_job()) == 1800
