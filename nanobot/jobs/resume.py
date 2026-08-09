"""Wake the conversation that was waiting on news, and deliver what it said.

Two things stall a conversation and later unstall it: a background job that
finishes, and a person who answers a question the agent could not answer itself.
The mechanism is identical in both cases and it is not a return value — it is a
new turn in the session that got stuck, so the agent picks up with the whole
history still in front of it and carries on.

Keeping this in one place is what stops the two triggers from drifting into two
subtly different notions of "where does this conversation live".
"""

from __future__ import annotations

from typing import Any

from loguru import logger

from nanobot.jobs.delivery import WebPush, deliver_result, text_of


def session_key_of(origin_channel: str, origin_chat_id: str, fallback: str) -> str:
    """The session a turn from this origin lands in.

    Mirrors what the agent loop does with a ``system`` message: it splits the
    chat id back into channel and chat, and rebuilds this exact string.
    """
    return f"{origin_channel}:{origin_chat_id}" if origin_channel else fallback


def delivery_channel(origin_channel: str) -> str:
    """Where the answer goes, which is not where the turn is filed.

    ``web`` and ``system`` are session namespaces, not chat channels: a routine
    fires under ``system`` and its answer still belongs in the panel. Only a real
    chat channel routes through the outbound bus.
    """
    return "" if origin_channel in ("", "system", "web") else origin_channel


async def resume_conversation(
    *,
    agent: Any,
    bus: Any,
    repos: Any,
    push_web: WebPush | None,
    user_id: str,
    agent_id: str,
    origin_channel: str,
    origin_chat_id: str,
    message: str,
    ref: str,
    audit_event: str = "",
    audit_detail: dict[str, Any] | None = None,
) -> str:
    """Run a system turn carrying ``message``, then deliver the agent's answer.

    Returns the delivered text, empty when the turn failed — a failure here is
    logged and swallowed, because the caller is usually a background task with
    nobody to raise to.
    """
    session_key = session_key_of(origin_channel, origin_chat_id, f"resume:{ref}")
    try:
        response = await agent.process_direct(
            message,
            session_key=session_key,
            channel="system",
            chat_id=f"{origin_channel}:{origin_chat_id}",
            user_id=user_id,
            agent_id=agent_id or None,
        )
    except Exception as e:
        logger.exception("Retomada de {} falhou: {}", ref, e)
        return ""

    await _audit(repos, user_id, audit_event, audit_detail)
    text = text_of(response)
    await deliver_result(
        bus=bus, push_web=push_web,
        user_id=user_id, agent_id=agent_id,
        channel=delivery_channel(origin_channel), to=origin_chat_id,
        session_key=session_key, ref=ref, text=text,
    )
    return text


async def _audit(
    repos: Any, user_id: str, event: str, detail: dict[str, Any] | None,
) -> None:
    audit = getattr(repos, "audit", None)
    if not audit or not event or not user_id:
        return
    try:
        await audit.log(user_id, event, detail or {})
    except Exception as e:
        logger.warning("Retomada: falha ao auditar {}: {}", event, e)
