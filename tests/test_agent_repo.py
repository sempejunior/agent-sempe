"""Testes de repositório de agentes: criação, isolamento por dono e soft-delete."""


async def _make_user(repos, uid):
    await repos.users.create({"user_id": uid, "display_name": uid})
    return uid


async def test_create_and_get_agent(repos):
    await _make_user(repos, "u1")
    aid = await repos.agents.create_agent("u1", {"agent_id": "a1", "name": "A1"})
    got = await repos.agents.get_agent("u1", aid)
    assert got is not None
    assert got["name"] == "A1"
    assert got["status"] == "active"


async def test_list_and_get_exclude_soft_deleted(repos):
    await _make_user(repos, "u1")
    await repos.agents.create_agent("u1", {"agent_id": "keep", "name": "keep"})
    await repos.agents.create_agent("u1", {"agent_id": "gone", "name": "gone"})

    assert await repos.agents.delete_agent("u1", "gone") is True

    names = [a["name"] for a in await repos.agents.list_agents("u1")]
    assert "keep" in names
    assert "gone" not in names
    assert await repos.agents.get_agent("u1", "gone") is None


async def test_agents_are_isolated_between_users(repos):
    await _make_user(repos, "alice")
    await _make_user(repos, "bob")
    await repos.agents.create_agent("alice", {"agent_id": "a1", "name": "secret"})

    assert await repos.agents.get_agent("bob", "a1") is None
    assert await repos.agents.list_agents("bob") == []


async def test_default_agent_cannot_be_deleted(repos):
    await _make_user(repos, "u1")
    await repos.agents.create_agent(
        "u1", {"agent_id": "d1", "name": "default", "is_default": True}
    )
    assert await repos.agents.delete_agent("u1", "d1") is False
    assert await repos.agents.get_agent("u1", "d1") is not None
