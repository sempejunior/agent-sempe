"""Testes do primitivo de tarefas em segundo plano.

O ponto do módulo é a retomada: a conclusão não é um valor de retorno, é um turno
novo na sessão que pediu o trabalho. É isso que os testes travam.
"""

import asyncio
from unittest.mock import AsyncMock

import pytest

from nanobot.db.sqlite.connection import create_database
from nanobot.db.sqlite.job_repo import SQLiteJobRepository
from nanobot.jobs.runner import JobRunner


@pytest.fixture
async def repo(tmp_path):
    db = await create_database(tmp_path / "test.db")
    await db.execute(
        "INSERT INTO users (user_id, display_name) VALUES ('u1', 'Teste')"
    )
    await db.commit()
    yield SQLiteJobRepository(db)
    await db.close()


@pytest.fixture
def repos(repo):
    factory = AsyncMock()
    factory.jobs = repo
    factory.audit = AsyncMock()
    return factory


@pytest.fixture
def agent():
    loop = AsyncMock()
    loop.process_direct.return_value = "PR aberto: /merge_requests/88"
    return loop


@pytest.fixture
def runner(repos, agent):
    return JobRunner(repos=repos, agent=agent, bus=AsyncMock())


async def _settle(runner, job_id):
    """Espera a task do job, que roda solta de propósito."""
    task = runner._tasks.get(job_id)
    if task:
        await asyncio.gather(task, return_exceptions=True)


async def test_submit_returns_a_handle_without_waiting(runner, repo):
    started = asyncio.Event()
    release = asyncio.Event()

    async def work(job_id):
        started.set()
        await release.wait()
        return "terminei"

    job_id = await runner.submit(user_id="u1", kind="code_agent", run=work)

    await started.wait()
    assert job_id.startswith("code_")
    assert (await repo.get("u1", job_id))["state"] == "running"

    release.set()
    await _settle(runner, job_id)


async def test_a_finished_job_wakes_a_turn_in_the_origin_session(runner, repo, agent):
    async def work(job_id):
        return "diff em 3 arquivos, exit 0"

    job_id = await runner.submit(
        user_id="u1", kind="code_agent", run=work, agent_id="a1",
        origin_channel="web", origin_chat_id="abc123",
    )
    await _settle(runner, job_id)

    agent.process_direct.assert_awaited_once()
    kwargs = agent.process_direct.await_args.kwargs
    assert kwargs["channel"] == "system"
    assert kwargs["chat_id"] == "web:abc123"
    assert kwargs["session_key"] == "web:abc123"
    assert kwargs["user_id"] == "u1"
    assert kwargs["agent_id"] == "a1"
    assert "diff em 3 arquivos" in agent.process_direct.await_args.args[0]


async def test_the_answer_of_the_resumed_turn_reaches_the_panel(repos, agent, repo):
    pushed = []

    async def push_web(*, user_id, session_key, ref, text):
        pushed.append((user_id, session_key, ref, text))

    runner = JobRunner(repos=repos, agent=agent, bus=AsyncMock(), push_web=push_web)
    job_id = await runner.submit(
        user_id="u1", kind="code_agent", run=AsyncMock(return_value="ok"),
        origin_channel="web", origin_chat_id="abc123",
    )
    await _settle(runner, job_id)

    assert pushed == [("u1", "web:abc123", job_id, "PR aberto: /merge_requests/88")]


async def test_a_job_from_a_chat_channel_is_delivered_on_that_channel(repos, agent):
    bus = AsyncMock()
    runner = JobRunner(repos=repos, agent=agent, bus=bus, push_web=AsyncMock())
    job_id = await runner.submit(
        user_id="u1", kind="code_agent", run=AsyncMock(return_value="ok"),
        origin_channel="telegram", origin_chat_id="555",
    )
    await _settle(runner, job_id)

    message = bus.publish_outbound.await_args.args[0]
    assert message.channel == "telegram"
    assert message.chat_id == "555"


async def test_a_routine_job_answers_in_the_panel_not_on_a_channel(repos, agent):
    """`system` é namespace de sessão, não canal de chat — senão a resposta se perde."""
    bus = AsyncMock()
    pushed = []

    async def push_web(**kwargs):
        pushed.append(kwargs["session_key"])

    runner = JobRunner(repos=repos, agent=agent, bus=bus, push_web=push_web)
    job_id = await runner.submit(
        user_id="u1", kind="code_agent", run=AsyncMock(return_value="ok"),
        origin_channel="system", origin_chat_id="web:u1",
    )
    await _settle(runner, job_id)

    assert pushed == ["system:web:u1"]
    bus.publish_outbound.assert_not_awaited()


async def test_a_job_that_raises_is_recorded_as_failed_and_still_wakes(runner, repo,
                                                                      agent):
    async def work(job_id):
        raise RuntimeError("a CLI não autenticou")

    job_id = await runner.submit(user_id="u1", kind="code_agent", run=work)
    await _settle(runner, job_id)

    job = await repo.get("u1", job_id)
    assert job["state"] == "failed"
    assert "não autenticou" in job["error"]
    assert "não cumpriu o objetivo" in agent.process_direct.await_args.args[0]


async def test_a_job_past_its_ceiling_is_recorded_as_timeout(runner, repo):
    async def work(job_id):
        await asyncio.sleep(30)
        return "nunca"

    job_id = await runner.submit(user_id="u1", kind="code_agent", run=work,
                                 timeout_s=1)
    await _settle(runner, job_id)

    job = await repo.get("u1", job_id)
    assert job["state"] == "timeout"
    assert "teto" in job["error"]


async def test_a_done_job_keeps_its_result_and_no_error(runner, repo):
    job_id = await runner.submit(user_id="u1", kind="code_agent",
                                 run=AsyncMock(return_value="tudo certo"))
    await _settle(runner, job_id)

    job = await repo.get("u1", job_id)
    assert job["state"] == "done"
    assert job["result"] == "tudo certo"
    assert job["error"] == ""


async def test_cancel_marks_the_job_interrupted(runner, repo, agent):
    release = asyncio.Event()
    started = asyncio.Event()

    async def work(job_id):
        started.set()
        await release.wait()
        return "nunca"

    job_id = await runner.submit(user_id="u1", kind="code_agent", run=work)
    await started.wait()

    assert await runner.cancel("u1", job_id) is True
    await _settle(runner, job_id)

    assert (await repo.get("u1", job_id))["state"] == "interrupted"
    agent.process_direct.assert_not_awaited()


async def test_cancelling_a_finished_job_is_refused(runner, repo):
    job_id = await runner.submit(user_id="u1", kind="code_agent",
                                 run=AsyncMock(return_value="ok"))
    await _settle(runner, job_id)

    assert await runner.cancel("u1", job_id) is False


async def test_a_job_left_running_by_a_restart_is_reaped(repos, repo, agent):
    """As linhas sobrevivem ao reinício e as tasks não: sem isso o item fica preso."""
    await repo.create("u1", job_id="code_orfao", kind="code_agent")
    await repo.start("u1", "code_orfao")

    fresh = JobRunner(repos=repos, agent=agent, bus=AsyncMock())
    assert await fresh.reap_orphans() == 1

    job = await repo.get("u1", "code_orfao")
    assert job["state"] == "interrupted"
    assert "reiniciou" in job["error"]


async def test_the_reaper_leaves_jobs_of_the_running_process_alone(runner, repo):
    release = asyncio.Event()

    async def work(job_id):
        await release.wait()
        return "ok"

    job_id = await runner.submit(user_id="u1", kind="code_agent", run=work)

    assert await runner.reap_orphans() == 0
    assert (await repo.get("u1", job_id))["state"] in ("queued", "running")

    release.set()
    await _settle(runner, job_id)


async def test_attach_process_records_the_child_for_the_reaper(runner, repo):
    job_id = await runner.submit(user_id="u1", kind="code_agent",
                                 run=AsyncMock(return_value="ok"))
    await runner.attach_process("u1", job_id, pid=4242, log_path="/tmp/x.log")
    await _settle(runner, job_id)

    job = await repo.get("u1", job_id)
    assert job["pid"] == 4242
    assert job["log_path"] == "/tmp/x.log"


async def test_the_reaper_kills_the_child_a_restart_left_running(repos, repo, agent):
    """O filho roda em sessão própria e sobrevive ao gateway — só o pid o alcança."""
    child = await asyncio.create_subprocess_exec(
        "sh", "-c", "sleep 30",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
    )
    await repo.create("u1", job_id="code_orfao", kind="code_agent")
    await repo.start("u1", "code_orfao", pid=child.pid)

    await JobRunner(repos=repos, agent=agent, bus=AsyncMock()).reap_orphans()

    await asyncio.wait_for(child.wait(), timeout=5)
    assert child.returncode is not None


async def test_the_reaper_never_kills_a_pid_that_is_not_its_own_group_leader(repos,
                                                                            repo,
                                                                            agent):
    """Pid reciclado por outro processo não pode ser morto por uma linha velha."""
    innocent = await asyncio.create_subprocess_exec(
        "sh", "-c", "sleep 5",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await repo.create("u1", job_id="code_velho", kind="code_agent")
    await repo.start("u1", "code_velho", pid=innocent.pid)

    await JobRunner(repos=repos, agent=agent, bus=AsyncMock()).reap_orphans()
    await asyncio.sleep(0.3)

    assert innocent.returncode is None
    innocent.kill()
    await innocent.wait()


async def test_a_late_timeout_cannot_overwrite_a_result_already_recorded(repo):
    await repo.create("u1", job_id="code_x", kind="code_agent")
    await repo.start("u1", "code_x")
    assert await repo.finish("u1", "code_x", state="done", result="pronto") is True

    assert await repo.finish("u1", "code_x", state="timeout", error="tarde") is False
    assert (await repo.get("u1", "code_x"))["result"] == "pronto"
