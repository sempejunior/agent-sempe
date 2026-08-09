"""Testes da lista de conversas: título do que a pessoa perguntou, e só conversa."""

from nanobot.web.server import _chat_key, _session_title


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
    return session_id


def test_the_title_is_what_the_person_asked(client):
    agent_id = _agent(client)
    client.portal.call(
        _seed, client.app, "u1", agent_id, "web:abc",
        [
            {"role": "user", "content": "Resolve a demanda 41235 do board do Azure"},
            {"role": "assistant", "content": "Abri o MR !123"},
        ],
    )

    rows = client.get("/api/sessions", headers={**_auth(), "X-Agent-Id": agent_id}).json()

    assert [r["title"] for r in rows] == ["Resolve a demanda 41235 do board do Azure"]
    assert rows[0]["session_key"] == "web:abc"


def test_a_resumed_conversation_is_not_named_after_the_system_prompt(client):
    """A retomada de um job começa com [sistema]; usar isso como nome esconde o pedido."""
    agent_id = _agent(client)
    client.portal.call(
        _seed, client.app, "u1", agent_id, "web:abc",
        [
            {"role": "user", "content": "[sistema] Chegou a resposta da pergunta"},
            {"role": "assistant", "content": "Retomando"},
            {"role": "user", "content": "Sobe o relatório do time"},
        ],
    )

    rows = client.get("/api/sessions", headers={**_auth(), "X-Agent-Id": agent_id}).json()

    assert rows[0]["title"] == "Sobe o relatório do time"


def test_the_history_crosses_every_agent(client):
    """A conversa pertence ao agente; esconder as dos outros esconde o histórico."""
    first = _agent(client)
    second = client.post(
        "/api/agents",
        json={"name": "Criador de Skills", "role": "engenheiro", "description": "x"},
        headers=_auth(),
    ).json()["agent_id"]
    client.portal.call(_seed, client.app, "u1", first,
                       "web:um", [{"role": "user", "content": "demanda 41235"}])
    client.portal.call(_seed, client.app, "u1", second, "web:dois",
                       [{"role": "user", "content": "cria uma skill"}])

    rows = client.get("/api/sessions", headers={**_auth(), "X-Agent-Id": first}).json()

    by_key = {r["session_key"]: r for r in rows}
    assert set(by_key) == {"web:um", "web:dois"}
    assert by_key["web:dois"]["agent_id"] == second
    assert by_key["web:dois"]["agent_name"] == "Criador de Skills"


def test_a_conversation_opens_whatever_agent_is_selected(client):
    """Abrir o histórico não pode depender do agente que está no cabeçalho."""
    owner = _agent(client)
    other = client.post(
        "/api/agents",
        json={"name": "Outro", "role": "x", "description": "y"},
        headers=_auth(),
    ).json()["agent_id"]
    client.portal.call(_seed, client.app, "u1", owner, "web:um",
                       [{"role": "user", "content": "demanda 41235"}])

    msgs = client.get("/api/sessions/web:um/messages",
                      headers={**_auth(), "X-Agent-Id": other}).json()

    assert [m["content"] for m in msgs] == ["demanda 41235"]


def test_only_chat_sessions_are_listed(client):
    """Embed, rotina e retomada de sistema são registro de máquina, não conversa."""
    agent_id = _agent(client)
    for key in ("web:abc", "embed:tok:xyz", "system:web:u1"):
        client.portal.call(
            _seed, client.app, "u1", agent_id, key,
            [{"role": "user", "content": f"pedido em {key}"}],
        )

    rows = client.get("/api/sessions", headers={**_auth(), "X-Agent-Id": agent_id}).json()

    assert [r["session_key"] for r in rows] == ["web:abc"]


def test_the_chat_key_survives_the_client_layer():
    """A camada de cliente reescreve a chave; a conversa continua a mesma."""
    assert _chat_key("agent:a1:web:abc", "agent:a1:") == "web:abc"
    assert _chat_key("agent:a1:client:c9:web:abc", "agent:a1:") == "web:abc"
    assert _chat_key("agent:a1:system:web:u1", "agent:a1:") == ""
    assert _chat_key("agent:a1:embed:tok:x", "agent:a1:") == ""


def test_a_conversation_with_no_question_still_has_a_name():
    assert _session_title("") == "Conversa sem pergunta"


def test_a_long_question_is_marked_as_cut():
    title = _session_title("x" * 200)

    assert title.endswith("…")
    assert len(title) == 61
