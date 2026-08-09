"""Testes do PUT de integração: corpo parcial não pode apagar credencial em silêncio."""


def _auth(uid):
    return {"Authorization": f"Bearer {uid}"}


def _activate(client, uid="u1"):
    client.post("/api/auth/register", json={"user_id": uid})
    r = client.post(
        "/api/credentials",
        json={"name": "GitLab", "secret": {"token": "glpat-xxx"}},
        headers=_auth(uid),
    )
    assert r.status_code == 200, r.text
    credential_id = r.json()["id"]

    r = client.put(
        "/api/integrations/gitlab",
        json={"system_integration_id": "gitlab", "credential_id": credential_id,
              "enabled": True},
        headers=_auth(uid),
    )
    assert r.status_code == 200, r.text
    return credential_id


def test_activating_an_integration_keeps_its_credential(client):
    credential_id = _activate(client)

    r = client.get("/api/integrations", headers=_auth("u1"))

    row = next(i for i in r.json() if i["slug"] == "gitlab")
    assert row["credential_id"] == credential_id
    assert row["system_integration_id"] == "gitlab"


def test_a_partial_body_is_refused_instead_of_wiping_the_credential(client):
    """Mandar só {"enabled": true} zerava credential_id e o agente perdia o acesso."""
    credential_id = _activate(client)

    r = client.put("/api/integrations/gitlab", json={"enabled": True},
                   headers=_auth("u1"))

    assert r.status_code == 400
    assert "credential_id" in r.json()["detail"]

    rows = client.get("/api/integrations", headers=_auth("u1")).json()
    row = next(i for i in rows if i["slug"] == "gitlab")
    assert row["credential_id"] == credential_id


def test_a_whole_body_still_updates(client):
    credential_id = _activate(client)

    r = client.put(
        "/api/integrations/gitlab",
        json={"system_integration_id": "gitlab", "credential_id": credential_id,
              "enabled": False},
        headers=_auth("u1"),
    )

    assert r.status_code == 200, r.text
    rows = client.get("/api/integrations", headers=_auth("u1")).json()
    row = next(i for i in rows if i["slug"] == "gitlab")
    assert row["enabled"] is False
    assert row["credential_id"] == credential_id
