"""End-user agent selection for channels shared by multiple agents.

When a user enables the same channel on more than one agent, a single
neutral channel instance receives every message and the end user picks
which agent to talk to. The choice is stored per client and channel in
``clients.metadata`` and can be changed at any time with ``/agente``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nanobot.bus.events import InboundMessage
    from nanobot.db.client_repositories import ClientRepository
    from nanobot.db.repositories import AgentRepository

SELECT_COMMANDS = ("/agente", "/agentes")
_SELECTED_KEY = "selected_agent"
_PENDING_KEY = "agent_picker"
_DESCRIPTION_LIMIT = 80


@dataclass
class SelectionDecision:
    """Routing decision for a shared channel: agent to route to, reply to send, or neither."""

    agent_id: str | None = None
    reply: str | None = None


async def list_channel_agents(
    agents: AgentRepository, user_id: str, channel: str,
) -> list[dict[str, Any]]:
    """Return the user's active agents that have this channel enabled."""
    active = await agents.list_agents(user_id, status="active")
    return [
        a for a in active
        if (a.get("channel_configs") or {}).get(channel, {}).get("enabled")
    ]


async def resolve_selection(
    msg: InboundMessage,
    user_id: str,
    client_id: str,
    *,
    agents: AgentRepository,
    clients: ClientRepository,
) -> SelectionDecision:
    """Decide how to route a message on a channel that agents may share.

    Returns a decision with ``agent_id`` set when the message should flow to
    an agent, ``reply`` set when the picker (or a confirmation) should be sent
    back instead, or neither when no agent has the channel enabled and the
    legacy resolution (bindings/default agent) should apply.
    """
    enabled = await list_channel_agents(agents, user_id, msg.channel)
    if not enabled:
        return SelectionDecision()

    client = await clients.get(client_id)
    if client is None:
        return SelectionDecision()

    meta = _load_metadata(client)
    selected = meta.get(_SELECTED_KEY, {}).get(msg.channel)
    pending = meta.get(_PENDING_KEY, {}).get(msg.channel)
    command = msg.content.strip().lower()

    if len(enabled) == 1:
        only = enabled[0]["agent_id"]
        if selected is not None or pending is not None:
            _clear_channel_state(meta, msg.channel)
            await _save_metadata(clients, client_id, meta)
        return SelectionDecision(agent_id=only)

    if command in SELECT_COMMANDS:
        meta.setdefault(_SELECTED_KEY, {}).pop(msg.channel, None)
        await _set_pending(clients, client_id, meta, msg.channel, enabled)
        return SelectionDecision(reply=_build_picker(enabled))

    if command == "/help":
        current = next((a for a in enabled if a["agent_id"] == selected), None)
        return SelectionDecision(reply=_build_help(current))

    enabled_ids = {a["agent_id"] for a in enabled}
    if selected in enabled_ids:
        return SelectionDecision(agent_id=selected)

    if pending is not None:
        options = pending.get("options", [])
        choice = _parse_choice(msg.content, options, enabled)
        if choice in enabled_ids:
            meta.setdefault(_SELECTED_KEY, {})[msg.channel] = choice
            meta.setdefault(_PENDING_KEY, {}).pop(msg.channel, None)
            await _save_metadata(clients, client_id, meta)
            chosen = next(a for a in enabled if a["agent_id"] == choice)
            return SelectionDecision(agent_id=choice, reply=_confirmation(chosen))
        await _set_pending(clients, client_id, meta, msg.channel, enabled)
        return SelectionDecision(
            reply="Não entendi sua escolha.\n\n" + _build_picker(enabled),
        )

    await _set_pending(clients, client_id, meta, msg.channel, enabled)
    return SelectionDecision(
        reply="Antes de continuar, escolha o agente:\n\n" + _build_picker(enabled),
    )


def _load_metadata(client: dict[str, Any]) -> dict[str, Any]:
    raw = client.get("metadata") or "{}"
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    return raw if isinstance(raw, dict) else {}


async def _save_metadata(
    clients: ClientRepository, client_id: str, meta: dict[str, Any],
) -> None:
    await clients.update(client_id, {"metadata": json.dumps(meta, ensure_ascii=False)})


async def _set_pending(
    clients: ClientRepository,
    client_id: str,
    meta: dict[str, Any],
    channel: str,
    enabled: list[dict[str, Any]],
) -> None:
    meta.setdefault(_PENDING_KEY, {})[channel] = {
        "options": [a["agent_id"] for a in enabled],
    }
    await _save_metadata(clients, client_id, meta)


def _clear_channel_state(meta: dict[str, Any], channel: str) -> None:
    meta.get(_SELECTED_KEY, {}).pop(channel, None)
    meta.get(_PENDING_KEY, {}).pop(channel, None)


def _parse_choice(
    content: str, options: list[str], enabled: list[dict[str, Any]],
) -> str | None:
    """Match a reply against the offered options: 1-based number or agent name."""
    text = content.strip().lower()
    if text.isdigit():
        index = int(text) - 1
        return options[index] if 0 <= index < len(options) else None
    by_name = {
        a["name"].strip().lower(): a["agent_id"]
        for a in enabled if a.get("name")
    }
    agent_id = by_name.get(text)
    return agent_id if agent_id in options else None


def _summary(agent: dict[str, Any]) -> str:
    text = (agent.get("role") or "").strip()
    if not text:
        text = (agent.get("description") or "").strip().split("\n")[0]
    if len(text) > _DESCRIPTION_LIMIT:
        text = text[: _DESCRIPTION_LIMIT - 1].rstrip() + "…"
    return text


def _build_picker(enabled: list[dict[str, Any]]) -> str:
    lines = ["Com qual agente você quer falar?", ""]
    for i, agent in enumerate(enabled, start=1):
        summary = _summary(agent)
        lines.append(f"{i}. {agent['name']}" + (f" — {summary}" if summary else ""))
    lines.append("")
    lines.append("Responda com o número ou o nome do agente.")
    return "\n".join(lines)


def _confirmation(agent: dict[str, Any]) -> str:
    summary = _summary(agent)
    intro = f"Agora você está falando com {agent['name']}"
    if summary:
        intro += f" — {summary}"
    return intro + ".\nEnvie sua mensagem. Use /agente para trocar de agente."


def _build_help(current: dict[str, Any] | None) -> str:
    from nanobot.agent.loop import HELP_TEXT

    lines = [HELP_TEXT, "/agente — Trocar de agente"]
    if current is not None:
        lines.append(f"\nVocê está falando com: {current['name']}")
    return "\n".join(lines)
