"""Client resolution — maps inbound messages to client identities."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from nanobot.bus.events import InboundMessage
    from nanobot.db.client_repositories import (
        ClientIdentityRepository,
        ClientMemoryRepository,
        ClientRepository,
    )


def _extract_external_id(msg: InboundMessage) -> str | None:
    """Extract the external user identifier from an inbound message.

    For most channels the sender_id is the external identity.  For web/CLI
    channels where everyone shares the same sender_id, there's nothing to
    resolve — return None.
    """
    if msg.channel in ("web", "cli", "system"):
        return None
    return msg.sender_id or None


async def resolve_client(
    msg: InboundMessage,
    owner_id: str,
    *,
    clients: ClientRepository,
    identities: ClientIdentityRepository,
    client_memories: ClientMemoryRepository,
) -> str | None:
    """Resolve (or auto-create) a client_id from an inbound message.

    Returns the client_id or None when the message doesn't carry enough
    identity information (e.g. web/CLI channels).
    """
    external_id = _extract_external_id(msg)
    if not external_id:
        return None

    existing = await identities.lookup(owner_id, msg.channel, external_id)
    if existing:
        await clients.touch(existing)
        return existing

    client_id = str(uuid.uuid4())
    display_name = msg.metadata.get("sender_name", "") if msg.metadata else ""

    try:
        await clients.create({
            "client_id": client_id,
            "owner_id": owner_id,
            "display_name": display_name,
        })
        await identities.create({
            "client_id": client_id,
            "owner_id": owner_id,
            "channel": msg.channel,
            "external_id": external_id,
            "display_name": display_name,
        })
    except Exception:
        retry = await identities.lookup(owner_id, msg.channel, external_id)
        if retry:
            await clients.touch(retry)
            return retry
        raise

    logger.info(
        "Auto-created client {} for {}:{} (owner={})",
        client_id, msg.channel, external_id, owner_id,
    )
    return client_id
