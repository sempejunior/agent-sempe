"""Where the result of an unwatched turn goes.

A scheduled routine and a background job both end with text and nobody on the
other end of a request. Deciding where that text goes is the same problem in both
cases — a live panel socket when the work came from the web, otherwise the chat
channel that asked — and it is the piece with enough branching to be worth one
implementation instead of two that drift.

Delivery is best-effort by design: the turn is already persisted in its session,
which is the record. A closed socket loses the nudge, not the work.
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

WebPush = Callable[..., Awaitable[None]]
"""Push text into a user's live panel sockets. Keyword arguments; see callers."""


async def deliver_result(
    *,
    bus: Any,
    push_web: WebPush | None,
    user_id: str,
    agent_id: str,
    channel: str,
    to: str,
    session_key: str,
    ref: str,
    text: str,
) -> None:
    """Route ``text`` to the panel or to the chat channel that asked for it."""
    if not text.strip():
        return
    if (not channel or channel == "web") and user_id:
        if push_web:
            await push_web(user_id=user_id, session_key=session_key, ref=ref, text=text)
        return
    if not channel or not to:
        return
    from nanobot.bus.events import OutboundMessage
    await bus.publish_outbound(OutboundMessage(
        channel=channel,
        chat_id=to,
        content=text,
        metadata={"_owner_id": user_id, "_agent_id": agent_id},
    ))


def text_of(response: Any) -> str:
    """The delivered text, whether the loop returned a message or a string."""
    content = getattr(response, "content", None)
    if content:
        return str(content)
    if response is None:
        return ""
    if isinstance(response, (dict, list)):
        return json.dumps(response, ensure_ascii=False)
    return str(response)
