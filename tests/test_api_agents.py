"""Testes de API (TestClient): auth e isolamento de agentes por usuário."""


def _auth(uid):
    return {"Authorization": f"Bearer {uid}"}


def test_register_and_login(client):
    r = client.post("/api/auth/register", json={"user_id": "u1", "display_name": "U1"})
    assert r.status_code == 200, r.text
    assert r.json()["token"] == "u1"

    r = client.post("/api/auth/login", json={"user_id": "u1"})
    assert r.status_code == 200, r.text
    assert r.json()["token"] == "u1"


def test_login_unknown_user_rejected(client):
    r = client.post("/api/auth/login", json={"user_id": "ghost"})
    assert r.status_code in (401, 404)


def test_agents_require_auth(client):
    r = client.get("/api/agents")
    assert r.status_code in (401, 403)


def test_create_and_list_agent(client):
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.post(
        "/api/agents",
        json={"name": "My Agent", "role": "assistente", "description": "um agente"},
        headers=_auth("u1"),
    )
    assert r.status_code == 200, r.text
    aid = r.json()["agent_id"]

    r = client.get("/api/agents", headers=_auth("u1"))
    assert r.status_code == 200, r.text
    assert any(a["agent_id"] == aid for a in r.json())


def test_agent_isolated_between_users(client):
    client.post("/api/auth/register", json={"user_id": "alice"})
    client.post("/api/auth/register", json={"user_id": "bob"})

    r = client.post(
        "/api/agents",
        json={"name": "secret", "role": "x", "description": "y"},
        headers=_auth("alice"),
    )
    assert r.status_code == 200, r.text
    aid = r.json()["agent_id"]

    # Bob não enxerga o agente da Alice, nem por id direto nem na listagem.
    r = client.get(f"/api/agents/{aid}", headers=_auth("bob"))
    assert r.status_code == 404
    r = client.get("/api/agents", headers=_auth("bob"))
    assert r.status_code == 200
    assert all(a["agent_id"] != aid for a in r.json())


def _new_agent(client, uid="u1", **extra):
    client.post("/api/auth/register", json={"user_id": uid})
    body = {"name": "A", "role": "r", "description": "d", **extra}
    r = client.post("/api/agents", json=body, headers=_auth(uid))
    assert r.status_code == 200, r.text
    return r.json()["agent_id"]


def test_patch_bootstrap_keeps_untouched_keys(client):
    aid = _new_agent(client, bootstrap={"SOUL.md": "alma", "AGENTS.md": "regras"})

    r = client.patch(
        f"/api/agents/{aid}",
        json={"bootstrap": {"IDENTITY.md": "quem eu sou"}},
        headers=_auth("u1"),
    )
    assert r.status_code == 200, r.text

    bootstrap = r.json()["agent"]["bootstrap"]
    assert bootstrap["IDENTITY.md"] == "quem eu sou"
    assert bootstrap["SOUL.md"] == "alma"
    assert bootstrap["AGENTS.md"] == "regras"


def test_patch_bootstrap_can_overwrite_a_key(client):
    aid = _new_agent(client, bootstrap={"SOUL.md": "antiga"})

    r = client.patch(
        f"/api/agents/{aid}", json={"bootstrap": {"SOUL.md": "nova"}}, headers=_auth("u1"),
    )
    assert r.json()["agent"]["bootstrap"]["SOUL.md"] == "nova"


def test_patch_removes_a_key_with_explicit_null(client):
    aid = _new_agent(client, bootstrap={"SOUL.md": "alma", "AGENTS.md": "regras"})

    r = client.patch(
        f"/api/agents/{aid}", json={"bootstrap": {"SOUL.md": None}}, headers=_auth("u1"),
    )
    bootstrap = r.json()["agent"]["bootstrap"]
    assert "SOUL.md" not in bootstrap
    assert bootstrap["AGENTS.md"] == "regras"


def test_patch_metadata_keeps_the_template_reference(client):
    aid = _new_agent(client, metadata={"template": "start_rh_ops"})

    r = client.patch(
        f"/api/agents/{aid}", json={"metadata": {"nota": "meu agente"}}, headers=_auth("u1"),
    )
    metadata = r.json()["agent"]["metadata"]
    assert metadata["template"] == "start_rh_ops"
    assert metadata["nota"] == "meu agente"


def test_patch_agent_config_merges_rag_one_level_deeper(client):
    aid = _new_agent(client, agent_config={"model": "m1", "rag": {"enabled": True, "top_k": 5}})

    r = client.patch(
        f"/api/agents/{aid}",
        json={"agent_config": {"rag": {"top_k": 9}}},
        headers=_auth("u1"),
    )
    cfg = r.json()["agent"]["agent_config"]
    assert cfg["rag"] == {"enabled": True, "top_k": 9}
    assert cfg["model"] == "m1"


def test_patch_channel_configs_does_not_disable_the_others(client):
    aid = _new_agent(client, channel_configs={
        "telegram": {"enabled": True}, "slack": {"enabled": True},
    })

    r = client.patch(
        f"/api/agents/{aid}",
        json={"channel_configs": {"slack": {"enabled": False}}},
        headers=_auth("u1"),
    )
    channels = r.json()["agent"]["channel_configs"]
    assert channels["telegram"]["enabled"] is True
    assert channels["slack"]["enabled"] is False


def test_code_agents_lists_the_clis(client):
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.get("/api/code-agents", headers=_auth("u1"))

    assert r.status_code == 200, r.text
    ids = [c["id"] for c in r.json()]
    assert "kiro" in ids


def test_installing_is_refused_when_the_instance_does_not_allow_it(client):
    """Instalar roda um script do fornecedor na máquina compartilhada."""
    client.post("/api/auth/register", json={"user_id": "u1"})

    r = client.post("/api/code-agents/kiro/install", headers=_auth("u1"))

    assert r.status_code == 403
    assert "desativada" in r.json()["detail"]


def test_code_agents_requires_auth(client):
    assert client.get("/api/code-agents").status_code in (401, 403)
