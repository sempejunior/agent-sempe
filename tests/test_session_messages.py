"""Testes da conversa reaberta: o que o agente fez volta junto com o que ele disse."""


def _auth(uid="u1"):
    return {"Authorization": f"Bearer {uid}"}


def _agent(client, uid="u1"):
    client.post("/api/auth/register", json={"user_id": uid})
    r = client.post(
        "/api/agents",
        json={"name": "Assistente", "role": "gestor", "description": "agente"},
        headers=_auth(uid),
    )
    assert r.status_code == 200, r.text
    return r.json()["agent_id"]


async def _seed(app, uid, agent_id, session_key, messages):
    repos = app.state.repos
    session_id = await repos.sessions.save({
        "user_id": uid, "agent_id": agent_id,
        "session_key": f"agent:{agent_id}:{session_key}",
        "message_count": len(messages),
    })
    await repos.messages.append_many(session_id, uid, messages)


_TURN = [
    {"role": "user", "content": "Resolve a demanda 41235"},
    {"role": "assistant", "content": None, "tool_calls": [
        {"id": "call_1", "type": "function",
         "function": {"name": "work_ledger",
                      "arguments": '{"action":"claim","external_id":"41235"}'}},
    ]},
    {"role": "tool", "tool_call_id": "call_1", "name": "work_ledger",
     "content": "Claim de azure#41235 concedido"},
    {"role": "assistant", "content": "Abri o MR !123"},
]


def test_a_reopened_conversation_shows_the_tool_calls(client):
    agent_id = _agent(client)
    client.portal.call(_seed, client.app, "u1", agent_id, "web:abc", _TURN)

    msgs = client.get("/api/sessions/web:abc/messages",
                      headers={**_auth(), "X-Agent-Id": agent_id}).json()

    assert [m["role"] for m in msgs] == ["user", "assistant", "tool", "assistant"]
    call = msgs[1]["tool_calls"][0]
    assert call["function"]["name"] == "work_ledger"
    assert "41235" in call["function"]["arguments"]
    assert msgs[2]["content"] == "Claim de azure#41235 concedido"
    assert msgs[2]["tool_call_id"] == "call_1"


def test_every_message_keeps_its_time(client):
    """O horário é o que permite ler a conversa como uma sequência."""
    agent_id = _agent(client)
    client.portal.call(_seed, client.app, "u1", agent_id, "web:abc", _TURN)

    msgs = client.get("/api/sessions/web:abc/messages",
                      headers={**_auth(), "X-Agent-Id": agent_id}).json()

    assert all(m["timestamp"] for m in msgs)


def test_the_conversation_opens_under_any_agent(client):
    """O agente segue a conversa, não o contrário: o histórico é da pessoa."""
    mine = _agent(client)
    other = client.post(
        "/api/agents",
        json={"name": "Outro", "role": "x", "description": "y"},
        headers=_auth(),
    ).json()["agent_id"]
    client.portal.call(_seed, client.app, "u1", mine, "web:abc", _TURN)

    msgs = client.get("/api/sessions/web:abc/messages",
                      headers={**_auth(), "X-Agent-Id": other}).json()

    assert [m["role"] for m in msgs] == ["user", "assistant", "tool", "assistant"]


def test_another_persons_conversation_is_never_served(client):
    """O que não pode atravessar é o usuário."""
    mine = _agent(client)
    client.portal.call(_seed, client.app, "u1", mine, "web:abc", _TURN)
    client.post("/api/auth/register", json={"user_id": "bob"})

    msgs = client.get("/api/sessions/web:abc/messages",
                      headers={"Authorization": "Bearer bob"}).json()

    assert msgs == []


def test_another_persons_conversation_is_never_listed(client):
    mine = _agent(client)
    client.portal.call(_seed, client.app, "u1", mine, "web:abc", _TURN)
    client.post("/api/auth/register", json={"user_id": "bob"})

    rows = client.get("/api/sessions", headers={"Authorization": "Bearer bob"}).json()

    assert rows == []
