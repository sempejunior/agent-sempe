"""Testes do trace de execução: opt-in, no-op sem sink, e nunca derruba o turno."""

import pytest

from nanobot.agent import trace


@pytest.fixture(autouse=True)
def clean_sink():
    token = trace.install(None)
    yield
    trace.reset(token)


async def test_emitting_without_a_sink_does_nothing():
    """O caminho normal do produto: ninguém escutando, custo de uma leitura."""
    assert trace.enabled() is False

    await trace.emit("llm", iteration=1)


async def test_events_reach_the_installed_sink():
    seen: list[dict] = []
    token = trace.install(_collect(seen))
    try:
        await trace.emit("tool_call", tool="repo", arguments='{"action":"status"}')
    finally:
        trace.reset(token)

    assert seen == [{"kind": "tool_call", "tool": "repo",
                     "arguments": '{"action":"status"}'}]


async def test_a_broken_sink_never_breaks_the_turn():
    """Um painel de debug com defeito não pode custar a resposta do usuário."""
    async def explode(_event):
        raise RuntimeError("socket morreu")

    token = trace.install(explode)
    try:
        await trace.emit("llm", iteration=1)
    finally:
        trace.reset(token)


async def test_resetting_restores_the_previous_sink():
    """Turnos concorrentes: cada um instala e devolve o seu."""
    first: list[dict] = []
    outer = trace.install(_collect(first))
    second: list[dict] = []
    inner = trace.install(_collect(second))

    await trace.emit("a")
    trace.reset(inner)
    await trace.emit("b")
    trace.reset(outer)
    await trace.emit("c")

    assert [e["kind"] for e in second] == ["a"]
    assert [e["kind"] for e in first] == ["b"]


def test_long_text_is_marked_as_cut():
    """Uma truncagem silenciosa faria alguém debugar um prompt que não é o real."""
    clipped = trace.clip("x" * (trace.MAX_TEXT_CHARS + 500))

    assert "cortado" in clipped
    assert str(trace.MAX_TEXT_CHARS + 500) in clipped


def test_short_text_is_untouched():
    assert trace.clip("prompt curto") == "prompt curto"


def _collect(bucket: list[dict]):
    async def sink(event: dict) -> None:
        bucket.append(event)
    return sink
