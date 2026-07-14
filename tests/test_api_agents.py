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
