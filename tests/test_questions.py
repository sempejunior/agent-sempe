"""Testes do registro de pendências e da retomada quando uma pessoa responde.

A distinção que os testes travam: esperar não é falhar. Uma demanda em espera não
pode ser reservada de novo, e responder tem que acordar a conversa que travou —
não só gravar uma linha no banco.
"""

import asyncio
from unittest.mock import AsyncMock

import pytest

from nanobot.agent.tools.ask_human import AskHumanTool
from nanobot.db.sqlite.connection import create_database
from nanobot.db.sqlite.question_repo import SQLiteQuestionRepository
from nanobot.db.sqlite.work_item_repo import SQLiteWorkItemRepository
from nanobot.questions.service import QuestionService


@pytest.fixture
async def db(tmp_path):
    conn = await create_database(tmp_path / "test.db")
    await conn.execute(
        "INSERT INTO users (user_id, display_name) VALUES ('u1', 'Teste')"
    )
    await conn.commit()
    yield conn
    await conn.close()


@pytest.fixture
def repo(db):
    return SQLiteQuestionRepository(db)


@pytest.fixture
def ledger(db):
    return SQLiteWorkItemRepository(db)


@pytest.fixture
def tool(repo):
    instance = AskHumanTool(user_id="u1", question_repo=repo, agent_id="a1")
    instance.set_origin(channel="web", chat_id="abc123", user_id="u1", agent_id="a1")
    return instance


async def _settle_resumes(service) -> None:
    """A retomada roda solta para não segurar quem respondeu; o teste espera."""
    await asyncio.gather(*service._resumes, return_exceptions=True)


async def test_asking_records_the_question_with_its_subject(tool, repo):
    out = await tool.execute(
        question="o campo aceita nulo?",
        subject="Bug #41234 cadastro em massa",
        subject_url="https://dev.azure.com/x/41234",
        subject_ref="azure#41234",
        asked_where="comentário na demanda",
    )

    assert "Registrado" in out
    rows = await repo.list_questions("u1")
    assert len(rows) == 1
    assert rows[0]["question"] == "o campo aceita nulo?"
    assert rows[0]["subject_url"] == "https://dev.azure.com/x/41234"
    assert rows[0]["origin_channel"] == "web"
    assert rows[0]["origin_chat_id"] == "abc123"


async def test_asking_the_same_thing_twice_does_not_duplicate(tool, repo):
    """Uma rotina que varre o mesmo board toda noite não pode encher a caixa."""
    args = {"question": "o campo aceita nulo?", "subject_ref": "azure#41234"}
    first = await tool.execute(**args)
    second = await tool.execute(**args)

    assert "Registrado" in first
    assert "já estava em aberto" in second
    assert len(await repo.list_questions("u1")) == 1


async def test_the_same_question_about_another_subject_is_another_pendency(tool, repo):
    await tool.execute(question="aceita nulo?", subject_ref="azure#1")
    await tool.execute(question="aceita nulo?", subject_ref="azure#2")

    assert len(await repo.list_questions("u1")) == 2


async def test_answering_closes_it_and_it_leaves_the_open_list(tool, repo):
    await tool.execute(question="aceita nulo?", subject_ref="azure#41234")
    question_id = (await repo.list_questions("u1"))[0]["id"]

    out = await tool.execute(action="answer", question_id=question_id,
                             answer="aceita, trata como zero")

    assert "fechada" in out
    assert await repo.list_questions("u1", state="open") == []
    answered = await repo.list_questions("u1", state="answered")
    assert answered[0]["answer"] == "aceita, trata como zero"
    assert answered[0]["answered_by"] == "agent"


async def test_answering_twice_is_refused(tool, repo):
    await tool.execute(question="aceita nulo?", subject_ref="azure#1")
    question_id = (await repo.list_questions("u1"))[0]["id"]
    await tool.execute(action="answer", question_id=question_id, answer="sim")

    out = await tool.execute(action="answer", question_id=question_id, answer="não")

    assert out.startswith("Error")


async def test_a_question_without_text_is_refused(tool):
    assert (await tool.execute(question="   ")).startswith("Error")


async def test_cancel_removes_it_from_the_inbox(tool, repo):
    await tool.execute(question="aceita nulo?", subject_ref="azure#1")
    question_id = (await repo.list_questions("u1"))[0]["id"]

    assert "descartada" in await tool.execute(action="cancel", question_id=question_id)
    assert await repo.list_questions("u1", state="open") == []


async def test_count_open_ignores_what_is_closed(tool, repo):
    await tool.execute(question="uma?", subject_ref="azure#1")
    await tool.execute(question="duas?", subject_ref="azure#2")
    question_id = (await repo.list_questions("u1"))[0]["id"]
    await tool.execute(action="answer", question_id=question_id, answer="ok")

    assert await repo.count_open("u1") == 1


async def test_a_waiting_item_is_not_claimed_again(ledger):
    """É isto que impede a varredura de amanhã de re-trabalhar o que espera gente."""
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.wait("u1", source="azure", external_id="41234",
                      note="aguarda a regra de nulo")

    result = await ledger.claim("u1", source="azure", external_id="41234",
                               stale_after_s=0)

    assert result["claimed"] is False
    assert "aguardando a resposta de uma pessoa" in result["reason"]


async def test_a_failed_item_is_still_retried(ledger):
    """Falha é o que a máquina pode tentar de novo — a diferença tem que sobreviver."""
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.fail("u1", source="azure", external_id="41234", note="teste vermelho")

    result = await ledger.claim("u1", source="azure", external_id="41234")

    assert result["claimed"] is True


async def test_resume_puts_a_waiting_item_back_to_work(ledger):
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.wait("u1", source="azure", external_id="41234", note="aguarda regra")

    assert await ledger.resume("u1", source="azure", external_id="41234") is True

    item = await ledger.get("u1", source="azure", external_id="41234")
    assert item["state"] == "claimed"
    assert item["attempts"] == 2


async def test_resume_only_works_on_something_that_was_waiting(ledger):
    await ledger.claim("u1", source="azure", external_id="41234")

    assert await ledger.resume("u1", source="azure", external_id="41234") is False


async def test_answering_as_a_human_resumes_the_origin_conversation(repo, tool):
    """A resposta não é uma linha no banco: é um turno na conversa que travou."""
    await tool.execute(question="aceita nulo?", subject="Bug #41234",
                       subject_url="https://x/41234", subject_ref="azure#41234")
    question_id = (await repo.list_questions("u1"))[0]["id"]

    agent = AsyncMock()
    agent.process_direct.return_value = "PR aberto: /merge_requests/88"
    repos = AsyncMock()
    repos.questions = repo
    pushed = []

    async def push_web(*, user_id, session_key, ref, text):
        pushed.append((user_id, session_key, text))

    service = QuestionService(repos=repos, agent=agent, bus=AsyncMock(),
                             push_web=push_web)
    row = await service.answer_from_human("u1", question_id, "aceita, trata como zero")
    await _settle_resumes(service)

    assert row["answered_by"] == "human"
    kwargs = agent.process_direct.await_args.kwargs
    assert kwargs["channel"] == "system"
    assert kwargs["chat_id"] == "web:abc123"
    assert kwargs["session_key"] == "web:abc123"
    prompt = agent.process_direct.await_args.args[0]
    assert "aceita, trata como zero" in prompt
    assert "decida, declare a premissa" in prompt.lower()
    assert "nunca a mesma pergunta com outras palavras" in prompt
    assert pushed == [("u1", "web:abc123", "PR aberto: /merge_requests/88")]


async def test_answering_something_already_closed_resumes_nothing(repo, tool):
    await tool.execute(question="aceita nulo?", subject_ref="azure#1")
    question_id = (await repo.list_questions("u1"))[0]["id"]
    await tool.execute(action="answer", question_id=question_id, answer="ja respondi")

    agent = AsyncMock()
    repos = AsyncMock()
    repos.questions = repo
    service = QuestionService(repos=repos, agent=agent, bus=AsyncMock())

    assert await service.answer_from_human("u1", question_id, "de novo") is None
    await _settle_resumes(service)
    agent.process_direct.assert_not_awaited()


async def test_two_people_answering_at_once_resume_the_turn_once(repo, tool):
    await tool.execute(question="aceita nulo?", subject_ref="azure#1")
    question_id = (await repo.list_questions("u1"))[0]["id"]

    agent = AsyncMock()
    agent.process_direct.return_value = "ok"
    repos = AsyncMock()
    repos.questions = repo
    service = QuestionService(repos=repos, agent=agent, bus=AsyncMock())

    results = await asyncio.gather(
        service.answer_from_human("u1", question_id, "sim"),
        service.answer_from_human("u1", question_id, "nao"),
    )

    assert len([r for r in results if r]) == 1
    await _settle_resumes(service)
    assert agent.process_direct.await_count == 1


async def test_latitude_in_the_answer_stops_the_question_loop(repo, tool):
    """Quem respondeu 'use seu julgamento' delegou a decisão, não pediu outra pergunta.

    Sem isto o agente reperguntava a mesma coisa com outras palavras a cada
    resposta, e a pessoa que delegou virava a gargalo do trabalho que delegou.
    """
    await tool.execute(question="qual o layout?", subject_ref="azure#1")
    question_id = (await repo.list_questions("u1"))[0]["id"]
    agent = AsyncMock()
    agent.process_direct.return_value = "ok"
    repos = AsyncMock()
    repos.questions = repo
    service = QuestionService(repos=repos, agent=agent, bus=AsyncMock())

    await service.answer_from_human("u1", question_id, "tenha liberdade criativa")
    await _settle_resumes(service)

    prompt = agent.process_direct.await_args.args[0]
    assert "liberdade criativa" in prompt
    assert "a decisão passou a ser sua" in prompt
    assert "devolver o trabalho para quem já o delegou" in prompt


async def test_answering_returns_before_the_agent_turn_finishes(repo, tool):
    """Quem responde está olhando um botão: o turno não pode segurar o HTTP.

    É o mesmo erro que o job em segundo plano existe para evitar — cometido no
    caminho da resposta, o painel congela em 'Enviando...' por minutos.
    """
    await tool.execute(question="qual o layout?", subject_ref="azure#1")
    question_id = (await repo.list_questions("u1"))[0]["id"]
    liberado = asyncio.Event()

    async def turno_lento(*_a, **_k):
        await liberado.wait()
        return "ok"

    agent = AsyncMock()
    agent.process_direct.side_effect = turno_lento
    repos = AsyncMock()
    repos.questions = repo
    service = QuestionService(repos=repos, agent=agent, bus=AsyncMock())

    row = await asyncio.wait_for(
        service.answer_from_human("u1", question_id, "pode decidir"), timeout=2,
    )

    assert row["state"] == "answered"
    liberado.set()
    await asyncio.gather(*service._resumes, return_exceptions=True)
    agent.process_direct.assert_awaited_once()
