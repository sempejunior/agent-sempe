"""Testes do fluxo de skills de projeto: molde, save_skill e o agente autor."""

import pytest

from nanobot.agent.skills import BUILTIN_SKILLS_DIR, SkillsLoader
from nanobot.agent.tools.skill import ReadSkillTool, SaveSkillTool


def _auth(uid):
    return {"Authorization": f"Bearer {uid}"}


async def test_the_project_mold_parses_with_the_real_parser():
    """O parser é split por linha com metadata em JSON de uma linha, e falha calado."""
    loader = SkillsLoader(workspace=BUILTIN_SKILLS_DIR.parent,
                         builtin_skills_dir=BUILTIN_SKILLS_DIR)

    meta = await loader.get_skill_metadata("skill-de-projeto")

    assert meta is not None
    assert meta["name"] == "skill-de-projeto"
    assert "skill de um projeto" in meta["description"]


async def test_the_project_mold_is_listed_without_any_integration_active():
    """Um guia de escrita não pode desaparecer porque o cliente não ativou o Azure."""
    loader = SkillsLoader(workspace=BUILTIN_SKILLS_DIR.parent,
                          builtin_skills_dir=BUILTIN_SKILLS_DIR,
                          active_integrations=set())

    names = [s["name"] for s in await loader.list_skills(filter_unavailable=True)]

    assert "skill-de-projeto" in names


async def test_the_mold_metadata_is_readable_json():
    """metadata.nanobot só é lido se o JSON estiver todo em uma linha."""
    loader = SkillsLoader(workspace=BUILTIN_SKILLS_DIR.parent,
                          builtin_skills_dir=BUILTIN_SKILLS_DIR)
    meta = await loader.get_skill_metadata("skill-de-projeto")

    parsed = loader._parse_nanobot_metadata(meta.get("metadata", ""))

    assert parsed["emoji"] == "📓"
    assert parsed["category"] == "Skills"


async def test_the_mold_is_not_always_active():
    """Conteúdo integral em todo prompt é o que o molde manda evitar."""
    loader = SkillsLoader(workspace=BUILTIN_SKILLS_DIR.parent,
                          builtin_skills_dir=BUILTIN_SKILLS_DIR)

    assert "skill-de-projeto" not in await loader.get_always_skills()


async def test_saving_over_a_skill_preserves_the_user_flags(repos):
    """always_active e enabled são do usuário; o agente escreve conteúdo, não config."""
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    await repos.skills.save_skill("u1", {
        "name": "manual-do-start",
        "description": "antiga",
        "content": "conteudo antigo",
        "always_active": True,
        "enabled": False,
    })
    tool = SaveSkillTool(skill_repo=repos.skills, user_id="u1")

    await tool.execute(skill_name="manual-do-start", skill_description="nova",
                       skill_content="conteudo novo")

    saved = await repos.skills.get_skill("u1", "manual-do-start")
    assert saved["always_active"] == 1
    assert saved["enabled"] == 0
    assert "conteudo novo" in saved["content"]


async def test_an_overwrite_says_it_overwrote(repos):
    """Não há versionamento: a sobrescrita precisa aparecer na resposta."""
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    tool = SaveSkillTool(skill_repo=repos.skills, user_id="u1")
    await tool.execute(skill_name="manual", skill_description="d", skill_content="v1")

    out = await tool.execute(skill_name="manual", skill_description="d",
                             skill_content="v2 bem maior")

    assert "atualizada" in out
    assert "substituído" in out


async def test_a_new_skill_says_it_is_not_enabled_anywhere(repos):
    """save_skill não toca skills_enabled, então a skill nasce invisível."""
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    tool = SaveSkillTool(skill_repo=repos.skills, user_id="u1")

    out = await tool.execute(skill_name="manual", skill_description="d", skill_content="c")

    assert "criada" in out
    assert "habilit" in out


def test_a_skill_author_agent_is_created_with_its_guardrails(client):
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.post("/api/agents", json={
        "name": "Criador de Skills",
        "role": "Engenheiro de skills",
        "description": "cria skills",
        "metadata": {"template": "skill_author", "system": True},
    }, headers=_auth("u1"))

    assert r.status_code == 200, r.text
    agents_md = r.json()["bootstrap"]["AGENTS.md"]
    assert "## Guardrails" in agents_md
    assert "Criador de Skills do Agent Hub" in agents_md


def test_the_skill_author_knows_the_project_mold(client):
    """O gatilho é aditivo: aponta o molde sem substituir o fluxo genérico."""
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.get("/api/agents/templates/skill_author", headers=_auth("u1"))

    assert r.status_code == 200, r.text
    prompt = r.json()["system_prompt"]
    assert 'read_skill("skill-de-projeto")' in prompt
    assert 'read_skill("skill-creator")' in prompt


@pytest.mark.parametrize("field,size", [("description", 500), ("content", 70_000)])
def test_an_oversized_skill_field_is_refused(client, field, size):
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.put("/api/skills/custom/inflada", json={field: "x" * size},
                   headers=_auth("u1"))

    assert r.status_code == 422, r.text
    assert "limite" in r.json()["detail"]


def test_a_skill_within_the_limits_is_accepted(client):
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.put("/api/skills/custom/manual-do-start",
                   json={"description": "x" * 400, "content": "conteudo"},
                   headers=_auth("u1"))

    assert r.status_code == 200, r.text


async def test_a_missed_skill_name_gets_the_close_matches(repos):
    """Sem candidatos, o modelo fica variando o nome e desiste do manual certo."""
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    await repos.skills.save_skill("u1", {
        "name": "projeto-killer-start-2", "description": "d", "content": "manual",
    })
    tool = ReadSkillTool(skill_repo=repos.skills, user_id="u1",
                         builtin_dir=BUILTIN_SKILLS_DIR)

    out = await tool.execute(skill_name="projeto-killer-start-2.0")

    assert "não existe" in out
    assert "projeto-killer-start-2" in out


async def test_an_unrelated_name_gets_the_full_list(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    tool = ReadSkillTool(skill_repo=repos.skills, user_id="u1",
                         builtin_dir=BUILTIN_SKILLS_DIR)

    out = await tool.execute(skill_name="zzzzzz")

    assert "Disponíveis" in out
    assert "skill-de-projeto" in out


async def test_the_exact_name_still_returns_the_content(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    await repos.skills.save_skill("u1", {
        "name": "manual", "description": "d", "content": "o conteudo do manual",
    })
    tool = ReadSkillTool(skill_repo=repos.skills, user_id="u1")

    assert await tool.execute(skill_name="manual") == "o conteudo do manual"
