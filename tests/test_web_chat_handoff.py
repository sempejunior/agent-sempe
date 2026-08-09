"""Testes do teto do turno no chat web: passar do teto avisa, não mata.

Cancelar o turno aos 180s foi o que matou uma delegação de código no meio, sem
nada persistido e sem processo vivo para retomar. O teto macio agora devolve o
chat para a pessoa e deixa o trabalho seguir; só o teto duro cancela.
"""

import asyncio

from nanobot.web.server import _origin_chat_id


def test_a_slow_turn_hands_the_chat_back_and_still_answers(client, monkeypatch):
    from nanobot.web import server

    monkeypatch.setattr(server, "_WEB_CHAT_SOFT_TIMEOUT_S", 0.05)
    client.post("/api/auth/register", json={"user_id": "u1"})

    async def slow_turn(*_args, **_kwargs):
        await asyncio.sleep(0.3)
        return "MR aberto: !123"

    client.app.state.agent.process_direct = slow_turn

    with client.websocket_connect("/ws/chat?token=u1") as ws:
        ws.send_json({"type": "message", "content": "resolve a 41235",
                      "session_key": "web:s1"})
        handoff = ws.receive_json()
        answer = ws.receive_json()

    assert handoff["type"] == "handoff"
    assert "segundo plano" in handoff["content"]
    assert answer["type"] == "response"
    assert answer["content"] == "MR aberto: !123"
    assert handoff["turn_id"] == answer["turn_id"]


def test_only_the_hard_ceiling_cancels(client, monkeypatch):
    from nanobot.web import server

    monkeypatch.setattr(server, "_WEB_CHAT_SOFT_TIMEOUT_S", 0.01)
    monkeypatch.setattr(server, "_WEB_CHAT_HARD_TIMEOUT_S", 0.06)
    client.post("/api/auth/register", json={"user_id": "u1"})

    cancelled: list[bool] = []

    async def stuck_turn(*_args, **_kwargs):
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            cancelled.append(True)
            raise
        return "nunca"

    client.app.state.agent.process_direct = stuck_turn

    with client.websocket_connect("/ws/chat?token=u1") as ws:
        ws.send_json({"type": "message", "content": "trava", "session_key": "web:s1"})
        ws.receive_json()
        failure = ws.receive_json()

    assert failure["type"] == "error"
    assert failure["code"] == "timeout"
    assert failure["turn_id"]
    assert cancelled == [True]


def test_a_fast_turn_never_mentions_the_background(client):
    client.post("/api/auth/register", json={"user_id": "u1"})

    async def quick_turn(*_args, **_kwargs):
        return "pronto"

    client.app.state.agent.process_direct = quick_turn

    with client.websocket_connect("/ws/chat?token=u1") as ws:
        ws.send_json({"type": "message", "content": "oi", "session_key": "web:s1"})
        answer = ws.receive_json()

    assert answer["type"] == "response"
    assert answer["content"] == "pronto"


def test_notes_from_a_tool_reach_the_socket_as_progress(client):
    """É o que o usuário vê enquanto o agente clona e delega."""
    from nanobot.agent import notes

    client.post("/api/auth/register", json={"user_id": "u1"})

    async def talking_turn(*_args, **_kwargs):
        await notes.emit("Clonando projeto-backend…")
        await notes.alert("question", "O agente precisa de uma resposta")
        return "fim"

    client.app.state.agent.process_direct = talking_turn

    with client.websocket_connect("/ws/chat?token=u1") as ws:
        ws.send_json({"type": "message", "content": "resolve", "session_key": "web:s1"})
        note = ws.receive_json()
        alert = ws.receive_json()
        answer = ws.receive_json()

    assert note["type"] == "progress"
    assert note["content"] == "Clonando projeto-backend…"
    assert note["turn_id"] == answer["turn_id"]
    assert alert["type"] == "notice"
    assert alert["kind"] == "question"
    assert alert["session_key"] == "web:s1"


def test_the_turn_carries_the_chat_id_that_brings_a_job_back():
    """Um job retomava em web:<user_id> — uma conversa que ninguém tem aberta."""
    assert _origin_chat_id("web:abc123", "carlos") == "abc123"
    assert _origin_chat_id("", "carlos") == "carlos"
