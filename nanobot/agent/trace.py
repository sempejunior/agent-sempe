"""Optional execution trace of one agent turn, for debugging what it actually did.

The loop knows everything worth seeing — the prompt it assembled, the model's
reasoning, every tool call with its arguments, every result — and none of it left
the process. A ``tool_hint`` chip says ``http_call("gitlab")``; it does not say
which endpoint, with which body, and what came back. Debugging a wrong answer
meant reading gateway logs and guessing.

The sink lives in a ``ContextVar`` so nothing has to be threaded through the call
chain: whoever runs the turn installs a sink for its duration, and with no sink
installed ``emit`` is a variable read and a return. Events are fire-and-forget —
a failing sink must never take the turn down with it.

What the trace shows is what the model saw. Tool results can contain whatever an
API returned, so a trace is as sensitive as the conversation it belongs to and
goes only to the session that asked for it.
"""

from __future__ import annotations

import contextvars
from collections.abc import Awaitable, Callable
from typing import Any

TraceSink = Callable[[dict[str, Any]], Awaitable[None]]

_sink: contextvars.ContextVar[TraceSink | None] = contextvars.ContextVar(
    "nanobot_trace_sink", default=None,
)

MAX_TEXT_CHARS = 12_000
"""Cap per field. A system prompt runs tens of thousands of chars and the point
is to read it, not to ship the whole context window on every iteration."""


def install(sink: TraceSink | None) -> contextvars.Token:
    """Route trace events to *sink* until the token is reset."""
    return _sink.set(sink)


def reset(token: contextvars.Token) -> None:
    _sink.reset(token)


def enabled() -> bool:
    return _sink.get() is not None


def clip(value: Any, limit: int = MAX_TEXT_CHARS) -> str:
    """Text for the trace, marked when cut so nobody reads a truncation as the end."""
    text = value if isinstance(value, str) else str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n… [cortado, {len(text)} caracteres no total]"


async def emit(kind: str, **fields: Any) -> None:
    """Send one trace event, if anyone is listening.

    Never raises: a broken sink is a debugging problem, not a reason to lose the
    turn the user is waiting for.
    """
    sink = _sink.get()
    if sink is None:
        return
    try:
        await sink({"kind": kind, **fields})
    except Exception:
        pass
