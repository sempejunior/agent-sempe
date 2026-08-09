"""Short progress notes from inside a turn, for the person waiting on it.

A turn that clones three repositories and delegates the writing of code to a CLI
spends minutes doing real work while the screen shows nothing but a chip with the
name of a tool. The person concludes it froze, and the product — which is a chat
— stops feeling like one.

This is the counterpart of ``trace``: the trace exists to debug what the agent
did and carries the assembled prompt and every tool result, so it goes only to
whoever opened the panel. A note is written for the person: one short line, in
their language, saying what is happening right now. It never carries a result.

The sink lives in a ``ContextVar`` for the same reason the trace's does: nothing
has to be threaded through ``_run_agent_loop`` and ``execute_calls`` for a tool
deep in the stack to speak. Whoever runs the turn installs a sink for its
duration; with no sink installed — cron, a routine, an external channel — emitting
is a variable read and a return, so tools carry no branch for the case.

Two kinds travel the same channel because they come from the same place and
differ only in where they surface. A ``note`` is in-place progress and dies with
the turn. An ``alert`` is something the person must know even if they navigated
away: work finished, or the agent is now blocked on an answer of theirs.

Notes are ephemeral by design. They are not persisted, not replayed on reconnect
and never reach the model: the assistant's text is still delivered once, at the
end of the turn.
"""

from __future__ import annotations

import contextvars
from collections.abc import Awaitable, Callable

NoteSink = Callable[[str, str], Awaitable[None]]
"""Called with ``(kind, text)`` — ``note`` for in-place progress, or the alert
kind (``done``, ``question``) for something worth interrupting over."""

_sink: contextvars.ContextVar[NoteSink | None] = contextvars.ContextVar(
    "nanobot_note_sink", default=None,
)

MAX_NOTE_CHARS = 160
"""A note is a line in a bubble, not a paragraph. Anything longer is a result,
and results belong in the answer."""


def install(sink: NoteSink | None) -> contextvars.Token:
    """Route progress notes to *sink* until the token is reset."""
    return _sink.set(sink)


def reset(token: contextvars.Token) -> None:
    _sink.reset(token)


def enabled() -> bool:
    """Whether anyone is watching — for skipping work that only feeds a note."""
    return _sink.get() is not None


async def emit(text: str) -> None:
    """Report what is happening right now, in place, to whoever is waiting."""
    await _send("note", text)


async def alert(kind: str, text: str) -> None:
    """Report something the person should see even if they left the chat open elsewhere."""
    await _send(kind, text)


async def _send(kind: str, text: str) -> None:
    """Deliver one event, if anyone is listening.

    Never raises: a broken socket is not a reason to lose the turn the person is
    waiting for.
    """
    sink = _sink.get()
    if sink is None:
        return
    line = text.strip()
    if not line:
        return
    if len(line) > MAX_NOTE_CHARS:
        line = f"{line[:MAX_NOTE_CHARS - 1]}…"
    try:
        await sink(kind, line)
    except Exception:
        pass
