"""Testes do fixup que mantém o agente autor alinhado ao seed."""

import json

import pytest_asyncio

from nanobot.db.sqlite.connection import create_database
from nanobot.db.sqlite.migrations import (
    _compose_skill_author_prompt,
    _sync_skill_author_agents,
)
from nanobot.db.sqlite.seed.agent_templates_solides import SOLIDES_TEMPLATES

_TEMPLATE = next(t for t in SOLIDES_TEMPLATES if t["id"] == "skill_author")


@pytest_asyncio.fixture
async def db(tmp_path):
    connection = await create_database(str(tmp_path / "test.db"))
    try:
        yield connection
    finally:
        await connection.close()


async def _insert_agent(db, agent_id: str, bootstrap: dict, metadata: dict) -> None:
    await db.execute(
        "INSERT OR IGNORE INTO users (user_id, display_name) VALUES ('u1', 'U1')"
    )
    await db.execute(
        "INSERT INTO agents (agent_id, user_id, name, role, description, avatar, "
        "agent_config, bootstrap, tools_enabled, channel_configs, metadata, status) "
        "VALUES (?, 'u1', 'Criador', 'autor', 'd', 'C', '{}', ?, '[]', '{}', ?, 'active')",
        (agent_id, json.dumps(bootstrap), json.dumps(metadata)),
    )
    await db.commit()


async def _read_agent(db, agent_id: str) -> tuple[dict, dict]:
    cursor = await db.execute(
        "SELECT bootstrap, metadata FROM agents WHERE agent_id = ?", (agent_id,)
    )
    bootstrap_raw, metadata_raw = await cursor.fetchone()
    return json.loads(bootstrap_raw), json.loads(metadata_raw)


async def test_the_missing_guardrails_are_restored(db):
    """O frontend montava o bootstrap à mão e deixava os guardrails de fora."""
    await _insert_agent(
        db, "a1",
        {"AGENTS.md": _TEMPLATE["system_prompt"]},
        {"template_id": "skill_author", "system": True, "template": "custom"},
    )

    await _sync_skill_author_agents(db)

    bootstrap, _ = await _read_agent(db, "a1")
    assert "## Guardrails" in bootstrap["AGENTS.md"]
    assert bootstrap["AGENTS.md"] == _compose_skill_author_prompt(_TEMPLATE)


async def test_the_duplicated_template_key_is_normalized(db):
    """template_id era escrito pelo frontend e template lido pelo backend."""
    await _insert_agent(
        db, "a1",
        {"AGENTS.md": _TEMPLATE["system_prompt"]},
        {"template_id": "skill_author", "system": True, "template": "custom"},
    )

    await _sync_skill_author_agents(db)

    _, metadata = await _read_agent(db, "a1")
    assert metadata["template"] == "skill_author"
    assert "template_id" not in metadata


async def test_running_twice_changes_nothing_the_second_time(db):
    await _insert_agent(
        db, "a1",
        {"AGENTS.md": _TEMPLATE["system_prompt"]},
        {"template_id": "skill_author", "system": True},
    )

    await _sync_skill_author_agents(db)
    first = await _read_agent(db, "a1")
    await _sync_skill_author_agents(db)

    assert await _read_agent(db, "a1") == first


async def test_another_agent_is_left_alone(db):
    """Só o agente de sistema é gerido pelo seed; os do cliente são dele."""
    await _insert_agent(
        db, "a2", {"AGENTS.md": "prompt do cliente"}, {"template": "hr_ops"},
    )

    await _sync_skill_author_agents(db)

    bootstrap, metadata = await _read_agent(db, "a2")
    assert bootstrap["AGENTS.md"] == "prompt do cliente"
    assert metadata == {"template": "hr_ops"}


async def test_a_hand_written_prompt_is_not_overwritten(db):
    """Sem o marcador do prompt que enviamos, o bootstrap não é nosso para mexer."""
    await _insert_agent(
        db, "a1", {"AGENTS.md": "prompt totalmente reescrito por um admin"},
        {"template": "skill_author"},
    )

    await _sync_skill_author_agents(db)

    bootstrap, _ = await _read_agent(db, "a1")
    assert bootstrap["AGENTS.md"] == "prompt totalmente reescrito por um admin"


async def test_the_catalog_template_gets_the_new_prompt(db):
    """Sem isso, agentes novos nasceriam com o prompt antigo, sem o gatilho."""
    await db.execute(
        "UPDATE agent_templates SET system_prompt = ? WHERE id = 'skill_author'",
        ("Você é o Criador de Skills do Agent Hub. Versão antiga.",),
    )
    await db.commit()

    await _sync_skill_author_agents(db)

    cursor = await db.execute(
        "SELECT system_prompt, guardrails FROM agent_templates WHERE id = 'skill_author'"
    )
    prompt, guardrails = await cursor.fetchone()
    assert prompt == _TEMPLATE["system_prompt"]
    assert guardrails == _TEMPLATE["guardrails"]
