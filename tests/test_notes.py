"""Testes do canal de notas: no-op sem sink, isolamento por turno, e nunca derruba o turno."""

import pytest

from nanobot.agent import notes


@pytest.fixture(autouse=True)
def clean_sink():
    token = notes.install(None)
    yield
    notes.reset(token)


async def test_emitting_without_a_sink_does_nothing():
    """Cron, rotina e canais externos: ninguém escutando, custo de uma leitura."""
    assert notes.enabled() is False

    await notes.emit("Clonando o repositório…")
    await notes.alert("question", "Falta uma decisão")


async def test_notes_reach_the_installed_sink():
    seen: list[tuple[str, str]] = []
    token = notes.install(_collect(seen))
    try:
        await notes.emit("Clonando projeto-backend…")
    finally:
        notes.reset(token)

    assert seen == [("note", "Clonando projeto-backend…")]


async def test_an_alert_keeps_its_kind():
    """O aviso de pendência precisa chegar diferenciado: ele sai do chat."""
    seen: list[tuple[str, str]] = []
    token = notes.install(_collect(seen))
    try:
        await notes.alert("question", "O agente precisa de uma resposta")
    finally:
        notes.reset(token)

    assert seen == [("question", "O agente precisa de uma resposta")]


async def test_a_broken_sink_never_breaks_the_turn():
    """Um socket que morreu não pode custar a delegação que está rodando."""
    async def explode(_kind, _text):
        raise RuntimeError("socket morreu")

    token = notes.install(explode)
    try:
        await notes.emit("Escrevendo o código…")
    finally:
        notes.reset(token)


async def test_empty_notes_are_dropped():
    seen: list[tuple[str, str]] = []
    token = notes.install(_collect(seen))
    try:
        await notes.emit("   ")
    finally:
        notes.reset(token)

    assert seen == []


async def test_a_long_note_is_clipped():
    """Nota é uma linha no balão; resultado longo é resposta, não nota."""
    seen: list[tuple[str, str]] = []
    token = notes.install(_collect(seen))
    try:
        await notes.emit("x" * (notes.MAX_NOTE_CHARS + 200))
    finally:
        notes.reset(token)

    assert len(seen[0][1]) == notes.MAX_NOTE_CHARS
    assert seen[0][1].endswith("…")


async def test_resetting_restores_the_previous_sink():
    """Turnos concorrentes do mesmo socket: cada um instala e devolve o seu."""
    first: list[tuple[str, str]] = []
    outer = notes.install(_collect(first))
    second: list[tuple[str, str]] = []
    inner = notes.install(_collect(second))

    await notes.emit("a")
    notes.reset(inner)
    await notes.emit("b")
    notes.reset(outer)
    await notes.emit("c")

    assert [text for _kind, text in second] == ["a"]
    assert [text for _kind, text in first] == ["b"]


def _collect(bucket: list[tuple[str, str]]):
    async def sink(kind: str, text: str) -> None:
        bucket.append((kind, text))
    return sink
