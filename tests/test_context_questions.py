"""As pendências no prompt: o agente tem que saber o que já perguntou.

Sem isso ele repergunta o que está em aberto e não reconhece a resposta quando ela
chega na própria conversa. Com isso mal feito, cem pendências custam cem linhas em
todo turno de toda conversa — por isso os testes de custo importam tanto quanto os
de conteúdo.
"""

from unittest.mock import AsyncMock

import pytest

from nanobot.agent.context import ContextBuilder
from nanobot.db.sqlite.connection import create_database
from nanobot.db.sqlite.question_repo import SQLiteQuestionRepository


@pytest.fixture
async def repo(tmp_path):
    conn = await create_database(tmp_path / "test.db")
    await conn.execute(
        "INSERT INTO users (user_id, display_name) VALUES ('u1', 'Teste')"
    )
    await conn.commit()
    yield SQLiteQuestionRepository(conn)
    await conn.close()


def _builder(tmp_path, repo) -> ContextBuilder:
    return ContextBuilder(
        tmp_path,
        memory_store=AsyncMock(**{"get_memory_context.return_value": ""}),
        skills_loader=AsyncMock(**{
            "get_always_skills.return_value": [],
            "build_skills_summary.return_value": "",
        }),
        user_repo=AsyncMock(**{"get_by_id.return_value": {}}),
        user_id="u1",
        question_repo=repo,
        agent_id="a1",
    )


async def _ask(repo, **kwargs):
    defaults = {
        "question": "o campo aceita nulo?", "agent_id": "a1",
        "origin_channel": "web", "origin_chat_id": "abc123",
    }
    return await repo.ask("u1", **{**defaults, **kwargs})


async def test_without_pendencies_the_runtime_context_does_not_grow(tmp_path, repo):
    """Custo zero quando não há nada — a seção não aparece."""
    builder = _builder(tmp_path, repo)

    section = await builder._build_waiting_section("web", "abc123")

    assert section == ""


async def test_a_pendency_of_this_conversation_shows_up(tmp_path, repo):
    await _ask(repo, subject="Bug #41234", subject_ref="azure#41234")
    builder = _builder(tmp_path, repo)

    section = await builder._build_waiting_section("web", "abc123")

    assert "Bug #41234" in section
    assert "o campo aceita nulo?" in section
    assert "não pergunte de novo" in section


async def test_pendencies_of_other_conversations_cost_one_line(tmp_path, repo):
    """Cem pendências em outras conversas não podem custar cem linhas."""
    for index in range(40):
        await _ask(repo, subject_ref=f"azure#{index}", origin_chat_id="outra")
    builder = _builder(tmp_path, repo)

    section = await builder._build_waiting_section("web", "abc123")

    assert "mais 40 em outras conversas" in section
    assert len(section.splitlines()) == 2


async def test_the_question_text_of_another_conversation_is_not_injected(tmp_path,
                                                                        repo):
    await _ask(repo, question="segredo de outra conversa", origin_chat_id="outra",
               subject_ref="azure#9")
    builder = _builder(tmp_path, repo)

    section = await builder._build_waiting_section("web", "abc123")

    assert "segredo de outra conversa" not in section


async def test_an_answered_pendency_stops_being_injected(tmp_path, repo):
    row = await _ask(repo, subject_ref="azure#41234")
    await repo.answer("u1", row["id"], answer="aceita", answered_by="human")
    builder = _builder(tmp_path, repo)

    assert await builder._build_waiting_section("web", "abc123") == ""


async def test_the_section_rides_along_with_the_user_message(tmp_path, repo):
    """Vai no bloco volátil, não no prompt de sistema: senão quebra o cache."""
    await _ask(repo, subject="Bug #41234", subject_ref="azure#41234")
    builder = _builder(tmp_path, repo)

    messages = await builder.build_messages(
        [], "e agora?", channel="web", chat_id="abc123",
    )

    assert "Bug #41234" not in messages[0]["content"]
    assert "Bug #41234" in messages[-1]["content"]
    assert messages[-1]["content"].endswith("e agora?")


async def test_the_instruction_fragment_is_gated_on_the_capability(tmp_path, repo):
    with_capability = _builder(tmp_path, repo)
    without = ContextBuilder(tmp_path, user_repo=AsyncMock(), user_id="u1")

    assert "QUESTIONS.md" in with_capability._get_bootstrap_files()
    assert "QUESTIONS.md" not in without._get_bootstrap_files()
